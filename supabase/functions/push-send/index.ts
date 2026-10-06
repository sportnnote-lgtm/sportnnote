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
 * Abuse guards (migration 0025):
 *   - caller must be a signed-in user (the bare anon key is rejected);
 *   - only recipients the caller has a real relationship with are pushed to —
 *     same team / match / tournament / org / club (push_allowed_targets(), run
 *     AS the caller); support staff may notify anyone. Others are skipped;
 *   - at most 50 recipients per call, 120 calls per user per hour;
 *   - title/body are length-capped and links are stripped (anti-phishing).
 *
 * Deploy:  supabase functions deploy push-send
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY injected.
 */
import { admin, clip, json, rateLimit, requireUser, stripLinks, tooMany } from '../_shared/guard.ts';
import { webPushToProfiles } from '../_shared/webpush.ts';

const MAX_RECIPIENTS = 50;

interface Body {
  playerIds?: string[];
  title?: string;
  body?: string;
  matchId?: string | null;
}

Deno.serve(async (req) => {
  // 1) Require an authenticated caller.
  const caller = await requireUser(req);
  if (caller instanceof Response) return caller;
  if (!(await rateLimit('push-send', caller.user.id, 120, 3600))) return tooMany();

  // 2) Parse + validate.
  const raw = (await req.json().catch(() => ({}))) as Body;
  const ids = Array.from(new Set((raw.playerIds ?? []).filter((x): x is string => typeof x === 'string' && !!x)));
  const title = stripLinks(clip(raw.title, 80));
  const body = stripLinks(clip(raw.body, 240));
  const matchId = typeof raw.matchId === 'string' ? raw.matchId : null;
  if (!ids.length || !title || !body) return json({ error: 'playerIds, title and body are required' }, 400);
  if (ids.length > MAX_RECIPIENTS) return json({ error: `at most ${MAX_RECIPIENTS} recipients per call` }, 400);

  // 3) Keep only recipients the caller is actually connected to (evaluated as
  //    the caller, so auth.uid() is the sender).
  const { data: allowed, error: relErr } = await caller.asUser.rpc('push_allowed_targets', { p_targets: ids });
  if (relErr) {
    console.error('push_allowed_targets failed', relErr.message);
    return json({ pushed: 0, reason: 'could not verify recipients' }, 503);
  }
  const targets = (allowed as string[] | null) ?? [];
  const skipped = ids.length - targets.length;
  if (!targets.length) return json({ pushed: 0, skipped, reason: 'no connected recipients' });

  // 4) player ids → profile ids → push tokens (service role bypasses RLS).
  const { data: players } = await admin.from('players').select('id, profile_id').in('id', targets);
  const profileIds = [...new Set((players ?? []).map((p) => p.profile_id).filter((x): x is string => !!x))];
  if (!profileIds.length) return json({ pushed: 0, skipped, reason: 'no linked accounts' });

  // Web (iPhone Home Screen app, browsers) in parallel with Expo below.
  const webSent = webPushToProfiles(profileIds, { title, body, url: matchId ? `/m/${matchId}` : '/', tag: matchId ? `m-${matchId}` : undefined });

  const { data: tokens } = await admin.from('push_tokens').select('token').in('profile_id', profileIds);
  const messages = (tokens ?? []).map((t) => ({
    to: t.token as string,
    sound: 'default',
    title,
    body,
    data: { matchId: matchId ?? undefined },
    channelId: 'default',
  }));
  if (!messages.length) {
    const w = await webSent;
    return json({ pushed: 0, web: w, skipped, reason: w ? undefined : 'no device tokens' });
  }

  // 5) Send to Expo (cap 100 messages / request).
  for (let i = 0; i < messages.length; i += 100) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
  }
  return json({ pushed: messages.length, web: await webSent, skipped });
});
