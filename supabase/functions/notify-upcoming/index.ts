/**
 * Edge Function: notify-upcoming
 * ------------------------------------------------------------------------
 * Pre-match reminder fan-out (Phase E, server side). The client schedules the
 * signed-in user's own reminders as local notifications, but that only reaches
 * *their* device. This function delivers REMOTE push to everyone who cares about
 * a match that's about to start — even if their app is closed:
 *
 *   • players in the match        → "⏰ You play in 1 hour — RED vs BLU"
 *   • the assigned scorer         → "🎯 You're scoring RED vs BLU"
 *   • followers of a playing player → "⭐ Rohit Sharma plays in 1 hour"
 *
 * …a day / an hour / 15 minutes before kickoff. A `reminder_sends` ledger makes
 * each (match, lead, recipient, kind) fire exactly once regardless of cron cadence.
 *
 * Schedule it every ~5 minutes (Dashboard → Database → Cron, or pg_cron):
 *   select cron.schedule(
 *     'notify-upcoming', '*∕5 * * * *',
 *     $$ select net.http_post(
 *          url     := 'https://<PROJECT_REF>.functions.supabase.co/notify-upcoming',
 *          headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>')
 *        ) $$
 *   );
 *
 * Only the cron job may call this (migration 0025): it must send either
 * `Authorization: Bearer <SERVICE_ROLE_KEY>` (as in the snippet above) or
 * `x-cron-secret: <CRON_SECRET>`. Anything else is refused.
 *
 * Deploy:  supabase functions deploy notify-upcoming
 * Secrets: optional CRON_SECRET; SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are
 *          injected automatically.
 *
 * NOTE: mirrors the lead times + copy of src/data/reminders.ts. Reminder lead
 * times here are the defaults; a future enhancement can read per-user prefs and
 * Tournament.reminderLeadMinutes once those are persisted server-side.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { safeEqual } from '../_shared/guard.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const MIN = 60_000;
const LEADS = [
  { key: '1d', ms: 1440 * MIN, label: 'tomorrow' },
  { key: '1h', ms: 60 * MIN, label: 'in 1 hour' },
  { key: '15m', ms: 15 * MIN, label: 'in 15 min' },
];
// Slack after a lead's exact time in which it still counts as "freshly due", so a
// ~5-min cron never misses a window (and the ledger stops it firing twice).
const DUE_WINDOW_MS = 10 * MIN;

type Kind = 'player' | 'follower' | 'scorer';
interface Target { profileId: string; kind: Kind; leadKey: string; matchId: string; title: string; body: string; playerId: string }

const idsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

/** Only the scheduler: the service-role bearer, or the optional cron secret. */
function isCron(req: Request): boolean {
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (SERVICE_ROLE_KEY && bearer && safeEqual(bearer, SERVICE_ROLE_KEY)) return true;
  const cron = req.headers.get('x-cron-secret') ?? '';
  return !!CRON_SECRET && !!cron && safeEqual(cron, CRON_SECRET);
}

