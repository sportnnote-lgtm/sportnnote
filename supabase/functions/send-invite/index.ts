/**
 * Edge Function: send-invite
 * ------------------------------------------------------------------------
 * Emails an app invite to a specific person (e.g. a co-host who isn't on
 * SportnNote yet). The client (`src/core/invite.ts` → sendInviteEmail) posts
 * the recipient + invite details; this composes the email and sends it via
 * Resend. If RESEND_API_KEY isn't set (or the send fails), `delivered:false` is
 * returned and the client falls back to opening a pre-filled mail composer.
 *
 * Abuse guards (migration 0025). This sends from no-reply@sportnnote.in to an
 * arbitrary address, so it must not be an open relay:
 *   - signed-in callers only; 20 invites per user per day;
 *   - the SERVER writes the subject + body from a fixed template — the client only
 *     supplies the invitee's name, a short context ("Red House at Inter-School
 *     Cup") and the join link; the inviter's name comes from their own profile;
 *   - the link must point at SportnNote (our functions URL, sportnnote.in, or the
 *     app's deep-link scheme); free text is length-capped with links stripped.
 *
 * Contract (matches src/core/invite.ts → sendInviteEmail):
 *   POST { to: string, name?: string, link: string, context?: string, role?: 'co-host'|'manage' }
 *     → 200 { delivered: boolean }
 *
 * Deploy:  supabase functions deploy send-invite
 * Secrets: reuses RESEND_API_KEY (+ optional INVITE_FROM, else SUPPORT_FROM).
 */
import { admin, clip, CORS, json, rateLimit, requireUser, stripLinks, SUPABASE_URL, tooMany } from '../_shared/guard.ts';

const FROM = Deno.env.get('INVITE_FROM') ?? Deno.env.get('SUPPORT_FROM') ?? 'SportnNote <onboarding@resend.dev>';
// Replies to an invite should reach the SportnNote inbox, not the no-reply sender.
const REPLY_TO = Deno.env.get('SUPPORT_EMAIL') ?? 'sportnnote@gmail.com';
// A single, reasonable email address — we email arbitrary recipients, so guard it.
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
// Only SportnNote links may appear in an invite.
const LINK_PREFIXES = [`${SUPABASE_URL}/functions/v1/`, 'https://sportnnote.in/', 'sportnnote://'];
const isOurLink = (s: string) => LINK_PREFIXES.some((p) => s.startsWith(p)) && !/\s/.test(s);

type Role = 'co-host' | 'manage';

// Mirrors src/core/invite.ts inviteSubject / inviteMessage.
const subjectFor = (inviter: string, role: Role) =>
  `${inviter} invited you to ${role === 'manage' ? 'manage a team' : 'co-host'} on SportnNote`;
const messageFor = (o: { name: string; inviter: string; link: string; context: string; role: Role }) => {
  const who = o.name || 'there';
  const what = o.context ? ` ${o.context}` : '';
  return `Hi ${who}! ${o.inviter} invited you to ${o.role === 'manage' ? 'manage' : 'co-host'}${what} on SportnNote 🏆 Install the app and register with this number/email to join:\n${o.link}`;
};

async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, text }),
    });
    return res.ok;
  } catch (e) {
    console.error('resend error', e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const caller = await requireUser(req);
  if (caller instanceof Response) return caller;

  let body: { to?: unknown; name?: unknown; link?: unknown; context?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const to = clip(body.to, 254);
  const link = clip(body.link, 300);
  const name = stripLinks(clip(body.name, 60));
  const context = stripLinks(clip(body.context, 120));
  const role: Role = body.role === 'manage' ? 'manage' : 'co-host';
  if (!isEmail(to)) return json({ error: 'a valid recipient email is required' }, 400);
  if (!isOurLink(link)) return json({ error: 'a SportnNote invite link is required' }, 400);

  if (!(await rateLimit('send-invite', caller.user.id, 20, 86400))) return tooMany();

  const { data: prof } = await admin.from('profiles').select('full_name').eq('id', caller.user.id).maybeSingle();
  const inviter = stripLinks(clip(prof?.full_name, 60)) || 'A SportnNote user';

  const delivered = await sendEmail(to, subjectFor(inviter, role), messageFor({ name, inviter, link, context, role }));
  return json({ delivered });
});
