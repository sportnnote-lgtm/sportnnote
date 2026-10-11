/**
 * Edge Function: privacy-retention  (SD-152, daily)
 * ------------------------------------------------------------------------
 * Storage limitation (UK GDPR Art 5(1)(e), SG PDPA, APP 11.2, DPDP):
 *
 *   1. ID proofs: 30 days after a verification is approved or rejected, the
 *      uploaded files under `verification-docs/<uploader>/<playerId>/` are
 *      removed and the row keeps only the outcome (status, when, by whom) —
 *      due_verification_docs() / mark_verification_doc_deleted().
 *   2. Child accounts whose parent/guardian said no or withdrew consent, and
 *      didn't confirm again within 30 days, are deleted like "Delete my account"
 *      — due_withdrawn_accounts() + _shared/deleteAccount.ts.
 *
 * Schedule it once a day (Dashboard → Database → Cron, or pg_cron):
 *   select cron.schedule(
 *     'privacy-retention', '30 3 * * *',
 *     $$ select net.http_post(
 *          url     := 'https://<PROJECT_REF>.functions.supabase.co/privacy-retention',
 *          headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>')
 *        ) $$
 *   );
 *
 * Only the cron job may call it: `Authorization: Bearer <SERVICE_ROLE_KEY>` or
 * `x-cron-secret: <CRON_SECRET>`.
 * Testing: POST { "dry": true } lists what WOULD be removed, without removing.
 *
 * Deploy:  supabase functions deploy privacy-retention
 * Secrets: optional CRON_SECRET, optional RETENTION_GRACE_DAYS (default 30).
 */
import { admin, safeEqual } from '../_shared/guard.ts';
import { deleteAccountFully, DOCS_BUCKET, removePrefix } from '../_shared/deleteAccount.ts';

const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const GRACE = Math.max(1, Number(Deno.env.get('RETENTION_GRACE_DAYS') ?? '30') || 30);

function isCron(req: Request): boolean {
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (SERVICE_ROLE_KEY && bearer && safeEqual(bearer, SERVICE_ROLE_KEY)) return true;
  const cron = req.headers.get('x-cron-secret') ?? '';
  return !!CRON_SECRET && !!cron && safeEqual(cron, CRON_SECRET);
}

/** "uid/playerId/123.jpg" → "uid/playerId" (every submission for that player). */
export const docFolder = (docPath: string): string | null => {
  const [a, b] = docPath.split('/');
  return a && b ? `${a}/${b}` : null;
};

Deno.serve(async (req) => {
  if (!isCron(req)) return new Response('forbidden', { status: 403 });
  const opts = await req.json().catch(() => ({})) as { dry?: boolean };
  const dry = opts.dry === true;

  const { data: docs, error: dErr } = await admin.rpc('due_verification_docs', { p_grace_days: GRACE });
  if (dErr) console.error('due_verification_docs', dErr);
  const { data: withdrawn, error: wErr } = await admin.rpc('due_withdrawn_accounts', { p_grace_days: GRACE });
  if (wErr) console.error('due_withdrawn_accounts', wErr);
  const dueDocs = (docs ?? []) as { player_id: string; doc_path: string }[];
  const dueAccounts = ((withdrawn ?? []) as { profile_id: string }[]).map((r) => r.profile_id);
  if (dry) return Response.json({ dry: true, graceDays: GRACE, docs: dueDocs.length, accounts: dueAccounts.length });

  let docsDone = 0;
  for (const d of dueDocs) {
    const folder = docFolder(d.doc_path);
    // Keep the row's reference until the files are really gone (retried tomorrow).
    if (folder && !(await removePrefix(DOCS_BUCKET, folder))) continue;
    const { error } = await admin.rpc('mark_verification_doc_deleted', { p_player: d.player_id });
    if (error) console.error('mark_verification_doc_deleted', d.player_id, error);
    else docsDone++;
  }

  let accountsDone = 0;
  for (const uid of dueAccounts) {
    const res = await deleteAccountFully(uid);
    if (res.ok) accountsDone++;
    else console.error('retention delete', uid, res.stage, res.error);
  }
  return Response.json({ docs: docsDone, accounts: accountsDone });
});
