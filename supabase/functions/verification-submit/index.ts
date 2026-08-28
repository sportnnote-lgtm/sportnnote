/**
 * Edge Function: verification-submit
 * ------------------------------------------------------------------------
 * When a user submits an age/ID proof document, the client (data/repos.ts →
 * submitVerificationDoc) uploads the file to the private `verification-docs`
 * Storage bucket, records a `pending` verification on their player row, then
 * calls this function. It:
 *   1. reads the player's name / DOB / guardian + the uploaded doc path,
 *   2. mints a short-lived signed URL to the document, and
 *   3. emails SUPPORT_EMAIL so a reviewer can open the proof and approve/reject
 *      it in the in-app console.
 *
 * Email uses Resend (same setup as support-escalate). If RESEND_API_KEY isn't
 * set the submission still stands (the row is already `pending`); this just
 * returns delivered:false and the reviewer works the in-app queue directly.
 *
 * Contract (matches data/repos.ts → submitVerificationDoc):
 *   POST { playerId }
 *     → 200 { delivered: boolean }
 *
 * Deploy:  supabase functions deploy verification-submit
 * Secrets: RESEND_API_KEY, SUPPORT_EMAIL, SUPPORT_FROM (shared with support-escalate).
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

const SUPPORT_EMAIL = Deno.env.get('SUPPORT_EMAIL') ?? 'sportnnote@gmail.com';
const SUPPORT_FROM = Deno.env.get('SUPPORT_FROM') ?? 'SportnNote Support <onboarding@resend.dev>';
// How long the reviewer's link to the document stays valid.
const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days

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

/** Rough age in years from a YYYY-MM-DD DOB (for the reviewer's context). */
function ageFrom(dob?: string): number | null {
  if (!dob) return null;
  const d = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: { playerId?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const playerId = typeof body.playerId === 'string' ? body.playerId : '';
  if (!playerId) return json({ error: 'playerId is required' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Read the player + their pending verification (service role bypasses RLS).
  const { data: player, error } = await supabase
    .from('players')
    .select('full_name, dob, guardian, verification')
    .eq('id', playerId)
    .single();
  if (error || !player) {
    console.error('verification-submit: player not found', error);
    return json({ delivered: false, error: 'player not found' }, 404);
  }

  const verification = (player.verification ?? {}) as { docPath?: string; docName?: string };
  const guardian = (player.guardian ?? null) as { name?: string; phone?: string; email?: string } | null;

  // Sign the document so the reviewer can open it straight from the email.
  let link = '(no document uploaded)';
  if (verification.docPath) {
    const { data: signed, error: signErr } = await supabase
      .storage.from('verification-docs')
      .createSignedUrl(verification.docPath, SIGNED_URL_TTL);
    if (signErr) console.error('sign error', signErr);
    link = signed?.signedUrl ?? '(could not sign document link)';
  }

  const age = ageFrom(player.dob as string | undefined);
  const emailBody = [
    `New age/ID verification to review.`,
    '',
    `Player: ${player.full_name ?? '(unnamed)'}`,
    player.dob ? `DOB: ${player.dob}${age != null ? `  (age ~${age})` : ''}` : '',
    guardian?.name ? `Guardian: ${guardian.name}${guardian.phone ? ` · ${guardian.phone}` : ''}${guardian.email ? ` · ${guardian.email}` : ''}` : '',
    verification.docName ? `Document: ${verification.docName}` : '',
    '',
    `View document (valid 7 days):`,
    link,
    '',
    '—',
    `Approve or reject it in the app: Settings → Verification review.`,
  ]
    .filter(Boolean)
    .join('\n');

  const delivered = await sendEmail(
    `SportnNote verification: ${player.full_name ?? playerId}`,
    emailBody,
  );

  return json({ delivered });
});
