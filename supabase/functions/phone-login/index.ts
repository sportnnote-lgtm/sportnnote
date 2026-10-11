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
 *
 * Perf (docs/perf/audit.md F-04): independent steps run side by side and the
 * owner lookup returns the account's sign-in state (no getUserById) — the
 * checks, their order of precedence and every response are unchanged.
 */
import { admin, clip, CORS, json, rateLimit, tooMany } from '../_shared/guard.ts';
import { firebaseConfigured, verifiedPhoneFromToken } from '../_shared/firebaseToken.ts';
import { phoneKey } from '../_shared/phone.ts';

const ROLES = ['player', 'parent', 'scorer', 'organizer', 'fan'];

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

/** The account fields the sign-in check needs (auth.users). */
interface Account { email?: string | null; deleted_at?: string | null; banned_until?: string | null }

/** Sign into `profileId`. `account` = its auth.users state when the caller
 *  already has it (phone_login_lookup_account, or the user just created);
 *  otherwise it is read here with getUserById, as before. Same refusal rule
 *  either way: no email, deleted or banned → 403. */
async function sessionFor(profileId: string, account?: Account): Promise<Response> {
  let acct = account;
  if (!acct) {
    const { data: u, error } = await admin.auth.admin.getUserById(profileId);
    acct = error || !u?.user ? undefined : {
      email: u.user.email, deleted_at: u.user.deleted_at, banned_until: (u.user as { banned_until?: string }).banned_until,
    };
  }
  if (!acct?.email || acct.deleted_at || acct.banned_until) {
    return json({ error: 'This account can’t sign in right now — contact support.' }, 403);
  }
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: acct.email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    console.error('generateLink', linkErr);
    return json({ error: 'Couldn’t sign you in just now — try again.' }, 500);
  }
  return json({ status: 'ok', tokenHash });
}

type Owner = { profile_id: string; verified: boolean } & Account;

/** Who owns this number — with the account's sign-in state in the same call
 *  (migration 20261023100000). Before that migration: the old lookup, and
 *  sessionFor reads the account itself. */
let lookupHasAccount = true;
async function lookupOwner(phone: string): Promise<{ row?: Owner; withAccount: boolean }> {
  if (lookupHasAccount) {
    const { data, error } = await admin.rpc('phone_login_lookup_account', { p_phone: phone });
    if (!error) return { row: (data as Owner[] | null)?.[0], withAccount: true };
    // PGRST202 / 42883 = not deployed yet; anything else: use the old path this time
    if (['PGRST202', '42883'].includes((error as { code?: string }).code ?? '')) lookupHasAccount = false;
  }
  const { data: owner } = await admin.rpc('phone_login_lookup', { p_phone: phone });
  return { row: (owner as Owner[] | null)?.[0], withAccount: false };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!firebaseConfigured()) return json({ error: 'Mobile sign-in isn’t available yet.' }, 503);

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  // Perf F-04: the IP limit, the body and Google's token check run side by side.
  // The answers are checked in the old order (429 before 400 before 401), so
  // every response is what the sequential version returned.
  const ipOk = rateLimit('phone-login-ip', ip, 30, 3600);
  const body = (await req.json().catch(() => ({}))) as { idToken?: unknown; signup?: Record<string, unknown> };
  const idToken = typeof body.idToken === 'string' ? body.idToken : '';
  const verifying = idToken ? verifiedPhoneFromToken(idToken) : null;
  if (!(await ipOk)) return tooMany();
  if (!idToken || !verifying) return json({ error: 'idToken is required' }, 400);

  const verified = await verifying;
  if (verified instanceof Error) return json({ error: verified.message }, 401);
  // The identity is the FULL international number Firebase verified (E.164,
  // e.g. +19175551234) — never its last 10 digits, which a number in another
  // country can share (+1 917 555 1234 vs +91 91755 51234 = account takeover).
  const phone = verified.startsWith('+') ? phoneKey(verified) : '';
  if (!phone) return json({ error: 'That number couldn’t be read — try again with the country code.' }, 400);
  // The per-number limit and the owner lookup (a read) run side by side; a
  // limited number still gets 429 and nothing else.
  const [phoneOk, { row, withAccount }] = await Promise.all([rateLimit('phone-login', phone, 10, 3600), lookupOwner(phone)]);
  if (!phoneOk) return tooMany();

  // Who owns this number?
  if (row?.verified) return sessionFor(row.profile_id, withAccount ? row : undefined);
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
    guardian = { name: gName, phone: (phoneKey(gPhone) || gPhone) || undefined, email: gEmail || undefined, consentedAt: new Date().toISOString() };
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
  // The account was created a moment ago with this email, not deleted or banned:
  // no need to read it back (the old getUserById here returned the same fields).
  return sessionFor(created.user.id, {
    email: created.user.email, deleted_at: (created.user as { deleted_at?: string }).deleted_at,
    banned_until: (created.user as { banned_until?: string }).banned_until,
  });
});
