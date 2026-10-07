/**
 * Edge Function: phone-login — sign in / sign up with a mobile number (web).
 * ------------------------------------------------------------------------
 * The client proves the number with a Firebase SMS code (core/firebasePhone.ts)
 * and sends Firebase's ID token. We verify it (Google's keys, our project,
 * ≤10 min old), then (migration 0035):
 *   • number VERIFIED on an existing account's own player → sign into it;
 *   • number only typed on an account (never verified) → refuse, explain how to
 *     verify it (no account takeover by registering someone's number);
 *   • unknown number + no sign-up details → { status: 'new' } (the app shows the
 *     short sign-up form);
 *   • unknown number + sign-up details → create the account (internal
 *     placeholder email, never mailed), attach/claim the player, sign in.
 * "Sign in" = a one-time magic-link token hash (nothing is emailed); the app
 * exchanges it with supabase.auth.verifyOtp for a normal session.
 *
 * Contract: POST { idToken, signup?: { fullName, dob, role, guardian?, legalVersion, agreed } }
 *   → { status: 'ok', tokenHash } | { status: 'new' } | { status: 'unverified', reason } | { error }
 * Secrets: FIREBASE_PROJECT_ID (+ the injected service role).
 */
import { admin, clip, CORS, json, rateLimit, tooMany } from '../_shared/guard.ts';
import { firebaseConfigured, verifiedPhoneFromToken } from '../_shared/firebaseToken.ts';

const ROLES = ['player', 'parent', 'scorer', 'organizer', 'fan'];
const key10 = (p: string) => p.replace(/\D/g, '').slice(-10);

function ageFrom(dob: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getUTCFullYear() - d.getUTCFullYear();
  if (now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) a--;
  return a >= 0 && a < 120 ? a : null;
}

async function sessionFor(profileId: string): Promise<Response> {
  const { data: u, error } = await admin.auth.admin.getUserById(profileId);
  if (error || !u?.user?.email || u.user.deleted_at || (u.user as { banned_until?: string }).banned_until) {
    return json({ error: 'This account can’t sign in right now — contact support.' }, 403);
  }
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u.user.email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    console.error('generateLink', linkErr);
    return json({ error: 'Couldn’t sign you in just now — try again.' }, 500);
  }
  return json({ status: 'ok', tokenHash });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!firebaseConfigured()) return json({ error: 'Mobile sign-in isn’t available yet.' }, 503);

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  if (!(await rateLimit('phone-login-ip', ip, 30, 3600))) return tooMany();

  const body = (await req.json().catch(() => ({}))) as { idToken?: unknown; signup?: Record<string, unknown> };
  const idToken = typeof body.idToken === 'string' ? body.idToken : '';
  if (!idToken) return json({ error: 'idToken is required' }, 400);

  const phone = await verifiedPhoneFromToken(idToken);
  if (phone instanceof Error) return json({ error: phone.message }, 401);
  if (!(await rateLimit('phone-login', key10(phone), 10, 3600))) return tooMany();

  // Who owns this number?
  const { data: owner } = await admin.rpc('phone_login_lookup', { p_phone: phone });
  const row = (owner as { profile_id: string; verified: boolean }[] | null)?.[0];
  if (row?.verified) return sessionFor(row.profile_id);
  if (row && !row.verified) {
    return json({
      status: 'unverified',
      reason: 'This number is on an account that hasn’t verified it yet. Sign in with your email and password, then verify the number in Profile — after that you can sign in with your mobile.',
    });
  }

  // New number.
  const s = body.signup;
  if (!s) return json({ status: 'new' });
  const fullName = clip(s.fullName, 80).trim();
  const dob = typeof s.dob === 'string' ? s.dob.trim() : '';
  const role = typeof s.role === 'string' && ROLES.includes(s.role) ? s.role : 'player';
  const age = ageFrom(dob);
  if (!fullName) return json({ error: 'Enter your name.' }, 400);
  if (age === null) return json({ error: 'Enter a valid date of birth.' }, 400);
  if (s.agreed !== true) return json({ error: 'Please agree to the Terms of Use and Privacy Policy.' }, 400);
  let guardian: Record<string, unknown> | undefined;
  if (age < 18) {
    const g = (s.guardian ?? {}) as Record<string, unknown>;
    const gName = clip(g.name, 80).trim();
    const gPhone = clip(g.phone, 20).trim();
    const gEmail = clip(g.email, 120).trim();
    if (!gName || (!gPhone && !gEmail) || g.consent !== true) {
      return json({ error: 'Under-18 accounts need a parent/guardian’s name, contact and consent.' }, 400);
    }
    guardian = { name: gName, phone: gPhone || undefined, email: gEmail || undefined, consentedAt: new Date().toISOString() };
  }

  const placeholder = `${crypto.randomUUID()}@phone.sportnnote.in`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: placeholder,
    email_confirm: true,
    phone,
    phone_confirm: true,
    user_metadata: {
      full_name: fullName, role, dob, phone, signup: 'phone',
      ...(guardian ? { guardian } : {}),
      legal_accepted: { version: clip(s.legalVersion, 20) || 'unknown', at: new Date().toISOString() },
    },
  });
  if (createErr || !created?.user) {
    console.error('createUser', createErr);
    const dup = /already|exists|registered/i.test(createErr?.message ?? '');
    return json({ error: dup ? 'This number already has an account — sign in with your email instead.' : 'Couldn’t create your account just now — try again.' }, dup ? 409 : 500);
  }
  const { error: attachErr } = await admin.rpc('phone_login_attach_player', { p_profile: created.user.id, p_phone: phone });
  if (attachErr) console.error('attach player', attachErr); // the app's createMyPlayer still covers this
  return sessionFor(created.user.id);
});
