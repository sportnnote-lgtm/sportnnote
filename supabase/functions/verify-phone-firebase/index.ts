/**
 * Edge Function: verify-phone-firebase
 * ------------------------------------------------------------------------
 * Marks a phone number verified after the user proved it with a Firebase SMS
 * code (see src/core/firebasePhone.ts). Firebase is only the SMS courier — it
 * never becomes our login. The client sends Firebase's signed ID token; this:
 *   1. checks Google's signature (RS256, Google's public keys), the issuer and
 *      audience (our Firebase project), and that the token is fresh (≤10 min);
 *   2. checks the caller owns the player profile;
 *   3. checks the token's `phone_number` is the number on that profile — the
 *      player's own (channel 'phone') or their guardian's ('guardian_phone');
 *   4. sets phone_verified (or guardian.phoneVerified) with the service role —
 *      the app itself can never set these (migrations 0025/0027).
 *
 * Contract: POST { playerId, channel: 'phone'|'guardian_phone', idToken }
 *           → 200 { verified: boolean, reason? }
 * Deploy:   supabase functions deploy verify-phone-firebase
 * Secrets:  FIREBASE_PROJECT_ID (the Firebase project id, e.g. sportnnote-12345)
 */
import { admin, CORS, json, rateLimit, requireUser, tooMany } from '../_shared/guard.ts';
import { firebaseConfigured, verifiedPhoneFromToken } from '../_shared/firebaseToken.ts';

const key10 = (p: string) => p.replace(/\D/g, '').slice(-10);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!firebaseConfigured()) return json({ verified: false, reason: 'SMS verification isn’t configured yet.' }, 503);
  const caller = await requireUser(req);
  if (caller instanceof Response) return caller;
  if (!(await rateLimit('verify-phone-firebase', caller.user.id, 10, 3600))) return tooMany();

  const body = (await req.json().catch(() => ({}))) as { playerId?: unknown; channel?: unknown; idToken?: unknown };
  const playerId = typeof body.playerId === 'string' ? body.playerId : '';
  const channel = body.channel === 'guardian_phone' ? 'guardian_phone' : body.channel === 'phone' ? 'phone' : null;
  const idToken = typeof body.idToken === 'string' ? body.idToken : '';
  if (!playerId || !channel || !idToken) return json({ verified: false, reason: 'playerId, channel and idToken are required' }, 400);

  // 1. Google's signature + our project + freshness.
  const verified = await verifiedPhoneFromToken(idToken);
  if (verified instanceof Error) return json({ verified: false, reason: verified.message }, 401);
  const phone = verified;

  // 2 + 3. The caller's own profile, and the number on it.
  const { data: player } = await admin.from('players').select('id, profile_id, phone, guardian').eq('id', playerId).single();
  if (!player || player.profile_id !== caller.user.id) return json({ verified: false, reason: 'Not your profile.' }, 403);
  const guardian = (player.guardian ?? null) as Record<string, unknown> | null;
  const onProfile = channel === 'guardian_phone' ? String(guardian?.phone ?? '') : String(player.phone ?? '');
  if (!onProfile || key10(onProfile) !== key10(phone)) {
    return json({ verified: false, reason: 'The verified number doesn’t match the one on the profile.' });
  }

  // 4. Set the flag (service role — the client can't).
  const update = channel === 'guardian_phone'
    ? { guardian: { ...(guardian ?? {}), phoneVerified: true } }
    : { phone_verified: true };
  const { error } = await admin.from('players').update(update).eq('id', playerId);
  if (error) return json({ verified: false, reason: 'Couldn’t save — try again.' }, 500);
  return json({ verified: true });
});
