/**
 * SD-152 — account deletion steps shared by `delete-account` (the user, or their
 * linked guardian) and `privacy-retention` (child accounts whose guardian declined
 * or withdrew consent, after 30 days).
 *
 *   1. delete_account_data(profile) — wipes personal data (migration 0030);
 *      sporting records stay as "Deleted player".
 *   2. privacy_after_delete(profile) — drops open guardian-consent codes and the
 *      consent state (migration 20261020120000).
 *   3. Removes their uploaded files (ID proofs; their own player photos in the
 *      public `media` bucket and, by reference, the private `player-photos` one).
 *   4. Closes the login (soft delete: the auth row is kept with its email
 *      scrambled, so foreign keys from tournaments etc. don't break).
 */
import { admin } from './guard.ts';

export const DOCS_BUCKET = 'verification-docs';
const MEDIA_BUCKET = 'media';
const PHOTOS_BUCKET = 'player-photos';

/** Every object path under `${prefix}/` in a bucket, recursing into folders. */
export async function listAll(bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return out;
  for (const item of data) {
    const path = `${prefix}/${item.name}`;
    // Folders come back without an id.
    if (item.id) out.push(path);
    else out.push(...(await listAll(bucket, path)));
  }
  return out;
}

/** Remove every object under `prefix` in `bucket`. Never throws; false when a
 *  removal failed (the caller can retry next run). */
export async function removePrefix(bucket: string, prefix: string): Promise<boolean> {
  let ok = true;
  try {
    const paths = await listAll(bucket, prefix);
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
      if (error) { ok = false; console.error('storage remove', bucket, error); }
    }
  } catch (e) {
    ok = false;
    console.error('storage cleanup', bucket, e);
  }
  return ok;
}

export type DeleteResult = { ok: true } | { ok: false; stage: 'data' | 'auth'; error: unknown };

/** Delete one account end to end. */
export async function deleteAccountFully(uid: string): Promise<DeleteResult> {
  // Their own private player photos (protect-minors migration) — read the refs
  // before the rows are scrubbed. Photos they uploaded for OTHER players stay.
  const { data: own } = await admin.from('players').select('photo_url').eq('profile_id', uid);
  const privatePhotos = ((own ?? []) as { photo_url: string | null }[])
    .map((r) => r.photo_url ?? '')
    .filter((u) => u.startsWith(`private://${PHOTOS_BUCKET}/`))
    .map((u) => u.slice(`private://${PHOTOS_BUCKET}/`.length));

  const { error: dataErr } = await admin.rpc('delete_account_data', { p_profile: uid });
  if (dataErr) return { ok: false, stage: 'data', error: dataErr };
  const { error: privErr } = await admin.rpc('privacy_after_delete', { p_profile: uid });
  if (privErr) console.error('privacy_after_delete', privErr); // migration not run yet — not fatal

  // Uploaded documents live under `${uid}/…`; of the uploaded images only the
  // person's own photos go — tournament/club/match logos they uploaded belong to
  // things other people run. A missing bucket just lists nothing.
  await removePrefix(DOCS_BUCKET, uid);
  await removePrefix(MEDIA_BUCKET, `${uid}/player-photo`);
  if (privatePhotos.length) {
    const { error } = await admin.storage.from(PHOTOS_BUCKET).remove(privatePhotos);
    if (error) console.error('storage remove', PHOTOS_BUCKET, error);
  }

  const { error: authErr } = await admin.auth.admin.deleteUser(uid, true);
  if (authErr) return { ok: false, stage: 'auth', error: authErr };
  return { ok: true };
}
