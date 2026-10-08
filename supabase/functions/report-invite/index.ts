/**
 * Edge Function: report-invite  (PUBLIC — deploy with --no-verify-jwt)
 * ------------------------------------------------------------------------
 * "This isn't me" for someone added to a team by phone who shouldn't have been —
 * no app or account needed. Stamps players.reported_at (service role) for an
 * UNCLAIMED provisional player only, so it can never flag a registered account.
 *
 * Opening a link must never record anything: chat apps fetch links to build
 * previews, which would report people who never tapped. So:
 *   GET  /report-invite?p=<id>      → 302 to the web app's invite page, which asks
 *                                     "Not you?" with a confirm button
 *   POST /report-invite  { p: <id> } → records it (what that button calls)
 *
 * Deploy:    npx supabase functions deploy report-invite --no-verify-jwt \
 *              --project-ref mpgbvbylmkwasjgupsbq
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const PROJECT_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.sportnnote.in';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    const id = new URL(req.url).searchParams.get('p') ?? '';
    return new Response(null, { status: 302, headers: { ...CORS, Location: UUID.test(id) ? `${APP_URL}/i/${id}?notme=1` : APP_URL, 'Cache-Control': 'no-store' } });
  }
  let id = '';
  try { id = String(((await req.json()) as { p?: unknown }).p ?? ''); } catch { /* bad body */ }
  if (!UUID.test(id)) return json({ ok: false, error: 'invalid' }, 400);
  try {
    const svc = createClient(PROJECT_URL, SERVICE);
    await svc.from('players').update({ reported_at: new Date().toISOString() }).eq('id', id).is('profile_id', null);
  } catch {
    return json({ ok: false, error: 'failed' }, 500);
  }
  return json({ ok: true });
});
