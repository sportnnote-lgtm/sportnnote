/**
 * Edge Function: push-send
 * ------------------------------------------------------------------------
 * Client-triggered REMOTE push for app events (scorer assigned, captain invited,
 * squad needed, tournament invite, …). The in-app `notify()` routes any message
 * addressed to *another* user here, so it reaches their device even when the app
 * is closed / the phone is locked.
 *
 * Clients can't read other users' push tokens (RLS restricts push_tokens to the
 * owner), so the token lookup + Expo send happen here with the service role.
 *
 * Body: { playerIds: string[]; title: string; body: string; matchId?: string|null }
 *   playerIds are PLAYER ids → resolved to their profiles → their push tokens.
 *
 * Auth: requires a valid signed-in user (the app passes its JWT automatically via
 * supabase.functions.invoke). Anonymous calls are rejected. NOTE (pilot): any
 * authenticated user may notify any player through this; tighten to a
 * relationship check (same match/team/tournament) before scaling up.
 *
 * Deploy:  supabase functions deploy push-send
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY injected.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface Body {
  playerIds?: string[];
  title?: string;
  body?: string;
  matchId?: string | null;
}

Deno.serve(async (req) => {
  // 1) Require an authenticated caller.
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'unauthorized' }, 401);
  const authed = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await authed.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);

  // 2) Parse + validate.
  const { playerIds, title, body, matchId } = (await req.json().catch(() => ({}))) as Body;
  const ids = Array.from(new Set((playerIds ?? []).filter((x): x is string => typeof x === 'string' && !!x)));
  if (!ids.length || !title || !body) return json({ error: 'playerIds, title and body are required' }, 400);

  // 3) player ids → profile ids → push tokens (service role bypasses RLS).
  const { data: players } = await admin.from('players').select('id, profile_id').in('id', ids);
  const profileIds = [...new Set((players ?? []).map((p) => p.profile_id).filter((x): x is string => !!x))];
  if (!profileIds.length) return json({ pushed: 0, reason: 'no linked accounts' });

  const { data: tokens } = await admin.from('push_tokens').select('token').in('profile_id', profileIds);
  const messages = (tokens ?? []).map((t) => ({
    to: t.token as string,
    sound: 'default',
    title,
    body,
    data: { matchId: matchId ?? undefined },
    channelId: 'default',
  }));
  if (!messages.length) return json({ pushed: 0, reason: 'no device tokens' });

  // 4) Send to Expo (cap 100 messages / request).
  for (let i = 0; i < messages.length; i += 100) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
  }
  return json({ pushed: messages.length });
});
