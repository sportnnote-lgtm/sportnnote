/**
 * Edge Function: notify-followers
 * ------------------------------------------------------------------------
 * Production push path. The in-app feed + local notification work client-side
 * today; for REMOTE delivery (alerting a parent whose app is closed) a server
 * must call Expo's Push API. This function does that.
 *
 * Wire it up with a Database Webhook (Dashboard → Database → Webhooks):
 *   table: stat_lines · events: INSERT, UPDATE · type: Supabase Edge Function
 *
 * On each stat-line change it:
 *   0. diffs the new row against `old_record` and stops unless a HEADLINE stat
 *      (goals, runs, wickets, points…) went UP — so a post-match correction or a
 *      completion sync (rows rewritten, values lowered or unchanged) pushes nothing,
 *   1. loads the player + what went up,
 *   2. finds everyone following that player,
 *   3. collects their push tokens,
 *   4. sends a batch to https://exp.host/--/api/v2/push/send.
 *
 * Only the database webhook may call this (migration 0025): it must send the
 * header `x-webhook-secret: <WEBHOOK_SECRET>` (add it under the webhook's HTTP
 * Headers). Without the secret configured the function refuses every call, so a
 * stranger can't push fake "stat" alerts to a player's followers.
 *
 * MATCH STATUS (CricHeroes parity #23) — the same function is also called by the
 * `match_status_notify` DB trigger (migration 20261019122300_follow_prefs.sql),
 * NOT by a `matches` UPDATE webhook (that would fire on every scored ball, since
 * each ball rewrites matches.state). The trigger fires only when `status` actually
 * changes and posts `{ type: 'match_status', record, old_record: { status } }`
 * with the same `x-webhook-secret` header. Transitions:
 *   → live (from anything but completed) = 'start'   "🔴 RED vs BLU is live"
 *   → completed                          = 'result'  "Full time — RED vs BLU"
 * Recipients: followers of both teams, of the tournament, and of the players in
 * the match (match_squads, falling back to team_members) — filtered by each
 * follow's alert choices (follows.prefs), de-duplicated per profile, and recorded
 * in `reminder_sends` (lead_key = 'start' | 'result', kind = 'follower') so a
 * repeated transition never double-sends.
 * Trigger setup (founder, once): store two Vault secrets —
 *   select vault.create_secret('https://<ref>.supabase.co/functions/v1/notify-followers', 'notify_followers_url');
 *   select vault.create_secret('<same value as WEBHOOK_SECRET>', 'webhook_secret');
 * and optionally 'functions_anon_key' (the public anon key, for the gateway's JWT
 * check). Until both are set the trigger posts nothing.
 *
 * ALERT CHOICES: a follower whose follows.prefs has `scores: false` gets no stat
 * pushes; `start: false` / `result: false` skip the status pushes. Before the
 * migration the prefs column is absent → the select falls back and everyone gets
 * everything.
 *
 * Deploy:  supabase functions deploy notify-followers
 * Secrets: WEBHOOK_SECRET (set it: supabase secrets set WEBHOOK_SECRET=<random>);
 *          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are injected automatically.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { safeEqual } from '../_shared/guard.ts';
import { webPushToProfiles } from '../_shared/webpush.ts';

const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? '';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Stats worth a push when they go up. Everything else (shots, balls faced…) is
// detail for the profile, not an alert.
const HEADLINE = new Set([
  'goals', 'assists', 'runs', 'wickets', 'catches', 'points', 'raidPoints', 'tacklePoints',
  'aces', 'blocks', 'birdies', 'eagles', 'queens', 'fifties', 'hundreds',
]);

type AlertKey = 'reminder' | 'start' | 'result' | 'scores' | 'award';
type Prefs = Partial<Record<AlertKey, boolean>> | null | undefined;
type TargetType = 'player' | 'team' | 'tournament';
interface FollowRow { follower_id: string; target_type?: TargetType; target_id?: string; prefs?: Prefs }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Followers of the given targets, with their alert choices when the column exists. */
async function followersOf(targetType: TargetType, ids: string[]): Promise<FollowRow[]> {
  if (!ids.length) return [];
  const q = (cols: string) => supabase.from('follows').select(cols).eq('target_type', targetType).in('target_id', ids);
  const withPrefs = await q('follower_id, target_type, target_id, prefs');
  if (!withPrefs.error) return (withPrefs.data ?? []) as unknown as FollowRow[];
  // Pre-migration: no prefs column → everyone wants everything.
  const plain = await q('follower_id, target_type, target_id');
  return (plain.data ?? []) as unknown as FollowRow[];
}

