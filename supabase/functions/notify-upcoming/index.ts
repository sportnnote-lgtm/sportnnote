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
 * EMAIL (2026-10-07): players and scorers also get ONE email per match — at the
 * day-before window, or the hour-before window if the match was scheduled less
 * than a day ahead. Web users (most iPhone pilot users) can't receive push, so
 * email is their reminder. Followers get push only.
 *
 * PREFERENCES: `user_reminder_prefs.lead_minutes` (Settings → reminders). An
 * empty list = reminders off (no push, no email). Otherwise push fires only for
 * the 1d/1h/15m windows the user kept; email follows the rule above.
 *
 * Testing: POST { "dry": true, "now": "<ISO time>" } returns who WOULD be
 * reminded at that moment, without sending or recording anything.
 *
 * NOTE: mirrors the lead times + copy of src/data/reminders.ts.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { safeEqual, sendEmail } from '../_shared/guard.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const MIN = 60_000;
const LEADS = [
  { key: '1d', ms: 1440 * MIN, minutes: 1440, label: 'tomorrow' },
  { key: '1h', ms: 60 * MIN, minutes: 60, label: 'in 1 hour' },
  { key: '15m', ms: 15 * MIN, minutes: 15, label: 'in 15 min' },
];
const MINUTES_BY_LEAD = new Map(LEADS.map((l) => [l.key, l.minutes]));
const APP_URL = 'https://app.sportnnote.in';
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
  const opts = await req.json().catch(() => ({})) as { dry?: boolean; now?: string };
  const dry = opts.dry === true;
  // A simulated clock is only honoured in dry runs.
  const now = dry && opts.now && !Number.isNaN(Date.parse(opts.now)) ? Date.parse(opts.now) : Date.now();
  const nowISO = new Date(now).toISOString();
  const horizonISO = new Date(now + LEADS[0].ms + DUE_WINDOW_MS).toISOString();

  // 1) Scheduled matches close enough that some lead window is (or just became) due.
  const { data: matches } = await supabase
    .from('matches')
    .select('id, sport, starts_at, venue_name, tournament_id, scorer_id, scorer_ids, home_team_id, away_team_id')
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

  // Reminder preferences + display time zones of everyone involved.
  const everyone = [...new Set(targets.map((t) => t.profileId))];
  const [{ data: prefs }, { data: profs }] = await Promise.all([
    supabase.from('user_reminder_prefs').select('profile_id, lead_minutes').in('profile_id', everyone),
    supabase.from('profiles').select('id, time_zone').in('id', everyone),
  ]);
  const leadsByProfile = new Map((prefs ?? []).map((p) => [p.profile_id as string, (p.lead_minutes as number[] | null) ?? []]));
  const tzByProfile = new Map((profs ?? []).map((p) => [p.id as string, (p.time_zone as string | null) || 'Asia/Kolkata']));
  const remindersOff = (pid: string) => leadsByProfile.has(pid) && leadsByProfile.get(pid)!.length === 0;
  const wantsLead = (pid: string, leadKey: string) =>
    !leadsByProfile.has(pid) || leadsByProfile.get(pid)!.includes(MINUTES_BY_LEAD.get(leadKey) ?? -1);

  // One push per (match, lead, recipient): someone can be a player, a scorer AND a
  // follower of a team-mate in the same match. Scorer > player > follower wins; the
  // ledger still records every kind so none of them fires later.
  const RANK: Record<Kind, number> = { scorer: 0, player: 1, follower: 2 };
  const groups = new Map<string, Target[]>();
  for (const t of targets) {
    if (alreadySet.has(sentKey(t)) || !wantsLead(t.profileId, t.leadKey)) continue;
    const k = `${t.matchId}:${t.leadKey}:${t.profileId}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const pushTargets = [...groups.values()].map((g) => [...g].sort((a, b) => RANK[a.kind] - RANK[b.kind])[0]);
  const pushLedger = new Map<string, Target>();
  for (const g of groups.values()) for (const t of g) pushLedger.set(sentKey(t), t);

  // One email per (match, recipient): players/scorers, at 1d — or 1h if 1d never
  // happened (match scheduled < a day ahead). Scorer wording wins (action needed).
  const emailByKey = new Map<string, Target>();
  for (const t of targets) {
    if (t.kind === 'follower' || (t.leadKey !== '1d' && t.leadKey !== '1h') || remindersOff(t.profileId)) continue;
    const k = `${t.matchId}:${t.profileId}`;
    if (alreadySet.has(`${t.matchId}:email:${t.profileId}:player`) || alreadySet.has(`${t.matchId}:email:${t.profileId}:scorer`)) continue;
    const prev = emailByKey.get(k);
    if (!prev || (t.kind === 'scorer' && prev.kind !== 'scorer')) emailByKey.set(k, t);
  }
  const emailTargets = [...emailByKey.values()];

  const matchById = new Map(dueMatches.map(({ m }) => [m.id as string, m]));
  const tournamentIds = [...new Set(emailTargets.map((t) => matchById.get(t.matchId)?.tournament_id).filter(Boolean) as string[])];
  const { data: tours } = tournamentIds.length
    ? await supabase.from('tournaments').select('id, name').in('id', tournamentIds)
    : { data: [] as { id: string; name: string }[] };
  const tourName = new Map((tours ?? []).map((t) => [t.id as string, t.name as string]));

  const emails = emailTargets.map((t) => {
    const m = matchById.get(t.matchId)!;
    const homeT = teamById.get(m.home_team_id as string);
    const awayT = teamById.get(m.away_team_id as string);
    const vs = `${homeT?.name ?? homeT?.short_name ?? 'Home'} vs ${awayT?.name ?? awayT?.short_name ?? 'Away'}`;
    const when = new Intl.DateTimeFormat('en-IN', {
      timeZone: tzByProfile.get(t.profileId) ?? 'Asia/Kolkata',
      weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    }).format(new Date(m.starts_at as string));
    const tour = m.tournament_id ? tourName.get(m.tournament_id as string) : undefined;
    const lead = LEADS.find((l) => l.key === t.leadKey)!;
    const subject = t.kind === 'scorer' ? `🎯 You're scoring ${vs} — ${when}` : `⏰ You play ${lead.label}: ${vs} — ${when}`;
    const text = [
      t.kind === 'scorer' ? `You're the scorer for ${vs}.` : `You're playing in ${vs}.`,
      '',
      `When:  ${when}`,
      m.venue_name ? `Where: ${m.venue_name}` : '',
      tour ? `Event: ${tour}` : '',
      '',
      t.kind === 'scorer'
        ? `Open SportnNote a few minutes early to start scoring: ${APP_URL}`
        : `See the match in SportnNote: ${APP_URL}`,
      '',
      '—',
      'You get this because you are in this match. To stop reminders: SportnNote → Settings → Match reminders → remove all timers.',
    ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
    return { t, subject, text };
  });

  if (dry) {
    return json({
      dry: true, at: new Date(now).toISOString(), due: dueMatches.length,
      push: pushTargets.map((t) => ({ match: t.matchId, lead: t.leadKey, kind: t.kind, to: t.profileId.slice(0, 8), title: t.title })),
      email: emails.map((e) => ({ match: e.t.matchId, lead: e.t.leadKey, kind: e.t.kind, to: e.t.profileId.slice(0, 8), subject: e.subject })),
    });
  }
  if (!pushTargets.length && !emails.length) return json({ due: dueMatches.length, sent: 0 });

  // 5) Record first (so a concurrent run won't re-send), then deliver.
  const ledger = [
    ...[...pushLedger.values()].map((t) => ({ match_id: t.matchId, lead_key: t.leadKey, recipient_id: t.profileId, kind: t.kind })),
    ...emails.map(({ t }) => ({ match_id: t.matchId, lead_key: 'email', recipient_id: t.profileId, kind: t.kind })),
  ];
  await supabase.from('reminder_sends').upsert(ledger, { onConflict: 'match_id,lead_key,recipient_id,kind', ignoreDuplicates: true });

  const recipientIds = [...new Set(pushTargets.map((t) => t.profileId))];
  const { data: tokens } = recipientIds.length
    ? await supabase.from('push_tokens').select('profile_id, token').in('profile_id', recipientIds)
    : { data: [] as { profile_id: string; token: string }[] };
  const tokensByProfile = new Map<string, string[]>();
  for (const row of tokens ?? []) tokensByProfile.set(row.profile_id as string, [...(tokensByProfile.get(row.profile_id as string) ?? []), row.token as string]);

  const messages = pushTargets.flatMap((t) =>
    (tokensByProfile.get(t.profileId) ?? []).map((to) => ({
      to, sound: 'default', title: t.title, body: t.body,
      data: { matchId: t.matchId, playerId: t.playerId || undefined },
    })),
  );
  if (messages.length) await sendExpoPush(messages);

  // Email: the login address of each recipient (auth.users).
  let emailed = 0;
  for (const e of emails) {
    const { data } = await supabase.auth.admin.getUserById(e.t.profileId);
    const user = data?.user;
    if (!user?.email || user.deleted_at) continue;
    const to = user.email;
    if (await sendEmail(to, e.subject, e.text)) emailed++;
  }

  return json({ due: dueMatches.length, targets: targets.length, pushed: messages.length, emailed });
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
