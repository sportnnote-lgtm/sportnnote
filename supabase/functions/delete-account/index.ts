/**
 * Edge Function: delete-account
 * ------------------------------------------------------------------------
 * "Delete my account" (Settings). DPDP right to erasure; also required by the
 * App Store and Google Play. Only ever acts on the CALLER's own account.
 *
 *   1. delete_account_data(profile) — wipes personal data in the database
 *      (migration 0030); sporting records stay as "Deleted player".
 *   2. Removes their uploaded files (age/ID proofs in `verification-docs`).
 *   3. Closes the login (soft delete: the auth row is kept with its email
 *      scrambled, so foreign keys from tournaments etc. don't break).
 *
 * Contract: POST { confirm: "DELETE" } → 200 { deleted: true }
 */
import { admin, CORS, json, rateLimit, requireUser, tooMany } from '../_shared/guard.ts';

const DOCS_BUCKET = 'verification-docs';

/** Every object path under `${prefix}/`, recursing into folders. */
async function listAll(prefix: string): Promise<string[]> {
  const out: string[] = [];
  const { data, error } = await admin.storage.from(DOCS_BUCKET).list(prefix, { limit: 1000 });
  if (error || !data) return out;
  for (const item of data) {
    const path = `${prefix}/${item.name}`;
    // Folders come back without an id.
    if (item.id) out.push(path);
    else out.push(...(await listAll(path)));
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const caller = await requireUser(req);
  if (caller instanceof Response) return caller;
  if (!(await rateLimit('delete-account', caller.user.id, 3, 3600))) return tooMany();

  let body: { confirm?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  if (body.confirm !== 'DELETE') return json({ error: 'Type DELETE to confirm.' }, 400);

  const uid = caller.user.id;

  const { error: dataErr } = await admin.rpc('delete_account_data', { p_profile: uid });
  if (dataErr) {
    console.error('delete_account_data', dataErr);
    return json({ error: 'Couldn’t delete your data just now — please try again or contact support.' }, 500);
  }

  // Uploaded documents live under `${uid}/…` (see repos.ts → verification upload).
  try {
    const paths = await listAll(uid);
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await admin.storage.from(DOCS_BUCKET).remove(paths.slice(i, i + 100));
      if (error) console.error('storage remove', error);
    }
  } catch (e) {
    console.error('storage cleanup', e);
  }

  const { error: authErr } = await admin.auth.admin.deleteUser(uid, true);
  if (authErr) {
    console.error('deleteUser', authErr);
    // Personal data is already gone; the login closing failed. Report it so the user can retry.
    return json({ error: 'Your data was deleted but signing you out everywhere failed — please try again.' }, 500);
  }
  return json({ deleted: true });
});
