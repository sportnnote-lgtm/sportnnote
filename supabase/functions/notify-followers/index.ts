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
 *   1. loads the player + the new stat delta,
 *   2. finds everyone following that player,
 *   3. collects their push tokens,
 *   4. sends a batch to https://exp.host/--/api/v2/push/send.
 *
 * Deploy:  supabase functions deploy notify-followers
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are injected automatically.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

interface StatLineRecord {
  player_id: string;
  sport: string;
  stats: Record<string, number>;
  opponent: string | null;
}

Deno.serve(async (req) => {
  const { record } = (await req.json()) as { record: StatLineRecord };
  if (!record?.player_id) return new Response('no record', { status: 200 });

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

  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token')
    .in('profile_id', followerIds);
  if (!tokens?.length) return new Response('no tokens', { status: 200 });

  // 4) build + send the Expo push batch
  const headline = Object.entries(record.stats)
    .map(([k, v]) => `${v} ${k}`)
    .join(', ');
  const messages = tokens.map((t) => ({
    to: t.token,
    sound: 'default',
    title: `${player?.full_name ?? 'A player you follow'} — ${headline}`,
    body: record.opponent ? `${record.sport} vs ${record.opponent}` : record.sport,
    data: { playerId: record.player_id },
  }));

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });

  return new Response(JSON.stringify({ sent: messages.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
