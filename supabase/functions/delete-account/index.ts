/**
 * Edge Function: delete-account
 * ------------------------------------------------------------------------
 * "Delete my account" (Settings). DPDP / GDPR right to erasure; also required by
 * the App Store and Google Play.
 *
 *   POST { confirm: "DELETE" }                         → deletes the CALLER's account
 *   POST { confirm: "DELETE", childPlayerId: "<id>" }  → SD-152: a linked parent/
 *        guardian deletes their child's data (the child's account, or — for a
 *        child an organiser added who has no account — the player record).
 *        Checked server-side: guardian_delete_target() raises unless the caller is
 *        that player's linked guardian (players.guardian_profile_id).
 *
 * Steps (shared with privacy-retention): _shared/deleteAccount.ts.
 *
 * Contract: → 200 { deleted: true }
 * Deploy:   supabase functions deploy delete-account   (redeploy: _shared changed)
 */
import { admin, CORS, json, rateLimit, requireUser, tooMany } from '../_shared/guard.ts';
import { deleteAccountFully } from '../_shared/deleteAccount.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const caller = await requireUser(req);
  if (caller instanceof Response) return caller;
  if (!(await rateLimit('delete-account', caller.user.id, 3, 3600))) return tooMany();

  let body: { confirm?: unknown; childPlayerId?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  if (body.confirm !== 'DELETE') return json({ error: 'Type DELETE to confirm.' }, 400);

  // A guardian deleting their child's data.
  if (body.childPlayerId !== undefined) {
    if (typeof body.childPlayerId !== 'string') return json({ error: 'childPlayerId must be a string' }, 400);
    const { data: target, error: tErr } = await admin.rpc('guardian_delete_target', {
      p_guardian: caller.user.id, p_player: body.childPlayerId,
    });
    if (tErr || !target) return json({ error: 'Only the linked parent or guardian can delete this child’s data.' }, 403);
    const t = target as { profileId: string | null; playerId: string };
    if (!t.profileId) {
      const { error } = await admin.rpc('scrub_player_personal_data', { p_player: t.playerId });
      if (error) {
        console.error('scrub_player_personal_data', error);
        return json({ error: 'Couldn’t delete just now — please try again or contact support.' }, 500);
      }
      return json({ deleted: true });
    }
    if (t.profileId === caller.user.id) return json({ error: 'Use Delete my account for your own account.' }, 400);
    const res = await deleteAccountFully(t.profileId);
    if (!res.ok) {
      console.error('guardian delete', res.stage, res.error);
      return json({ error: res.stage === 'data'
        ? 'Couldn’t delete just now — please try again or contact support.'
        : 'Their data was deleted but closing the login failed — please try again.' }, 500);
    }
    return json({ deleted: true });
  }

  const res = await deleteAccountFully(caller.user.id);
  if (!res.ok) {
    console.error('delete-account', res.stage, res.error);
    // stage 'auth': personal data is already gone; the login closing failed. Report it so the user can retry.
    return json({ error: res.stage === 'data'
      ? 'Couldn’t delete your data just now — please try again or contact support.'
      : 'Your data was deleted but signing you out everywhere failed — please try again.' }, 500);
  }
  return json({ deleted: true });
});
