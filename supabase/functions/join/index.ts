/**
 * Edge Function: join  (PUBLIC — deploy with --no-verify-jwt)
 * ------------------------------------------------------------------------
 * The accept link in a provisional-player invite (WhatsApp/SMS).
 *
 * The shared *.supabase.co/functions domain forces text/plain (anti-phishing),
 * so it can't show a real page with a sign-up button. So:
 *   GET /join?p=<playerId>              → 302 to the web app's invite page
 *                                          (app.sportnnote.in/i/<id>), where the
 *                                          person signs up right there with the
 *                                          invited number and lands in the team.
 *   GET /join?p=<playerId>&format=json  → { team, teamId, claimed } for that page.
 * Older messages carry this link, so it keeps working forever.
 *
 * Deploy:    npx supabase functions deploy join --no-verify-jwt \
 *              --project-ref mpgbvbylmkwasjgupsbq
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const PROJECT_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.sportnnote.in';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  const id = url.searchParams.get('p') ?? '';
  const json = url.searchParams.get('format') === 'json';
  if (!json) {
    return new Response(null, { status: 302, headers: { ...CORS, Location: UUID.test(id) ? `${APP_URL}/i/${id}` : APP_URL, 'Cache-Control': 'no-store' } });
  }
  const out = { team: '', teamId: null as string | null, claimed: false };
  if (UUID.test(id)) {
    try {
      const svc = createClient(PROJECT_URL, SERVICE);
      const [{ data: p }, { data: teams }] = await Promise.all([
        svc.from('players').select('house_name, profile_id').eq('id', id).maybeSingle(),
        // teams.roster is jsonb, so match it as a JSON array
        svc.from('teams').select('id, name').contains('roster', JSON.stringify([id])).limit(1),
      ]);
      out.claimed = !!p?.profile_id;
      out.team = (teams?.[0]?.name as string | undefined) ?? (p?.house_name as string | null) ?? '';
      out.teamId = (teams?.[0]?.id as string | undefined) ?? null;
    } catch { /* generic page */ }
  }
  return new Response(JSON.stringify(out), { headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
});
