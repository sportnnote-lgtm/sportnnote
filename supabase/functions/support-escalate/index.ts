/**
 * Edge Function: support-escalate
 * ------------------------------------------------------------------------
 * The human-fallback layer of the in-app help centre. When the knowledge base
 * and AI assistant can't resolve a question, the client (`data/repos.ts` →
 * submitSupportCase) sends the case here. This:
 *   1. records it in the `support_cases` table (so nothing is lost), and
 *   2. emails a copy to SUPPORT_EMAIL so a solo support person can just reply.
 *
 * Email uses Resend (https://resend.com) — one HTTP call, generous free tier.
 * If RESEND_API_KEY isn't set, the case is still recorded and `delivered:false`
 * is returned; the client then falls back to opening a pre-filled email itself.
 *
 * Contract (matches data/repos.ts → submitSupportCase):
 *   POST { question, tried?, handle?, appVersion? }
 *     → 200 { delivered: boolean, caseId?: string }
 *
 * Deploy:  supabase functions deploy support-escalate
 * Secrets: supabase secrets set RESEND_API_KEY=re_...
 *          supabase secrets set SUPPORT_EMAIL=hrudhaypvtemp@gmail.com
 *          supabase secrets set SUPPORT_FROM="Sportfolio <onboarding@resend.dev>"
 *   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Keep in sync with SUPPORT_EMAIL in src/data/repos.ts (the client's mailto fallback).
const SUPPORT_EMAIL = Deno.env.get('SUPPORT_EMAIL') ?? 'hrudhaypvtemp@gmail.com';
// Resend requires a verified sender; its shared sandbox address works for testing.
const SUPPORT_FROM = Deno.env.get('SUPPORT_FROM') ?? 'Sportfolio Support <onboarding@resend.dev>';

async function sendEmail(subject: string, text: string): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: SUPPORT_FROM, to: [SUPPORT_EMAIL], subject, text }),
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

  let body: { question?: unknown; tried?: unknown; handle?: unknown; appVersion?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) return json({ error: 'question is required' }, 400);
  const tried = typeof body.tried === 'string' ? body.tried : null;
  const handle = typeof body.handle === 'string' ? body.handle : null;
  const appVersion = typeof body.appVersion === 'string' ? body.appVersion : null;

  // 1) Record the case (service role bypasses RLS; the table is support-only).
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data, error } = await supabase
    .from('support_cases')
    .insert({ question, tried, handle, app_version: appVersion })
    .select('id')
    .single();
  if (error) console.error('support_cases insert error', error);
  const caseId = data?.id as string | undefined;

  // 2) Email a copy so support can reply without opening the dashboard.
  const emailBody = [
    question,
    '',
    '—',
    tried ? `Already tried: ${tried}` : '',
    handle ? `Account: @${handle}` : '',
    appVersion ? `App version: ${appVersion}` : '',
    caseId ? `Case: ${caseId}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const delivered = await sendEmail(
    `Sportfolio support: ${question.slice(0, 60)}${question.length > 60 ? '…' : ''}`,
    emailBody,
  );

  return json({ delivered, caseId });
});