Deno.serve(async (req) => {
  if (!isCron(req)) return new Response('forbidden', { status: 403 });
  const now = Date.now();
  const nowISO = new Date(now).toISOString();
  const horizonISO = new Date(now + LEADS[0].ms + DUE_WINDOW_MS).toISOString();

  // 1) Scheduled matches close enough that some lead window is (or just became) due.
  const { data: matches } = await supabase
    .from('matches')
    .select('id, starts_at, scorer_id, scorer_ids, home_team_id, away_team_id')
    .eq('status', 'scheduled')
    .gt('starts_at', nowISO)
    .lte('starts_at', horizonISO);
  if (!matches?.length) return json({ due: 0, sent: 0 });

  // Only the (match, lead) pairs whose fire time has arrived within the slack window.
  const dueMatches = matches
    .map((m) => {
      const start = new Date(m.starts_at as string).getTime();
      const leads = LEADS.filter((l) => {
        const fireAt = start - l.ms;
        return fireAt <= now && now - fireAt <= DUE_WINDOW_MS;
      });
      return { m, start, leads };
    })
    .filter((x) => x.leads.length);
  if (!dueMatches.length) return json({ due: 0, sent: 0 });

  // 2) Resolve teams (names) and rosters/squads for the due matches.
  const matchIds = dueMatches.map((x) => x.m.id as string);
  const teamIds = [...new Set(dueMatches.flatMap((x) => [x.m.home_team_id, x.m.away_team_id]).filter(Boolean) as string[])];

  const [{ data: teams }, { data: squads }, { data: members }] = await Promise.all([
    supabase.from('teams').select('id, name, short_name').in('id', teamIds),
    supabase.from('match_squads').select('match_id, side, starters, subs').in('match_id', matchIds),
    supabase.from('team_members').select('team_id, player_id').in('team_id', teamIds),
  ]);
  const teamById = new Map((teams ?? []).map((t) => [t.id, t]));
  const rosterByTeam = new Map<string, string[]>();
  for (const r of members ?? []) rosterByTeam.set(r.team_id as string, [...(rosterByTeam.get(r.team_id as string) ?? []), r.player_id as string]);
  const squadByMatchSide = new Map<string, string[]>();
  for (const s of squads ?? []) squadByMatchSide.set(`${s.match_id}:${s.side}`, [...idsOf(s.starters), ...idsOf(s.subs)]);

  const playersInSide = (matchId: string, teamId: string | null, side: 'home' | 'away'): string[] => {
    const sq = squadByMatchSide.get(`${matchId}:${side}`);
    if (sq?.length) return sq;
    return teamId ? rosterByTeam.get(teamId) ?? [] : [];
  };

  // Scorers are stored as PLAYER ids (scorer_ids, or the legacy single scorer_id).
  const scorerIdsOf = (m: Record<string, unknown>): string[] =>
    ((m.scorer_ids as string[] | null)?.length ? (m.scorer_ids as string[]) : (m.scorer_id ? [m.scorer_id as string] : []));

  // 3) Build the desired notifications (player + scorer + follower) per due (match, lead).
  const allPlayerIds = new Set<string>();
  const perMatch = dueMatches.map(({ m, leads }) => {
    const home = playersInSide(m.id as string, m.home_team_id as string | null, 'home');
    const away = playersInSide(m.id as string, m.away_team_id as string | null, 'away');
    [...home, ...away].forEach((p) => allPlayerIds.add(p));
    // Scorers need a profile lookup too (to push to their account).
    scorerIdsOf(m).forEach((sid) => allPlayerIds.add(sid));
    return { m, leads, playing: new Set([...home, ...away]) };
  });

  // Player id → { profileId, fullName }; and followers of each player.
  const [{ data: players }, { data: follows }] = await Promise.all([
    supabase.from('players').select('id, profile_id, full_name').in('id', [...allPlayerIds]),
    supabase.from('follows').select('follower_id, target_id').eq('target_type', 'player').in('target_id', [...allPlayerIds]),
  ]);
  const playerById = new Map((players ?? []).map((p) => [p.id, p]));
  const followersByPlayer = new Map<string, string[]>();
  for (const f of follows ?? []) followersByPlayer.set(f.target_id as string, [...(followersByPlayer.get(f.target_id as string) ?? []), f.follower_id as string]);

  const targets: Target[] = [];
  for (const { m, leads, playing } of perMatch) {
    const homeT = teamById.get(m.home_team_id as string);
    const awayT = teamById.get(m.away_team_id as string);
    const label = `${homeT?.short_name ?? 'Home'} vs ${awayT?.short_name ?? 'Away'}`;
    for (const lead of leads) {
      for (const pid of playing) {
        const player = playerById.get(pid);
        if (!player) continue;
        // player themselves
        if (player.profile_id) {
          targets.push({ profileId: player.profile_id as string, kind: 'player', leadKey: lead.key, matchId: m.id as string, playerId: pid, title: `⏰ You play ${lead.label} — ${label}`, body: `You're in this match. Tap for details.` });
        }
        // their followers
        for (const followerId of followersByPlayer.get(pid) ?? []) {
          if (followerId === player.profile_id) continue; // don't double-notify the player
          targets.push({ profileId: followerId, kind: 'follower', leadKey: lead.key, matchId: m.id as string, playerId: pid, title: `⭐ ${player.full_name} plays ${lead.label}`, body: `${player.full_name} is in ${label}.` });
        }
      }
      // the assigned scorer(s) (skip the 15m lead — matches the client's 1d/1h scorer
      // windows). scorer_ids hold PLAYER ids → map each to its profile to push.
      if (lead.key !== '15m') {
        for (const sid of scorerIdsOf(m)) {
          const sp = playerById.get(sid);
          if (!sp?.profile_id) continue;
          targets.push({ profileId: sp.profile_id as string, kind: 'scorer', leadKey: lead.key, matchId: m.id as string, playerId: sid, title: `🎯 You're scoring ${label}`, body: `Get ready to score — starts ${lead.label}.` });
        }
      }
    }
  }
  if (!targets.length) return json({ due: dueMatches.length, sent: 0 });

  // 4) Drop anything already sent (idempotency across cron runs).
  const { data: already } = await supabase
    .from('reminder_sends')
    .select('match_id, lead_key, recipient_id, kind')
    .in('match_id', matchIds);
  const sentKey = (t: { match_id?: string; matchId?: string; lead_key?: string; leadKey?: string; recipient_id?: string; profileId?: string; kind: string }) =>
    `${t.match_id ?? t.matchId}:${t.lead_key ?? t.leadKey}:${t.recipient_id ?? t.profileId}:${t.kind}`;
  const alreadySet = new Set((already ?? []).map(sentKey));
  const fresh = targets.filter((t) => !alreadySet.has(sentKey(t)));
  if (!fresh.length) return json({ due: dueMatches.length, sent: 0 });

  // 5) Record first (so a concurrent run won't re-send), then push to their tokens.
  await supabase.from('reminder_sends').upsert(
    fresh.map((t) => ({ match_id: t.matchId, lead_key: t.leadKey, recipient_id: t.profileId, kind: t.kind })),
    { onConflict: 'match_id,lead_key,recipient_id,kind', ignoreDuplicates: true },
  );

  const recipientIds = [...new Set(fresh.map((t) => t.profileId))];
  const { data: tokens } = await supabase.from('push_tokens').select('profile_id, token').in('profile_id', recipientIds);
  const tokensByProfile = new Map<string, string[]>();
  for (const row of tokens ?? []) tokensByProfile.set(row.profile_id as string, [...(tokensByProfile.get(row.profile_id as string) ?? []), row.token as string]);

  const messages = fresh.flatMap((t) =>
    (tokensByProfile.get(t.profileId) ?? []).map((to) => ({
      to, sound: 'default', title: t.title, body: t.body,
      data: { matchId: t.matchId, playerId: t.playerId || undefined },
    })),
  );
  if (messages.length) await sendExpoPush(messages);

  return json({ due: dueMatches.length, targets: targets.length, fresh: fresh.length, pushed: messages.length });
});

/** Expo caps a push request at 100 messages; batch accordingly. */
async function sendExpoPush(messages: unknown[]): Promise<void> {
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch),
    });
  }
}

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
