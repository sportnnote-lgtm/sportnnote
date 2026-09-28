/**
 * Edge Function: join-club  (PUBLIC — deploy with --no-verify-jwt)
 * ------------------------------------------------------------------------
 * The browser landing page for a CLUB ("team") invite link. A club admin shares a
 * link like https://<project>.supabase.co/functions/v1/join-club?c=JOIN-1001 (or a
 * QR of it); anyone who opens it gets clear instructions to install SportnNote and
 * redeem the code from "Join a team". Distinct from `join` (which is a provisional
 * PLAYER invite keyed by a UUID) — this is a club membership code (club_invites).
 *
 * The shared *.supabase.co /functions domain forces text/plain (anti-phishing), so
 * we return a clean ASCII instruction page rather than an auto-redirect. The app's
 * own deep link (sportnnote://join-club/<token>) is what actually opens the redeem
 * screen once the app is installed.
 *
 * Contract:  GET /join-club?c=<token>   -> text/plain instructions
 * Deploy:    npx supabase functions deploy join-club --no-verify-jwt \
 *              --project-ref mpgbvbylmkwasjgupsbq
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const PROJECT_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Invite codes are short alphanumeric tokens (e.g. JOIN-1001); keep validation loose
// but bounded so we never echo arbitrary input.
const CODE = /^[A-Za-z0-9-]{3,40}$/;

const reply = (message: string) =>
  new Response(`SportnNote\n\n${message}\n`, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
  });

Deno.serve(async (req) => {
  const raw = new URL(req.url).searchParams.get('c') ?? '';
  const code = raw.trim().toUpperCase();
  if (!CODE.test(code)) {
    return reply('This team invite link looks invalid. Ask whoever invited you to resend it.');
  }
  let club = '';
  try {
    const svc = createClient(PROJECT_URL, SERVICE);
    const { data } = await svc.from('club_invites').select('club_id, clubs(name)').eq('token', code).maybeSingle();
    // The joined relation may be an object or a single-element array.
    const clubs = (data as { clubs?: { name?: string } | { name?: string }[] } | null)?.clubs;
    club = (Array.isArray(clubs) ? clubs[0]?.name : clubs?.name) ?? '';
  } catch {
    // fall through with generic copy
  }

  if (!club) {
    return reply('This team invite code is no longer valid. Ask whoever invited you for a fresh link.');
  }

  return reply(
    `You have been invited to join ${club} on SportnNote - the app for scoring and following matches.\n\n` +
    `To join:\n` +
    `1) Install the SportnNote app (ask the person who invited you for the download link).\n` +
    `2) Open it, go to Teams -> "Have an invite code? Join a team".\n` +
    `3) Enter this code:  ${code}\n\n` +
    `If you already have the app installed, opening this link on your phone can jump you straight there:\n` +
    `sportnnote://join-club/${code}\n\n` +
    `Didn't expect this? You can ignore the message - nothing happens unless you install the app and enter the code yourself.`,
  );
});
