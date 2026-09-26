/**
 * Edge Function: join  (PUBLIC — deploy with --no-verify-jwt)
 * ------------------------------------------------------------------------
 * The install/accept link in a provisional-player invite (WhatsApp/SMS). Opened
 * in a browser by an invited person who isn't on the app yet. The old link pointed
 * at https://sportnnote.in/join/<id>, but that domain is the marketing site and has
 * no such route (404). This serves a clear, working page instead.
 *
 * We don't auto-install (no Play Store listing yet) and the shared *.supabase.co
 * /functions domain forces text/plain (anti-phishing), so we return a clean,
 * ASCII-only instruction page. The key mechanic: once the invitee installs the app
 * and registers with THIS phone number, `createMyPlayer` claims this exact
 * provisional row — so they land in the team/captain slot they were invited to.
 *
 * Contract:  GET /join?p=<playerId>   -> text/plain instructions
 * Deploy:    npx supabase functions deploy join --no-verify-jwt \
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
    return reply('This invite link looks invalid. Ask whoever invited you to resend it.');
  }
  let team = '';
  let claimed = false;
  try {
    const svc = createClient(PROJECT_URL, SERVICE);
    const { data } = await svc.from('players').select('house_name, profile_id').eq('id', id).maybeSingle();
    team = (data?.house_name as string | null) ?? '';
    claimed = !!(data?.profile_id);
  } catch {
    // fall through with generic copy
  }

  if (claimed) {
    return reply('This invite has already been accepted. If that was you, just open the SportnNote app. If not, contact whoever invited you.');
  }

  const forTeam = team ? ` to join ${team}` : '';
  return reply(
    `You have been invited${forTeam} on SportnNote - the app for scoring and following matches.\n\n` +
    `To accept:\n` +
    `1) Install the SportnNote app (ask the person who invited you for the download link).\n` +
    `2) Open it and register with THIS phone number - the one this invite was sent to.\n\n` +
    `That is it - you will be placed in your team automatically. If you already have the app, just open it and register with this number.\n\n` +
    `Didn't expect this? You can ignore the message - nothing is created for you unless you install the app and register yourself.`,
  );
});
