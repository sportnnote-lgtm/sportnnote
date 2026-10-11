/**
 * Edge Function: guardian-consent  (SD-152)
 * ------------------------------------------------------------------------
 * Emails a minor's parent/guardian the link to confirm the child's account.
 * Called by the CHILD's app (Home card / Settings → Your data & privacy) while
 * their account is 'pending' (under 18, outside India) or 'withdrawn'.
 *
 * The guardian opens  <APP_URL>/guardian-consent?c=<CODE>  (or types the code
 * there) — no account needed. The page calls guardian_consent_preview /
 * guardian_consent_decide (migration 20261020120000_privacy_rights.sql).
 *
 * Guards: signed-in caller; their own account only; 3 emails per child per day.
 * The guardian address is the one on file (the player profile's guardian, else
 * the sign-up copy) — the caller can't choose where it goes.
 *
 * Contract: POST {} → 200 { sent: boolean, email?: "a***@x.com", reason? }
 * Deploy:   supabase functions deploy guardian-consent
 * Secrets:  RESEND_API_KEY (shared), optional APP_URL (_shared/hosts.ts).
 */
import { admin, clip, CORS, json, rateLimit, requireUser, sendEmail } from '../_shared/guard.ts';
import { APP_URL, SITE_URL } from '../_shared/hosts.ts';

const mask = (e: string) => e.replace(/^(.)[^@]*/, '$1***');
const grouped = (code: string) => code.replace(/(.{4})(?=.)/g, '$1-');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const caller = await requireUser(req);
  if (caller instanceof Response) return caller;
  const uid = caller.user.id;

  const { data: prof } = await admin.from('profiles').select('guardian_consent').eq('id', uid).single();
  const status = (prof as { guardian_consent?: string } | null)?.guardian_consent;
  if (status !== 'pending' && status !== 'withdrawn') {
    return json({ sent: false, reason: 'Your account doesn’t need a parent or guardian to confirm it.' }, 400);
  }
  if (!(await rateLimit('guardian-consent', uid, 3, 86400))) {
    return json({ sent: false, reason: 'Already sent 3 today — try again tomorrow.' }, 429);
  }

  const { data, error } = await admin.rpc('create_guardian_consent_code', { p_profile: uid });
  if (error || !data) {
    const msg = error?.message ?? '';
    return json({ sent: false, reason: /guardian/i.test(msg) ? 'Add your parent or guardian’s email in Edit profile first.' : 'Couldn’t create the link — try again.' }, 400);
  }
  const { code, email, childName } = data as { code: string; email: string; childName: string };
  const first = clip(childName, 60).split(/\s+/)[0] || 'Your child';
  const link = `${APP_URL}/guardian-consent?c=${encodeURIComponent(code)}`;

  const sent = await sendEmail(
    email,
    `Please confirm ${first}’s SportnNote account`,
    `Hello,\n\n${first} has signed up to SportnNote, an app for school and club sports scores and profiles, and gave this address as their parent or guardian.\n\n` +
    `Because they are under 18, their account stays limited until you confirm it: nobody can follow them or message about them, and only their own teams can see their profile.\n\n` +
    `To agree or say no, open this link (it works for 7 days):\n${link}\n\n` +
    `Or open ${APP_URL}/guardian-consent and enter the code: ${grouped(code)}\n\n` +
    `What we keep and why: ${SITE_URL}/privacy/\n` +
    `Messages from coaches or organisers about ${first} come to you, never to them. We show no ads and never sell data. You can view, download or delete ${first}'s data, or withdraw consent, at any time.\n\n` +
    `Didn't expect this? You can ignore it, or tap the link and choose "I don't agree".`,
  );
  return json({ sent, email: mask(email), ...(sent ? {} : { reason: 'The email couldn’t be sent just now — try again later.' }) });
});
