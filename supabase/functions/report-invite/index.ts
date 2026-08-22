/**
 * Edge Function: report-invite  (PUBLIC — deploy with --no-verify-jwt)
 * ------------------------------------------------------------------------
 * The "this isn't me" link in a provisional-player WhatsApp invite. Opened in a
 * browser by someone who was added to a team by phone but shouldn't have been —
 * no app or account needed. Stamps players.reported_at (service role, so it
 * bypasses RLS) for the given provisional player, then shows a confirmation.
 * Restricted to UNCLAIMED players (profile_id is null) so it can never flag a
 * real registered account.
 *
 * NOTE: the shared *.supabase.co/functions domain forces `text/plain` on
 * responses (anti-phishing — it won't render arbitrary HTML), so we return a
 * clean, ASCII-only plain-text message rather than an HTML page.
 *
 * Contract:  GET /report-invite?p=<playerId>   → text/plain confirmation
 * Deploy:    npx supabase functions deploy report-invite --no-verify-jwt \
 *              --project-ref mpgbvbylmkwasjgupsbq
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const PROJECT_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const reply = (message: string) =>
  new Response(`SportnNote\n\n${message}\n`, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
  });

Deno.serve(async (req) => {
  const id = new URL(req.url).searchParams.get('p') ?? '';
  if (!UUID.test(id)) {
    return reply("This report link looks invalid. If someone added you by mistake, you can ignore the message - you won't be signed up for anything.");
  }
  try {
    const svc = createClient(PROJECT_URL, SERVICE);
    // Only flag an UNCLAIMED provisional player — never a registered account.
    await svc.from('players').update({ reported_at: new Date().toISOString() }).eq('id', id).is('profile_id', null);
  } catch {
    return reply("We couldn't record that just now. You can safely ignore the invite - nothing is created for you unless you install SportnNote and register yourself.");
  }
  return reply("Thanks - noted. We've flagged that this isn't you. The organizer will be told, and you won't be added or signed up for anything. No app needed - you can close this page.");
});
