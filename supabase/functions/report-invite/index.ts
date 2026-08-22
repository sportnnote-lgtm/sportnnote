/**
 * Edge Function: report-invite  (PUBLIC — deploy with --no-verify-jwt)
 * ------------------------------------------------------------------------
 * The "this isn't me" link in a provisional-player WhatsApp invite. Opened in a
 * browser by someone who was added to a team by phone but shouldn't have been —
 * no app or account needed. Stamps players.reported_at (service role, so it
 * bypasses RLS) for the given provisional player, then shows a plain confirmation
 * page. Restricted to UNCLAIMED players (profile_id is null) so it can never flag
 * a real registered account.
 *
 * Contract:  GET /report-invite?p=<playerId>   → text/html confirmation
 * Deploy:    npx supabase functions deploy report-invite --no-verify-jwt \
 *              --project-ref mpgbvbylmkwasjgupsbq
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function page(title: string, body: string): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SportnNote</title>
<style>
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    background:#0B0F14;color:#E8EDF2;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
  .card{max-width:420px;background:#141A21;border:1px solid #243040;border-radius:22px;padding:32px;text-align:center}
  h1{font-size:22px;margin:0 0 12px} p{color:#9FB0C0;font-size:15px;line-height:1.5;margin:0}
  .mark{font-size:44px;margin-bottom:8px}
</style></head><body><div class="card"><div class="mark">✅</div><h1>${title}</h1><p>${body}</p></div></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

Deno.serve(async (req) => {
  const id = new URL(req.url).searchParams.get('p') ?? '';
  if (!UUID.test(id)) {
    return page('Link not recognized', 'This report link looks invalid. If someone added you by mistake, ignore the message — you won’t be signed up for anything.');
  }
  try {
    const svc = createClient(URL, SERVICE);
    // Only flag an UNCLAIMED provisional player — never a registered account.
    await svc.from('players').update({ reported_at: new Date().toISOString() }).eq('id', id).is('profile_id', null);
  } catch {
    return page('Something went wrong', 'We couldn’t record that just now. You can safely ignore the invite — nothing is created for you unless you install SportnNote and register yourself.');
  }
  return page('Thanks — noted', 'We’ve flagged that this isn’t you. The organizer will be told, and you won’t be added or signed up for anything. No app needed.');
});
