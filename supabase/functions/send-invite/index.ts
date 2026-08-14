/**
 * Edge Function: send-invite
 * ------------------------------------------------------------------------
 * Emails an app invite to a specific person (e.g. a co-host who isn't on
 * Sportfolio yet). The client (`src/core/invite.ts` → sendInviteEmail) posts
 * the recipient + message; this sends it via Resend. If RESEND_API_KEY isn't
 * set (or the send fails), `delivered:false` is returned and the client falls
 * back to opening a pre-filled mail composer (mailto) itself.
 *
 * Unlike support-escalate (which mails a FIXED support address), this takes an
 * arbitrary `to` — so we validate it's a single, well-formed email before send.
 *
 * Contract (matches src/core/invite.ts → sendInviteEmail):
 *   POST { to: string, subject: string, text: string }
 *     → 200 { delivered: boolean }
 *
 * Deploy:  supabase functions deploy send-invite
 * Secrets: reuses RESEND_API_KEY (+ optional INVITE_FROM, else SUPPORT_FROM).
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const FROM = Deno.env.get('INVITE_FROM') ?? Deno.env.get('SUPPORT_FROM') ?? 'Sportfolio <onboarding@resend.dev>';
// A single, reasonable email address — we email arbitrary recipients, so guard it.
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, text }),
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

  let body: { to?: unknown; subject?: unknown; text?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const to = typeof body.to === 'string' ? body.to.trim() : '';
  const subject = typeof body.subject === 'string' ? body.subject.trim() : 'You’re invited to Sportfolio';
  const text = typeof body.text === 'string' ? body.text : '';
  if (!isEmail(to)) return json({ error: 'a valid recipient email is required' }, 400);
  if (!text) return json({ error: 'text is required' }, 400);

  const delivered = await sendEmail(to, subject, text);
  return json({ delivered });
});
