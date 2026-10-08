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
  const { record, old_record } = (await req.json()) as { record: StatLineRecord; old_record?: StatLineRecord | null };
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

  // 2) followers → 3) their tokens
  const { data: followers } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('target_type', 'player')
    .eq('target_id', record.player_id);
  const followerIds = (followers ?? []).map((f) => f.follower_id);
  if (followerIds.length === 0) return new Response('no followers', { status: 200 });

  const headline = rose.map(([k, v]) => `${v} ${k}`).join(', ');
  const pushTitle = `${player?.full_name ?? 'A player you follow'} — ${headline}`;
  const pushBody = record.opponent ? `${record.sport} vs ${record.opponent}` : record.sport;
  // Web push (iPhone Home Screen app, browsers).
  const web = await webPushToProfiles(followerIds, { title: pushTitle, body: pushBody, url: record.match_id ? `/m/${record.match_id}` : '/' });

  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token')
    .in('profile_id', followerIds);
  if (!tokens?.length) return new Response(JSON.stringify({ sent: 0, web }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  // 4) build + send the Expo push batch
  const messages = tokens.map((t) => ({
    to: t.token,
    sound: 'default',
    title: pushTitle,
    body: pushBody,
    data: { playerId: record.player_id },
  }));

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });

  return new Response(JSON.stringify({ sent: messages.length, web }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
