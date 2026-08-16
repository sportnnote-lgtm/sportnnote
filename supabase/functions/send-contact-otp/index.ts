/**
 * Edge Function: send-contact-otp
 * ------------------------------------------------------------------------
 * Sends a real 6-digit verification code to a player's own contact channel.
 * EMAIL ONLY for now (SMS needs a provider). Flow: authenticate the caller,
 * confirm they own the player, read the target from the player row (never trust
 * a client-supplied address), store a HASHED code (10-min expiry, one per
 * player+channel), and email it via Resend.
 *
 * Returns 200 `{ sent: boolean, reason?, detail? }` for every non-fatal outcome
 * so the client can surface WHY delivery didn't happen (reason is a short,
 * non-sensitive tag: unauthorized | forbidden | no-email | no-resend-key |
 * resend-<status>).
 *
 * Contract (src/data/repos.ts → beginContactVerification):
 *   POST { playerId: string, channel: 'email' }   [Authorization: Bearer <jwt>]
 *     → 200 { sent: boolean, reason?: string, detail?: string }
 *
 * Deploy:  supabase functions deploy send-contact-otp
 * Secrets: reuses RESEND_API_KEY (+ optional OTP_FROM / SUPPORT_FROM).
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const FROM = Deno.env.get('OTP_FROM') ?? Deno.env.get('SUPPORT_FROM') ?? 'Sportfolio <onboarding@resend.dev>';
const REPLY_TO = Deno.env.get('SUPPORT_EMAIL') ?? 'sportnnote@gmail.com';
const URL = Deno.env.get('SUPABASE_URL')!;

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sendEmail(to: string, code: string): Promise<{ ok: boolean; reason?: string; detail?: string }> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return { ok: false, reason: 'no-resend-key' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        reply_to: REPLY_TO,
        subject: `Your Sportfolio verification code: ${code}`,
        text: `Your Sportfolio verification code is ${code}. It expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`,
      }),
    });
    if (res.ok) return { ok: true };
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    console.error('resend send failed', res.status, detail);
    return { ok: false, reason: `resend-${res.status}`, detail };
  } catch (e) {
    console.error('resend error', e);
    return { ok: false, reason: 'resend-exception', detail: String(e).slice(0, 200) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: { playerId?: unknown; channel?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  const playerId = typeof body.playerId === 'string' ? body.playerId : '';
  const channel = body.channel === 'email' ? 'email' : null; // email only for now
  if (!playerId || !channel) return json({ error: 'playerId and channel:email required' }, 400);

  const authHeader = req.headers.get('Authorization') ?? '';
  const authClient = createClient(URL, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return json({ sent: false, reason: 'unauthorized' });

  const svc = createClient(URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: player } = await svc.from('players').select('id, profile_id, email').eq('id', playerId).single();
  if (!player || player.profile_id !== user.id) return json({ sent: false, reason: 'forbidden' });
  const target = (player.email ?? '').trim();
  if (!target.includes('@')) return json({ sent: false, reason: 'no-email' });

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const up = await svc.from('contact_otps').upsert({
    player_id: playerId, channel, code_hash: await sha256(code), target, attempts: 0, expires_at: expires,
  }, { onConflict: 'player_id,channel' });
  if (up.error) { console.error('contact_otps upsert failed', up.error); return json({ sent: false, reason: 'store-failed', detail: up.error.message.slice(0, 200) }); }

  const r = await sendEmail(target, code);
  return json({ sent: r.ok, reason: r.reason, detail: r.detail });
});