const wants = (p: Prefs, key: AlertKey) => p?.[key] !== false;

/** Expo push + web push to every device of these profiles. */
async function sendToProfiles(
  ids: string[],
  title: string,
  body: string,
  data: { url: string } & Record<string, unknown>,
): Promise<{ sent: number; web: number }> {
  const unique = [...new Set(ids)];
  if (!unique.length) return { sent: 0, web: 0 };
  // Web push (iPhone Home Screen app, browsers).
  const web = await webPushToProfiles(unique, { title, body, url: data.url });
  const { data: tokens } = await supabase.from('push_tokens').select('token').in('profile_id', unique);
  if (!tokens?.length) return { sent: 0, web };
  const messages = tokens.map((t) => ({ to: t.token, sound: 'default', title, body, data }));
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  return { sent: messages.length, web };
}

interface MatchRecord {
  id: string;
  status: string;
  sport: string;
  tournament_id: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  winner: 'home' | 'away' | 'draw' | null;
  result?: { kind?: string } | null;
}

const idsOf = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : (x as { id?: string })?.id)).filter((x): x is string => !!x) : [];

async function handleMatchStatus(record: MatchRecord, oldStatus: string | null | undefined): Promise<Response> {
  if (!record?.id || record.status === oldStatus) return json({ skipped: 'no change' });
  const key: AlertKey | null =
    record.status === 'completed' ? 'result'
    : record.status === 'live' && oldStatus !== 'completed' ? 'start'
    : null;
  if (!key) return json({ skipped: `transition ${oldStatus}→${record.status}` });

  const teamIds = [record.home_team_id, record.away_team_id].filter((x): x is string => !!x);
  const [{ data: teams }, { data: tourney }, { data: squads }] = await Promise.all([
    teamIds.length ? supabase.from('teams').select('id, name, short_name').in('id', teamIds) : Promise.resolve({ data: [] as { id: string; name: string; short_name: string | null }[] }),
    record.tournament_id ? supabase.from('tournaments').select('name').eq('id', record.tournament_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('match_squads').select('side, starters, subs').eq('match_id', record.id),
  ]);
  const teamById = new Map((teams ?? []).map((t) => [t.id, t]));
  const short = (id: string | null, fallback: string) => {
    const t = id ? teamById.get(id) : undefined;
    return (t?.short_name || t?.name || fallback) as string;
  };
  const home = short(record.home_team_id, 'Home');
  const away = short(record.away_team_id, 'Away');

  // Players in the match: the match squads, else the team rosters.
  let playerIds = (squads ?? []).flatMap((s) => [...idsOf(s.starters), ...idsOf(s.subs)]);
  if (!playerIds.length && teamIds.length) {
    const { data: members } = await supabase.from('team_members').select('player_id').in('team_id', teamIds);
    playerIds = (members ?? []).map((m) => m.player_id as string);
  }

  const [teamF, tourF, playerF] = await Promise.all([
    followersOf('team', teamIds),
    followersOf('tournament', record.tournament_id ? [record.tournament_id] : []),
    followersOf('player', [...new Set(playerIds)]),
  ]);
  // Filter by each follow's choice, then de-dupe per profile: a profile gets the
  // alert if ANY of its follows touching this match wants it.
  const recipients = [...new Set([...teamF, ...tourF, ...playerF].filter((f) => wants(f.prefs, key)).map((f) => f.follower_id))];
  if (!recipients.length) return json({ key, sent: 0, recipients: 0 });

  // Ledger: one start + one result per (match, profile), ever.
  const { data: already } = await supabase
    .from('reminder_sends')
    .select('recipient_id')
    .eq('match_id', record.id)
    .eq('lead_key', key)
    .eq('kind', 'follower')
    .in('recipient_id', recipients);
  const done = new Set((already ?? []).map((r) => r.recipient_id as string));
  const fresh = recipients.filter((id) => !done.has(id));
  if (!fresh.length) return json({ key, sent: 0, recipients: 0, duplicate: true });
  // Claim first (ignoreDuplicates) so a concurrent call can't double-send.
  const { data: claimed } = await supabase
    .from('reminder_sends')
    .upsert(fresh.map((recipient_id) => ({ match_id: record.id, lead_key: key, recipient_id, kind: 'follower' })),
      { onConflict: 'match_id,lead_key,recipient_id,kind', ignoreDuplicates: true })
    .select('recipient_id');
  const toSend = claimed ? (claimed as { recipient_id: string }[]).map((r) => r.recipient_id) : fresh;

  const label = `${home} vs ${away}`;
  const sport = record.sport ? record.sport[0].toUpperCase() + record.sport.slice(1) : 'Match';
  let title: string;
  let body: string;
  if (key === 'start') {
    title = `🔴 ${label} is live`;
    body = tourney?.name ? `${sport} · ${tourney.name}` : sport;
  } else {
    title = `Full time — ${label}`;
    body = record.winner === 'home' ? `${home} won`
      : record.winner === 'away' ? `${away} won`
      : record.winner === 'draw' ? 'Match drawn'
      : record.result?.kind ? 'No result' : 'Match ended';
  }
  const out = await sendToProfiles(toSend, title, body, { url: `/m/${record.id}`, matchId: record.id });
  return json({ key, recipients: toSend.length, ...out });
}

interface StatLineRecord {
  player_id: string;
  sport: string;
  stats: Record<string, number>;
  opponent: string | null;
  /** stat_lines.match_id — opens the match on tap (web push) */
  match_id?: string | null;
}

Deno.serve(async (req) => {
  if (!WEBHOOK_SECRET) return new Response('WEBHOOK_SECRET not configured', { status: 503 });
  if (!safeEqual(req.headers.get('x-webhook-secret') ?? '', WEBHOOK_SECRET)) {
    return new Response('forbidden', { status: 403 });
  }
  const payload = (await req.json()) as
    | { type: 'match_status'; record: MatchRecord; old_record?: { status?: string | null } | null }
    | { type?: string; record: StatLineRecord; old_record?: StatLineRecord | null };
  if (payload.type === 'match_status') {
    const p = payload as { record: MatchRecord; old_record?: { status?: string | null } | null };
    return handleMatchStatus(p.record, p.old_record?.status);
  }
  const { record, old_record } = payload as { record: StatLineRecord; old_record?: StatLineRecord | null };
  if (!record?.player_id) return new Response('no record', { status: 200 });

  // 0) only headline stats that INCREASED (an INSERT has no old_record → all count)
  const before = old_record?.stats ?? {};
  const rose = Object.entries(record.stats ?? {})
    .filter(([k, v]) => HEADLINE.has(k) && (Number(v) || 0) > (Number(before[k]) || 0));
  if (rose.length === 0) return new Response('no headline increase', { status: 200 });

  // 1) player name
  const { data: player } = await supabase
    .from('players')
    .select('full_name')
    .eq('id', record.player_id)
    .single();

  // 2) followers who still want score alerts (follows.prefs.scores !== false)
  const followers = await followersOf('player', [record.player_id]);
  const followerIds = [...new Set(followers.filter((f) => wants(f.prefs, 'scores')).map((f) => f.follower_id))];
  if (followerIds.length === 0) return new Response('no followers', { status: 200 });

  // 3) + 4) their devices: web push + the Expo push batch
  const headline = rose.map(([k, v]) => `${v} ${k}`).join(', ');
  const pushTitle = `${player?.full_name ?? 'A player you follow'} — ${headline}`;
  const pushBody = record.opponent ? `${record.sport} vs ${record.opponent}` : record.sport;
  const out = await sendToProfiles(followerIds, pushTitle, pushBody, {
    url: record.match_id ? `/m/${record.match_id}` : '/',
    playerId: record.player_id,
  });
  return json(out);
});
