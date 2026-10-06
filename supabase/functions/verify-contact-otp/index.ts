/**
 * Edge Function: verify-contact-otp
 * ------------------------------------------------------------------------
 * Checks a 6-digit code the player entered against the hashed code stored by
 * send-contact-otp. On success, flips the player's *_verified flag and clears
 * the code. Authenticated + ownership-checked, same as send-contact-otp. Caps
 * wrong guesses (5) and honours the 10-min expiry.
 *
 * Contract (src/data/repos.ts → verifyContactOtp):
 *   POST { playerId, channel: 'email', code }   [Authorization: Bearer <jwt>]
 *     → 200 { verified: boolean, reason?: 'expired' | 'too_many' | 'mismatch' | 'none' }
 *
 * Deploy:  supabase functions deploy verify-contact-otp
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const URL = Deno.env.get('SUPABASE_URL')!;
const MAX_ATTEMPTS = 5;

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: { playerId?: unknown; channel?: unknown; code?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  const playerId = typeof body.playerId === 'string' ? body.playerId : '';
  const channel = body.channel === 'email' || body.channel === 'phone' || body.channel === 'guardian_phone' ? body.channel : null;
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!playerId || !channel || !code) return json({ error: 'playerId, channel, code required' }, 400);

  const authHeader = req.headers.get('Authorization') ?? '';
  const authClient = createClient(URL, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return json({ error: 'unauthorized' }, 401);

  const svc = createClient(URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: player } = await svc.from('players').select('id, profile_id, guardian').eq('id', playerId).single();
  if (!player || player.profile_id !== user.id) return json({ error: 'forbidden' }, 403);

  const { data: otp } = await svc.from('contact_otps').select('code_hash, attempts, expires_at').eq('player_id', playerId).eq('channel', channel).single();
  if (!otp) return json({ verified: false, reason: 'none' });
  if (new Date(otp.expires_at).getTime() < Date.now()) {
    await svc.from('contact_otps').delete().eq('player_id', playerId).eq('channel', channel);
    return json({ verified: false, reason: 'expired' });
  }
  if ((otp.attempts ?? 0) >= MAX_ATTEMPTS) return json({ verified: false, reason: 'too_many' });

  if (otp.code_hash !== (await sha256(code))) {
    await svc.from('contact_otps').update({ attempts: (otp.attempts ?? 0) + 1 }).eq('player_id', playerId).eq('channel', channel);
    return json({ verified: false, reason: 'mismatch' });
  }

  // Correct: mark verified and clear the code.
  // Correct: flip the flag server-side (the app can't set these itself).
  if (channel === 'guardian_phone') {
    const guardian = { ...((player.guardian as Record<string, unknown> | null) ?? {}), phoneVerified: true };
    await svc.from('players').update({ guardian }).eq('id', playerId);
  } else {
    await svc.from('players').update(channel === 'email' ? { email_verified: true } : { phone_verified: true }).eq('id', playerId);
  }
  await svc.from('contact_otps').delete().eq('player_id', playerId).eq('channel', channel);
  return json({ verified: true });
});
