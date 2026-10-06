/**
 * Edge Function: guardian-link
 * ------------------------------------------------------------------------
 * Invites a minor's parent/guardian to link THEIR OWN SportnNote account
 * (migration 0027). Called from the child's profile ("Invite guardian"): emails
 * the guardian address on file a one-time code; the guardian enters it under
 * Settings → "Link as a parent/guardian" (claim_guardian_link RPC). Receiving the
 * code proves they own that email — which also marks the guardian email verified
 * server-side — and from then on messages about the child go to their inbox.
 *
 * Guards: signed-in caller must own the child's player profile; 3 invites per
 * child per day.
 *
 * Contract: POST { playerId } → 200 { sent: boolean }
 * Deploy:   supabase functions deploy guardian-link
 * Secrets:  RESEND_API_KEY, SUPPORT_EMAIL, INVITE_FROM/SUPPORT_FROM (shared).
 */
import { admin, clip, CORS, guardianLinkSteps, json, rateLimit, requireUser, sendEmail } from '../_shared/guard.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const caller = await requireUser(req);
  if (caller instanceof Response) return caller;
  const { playerId } = (await req.json().catch(() => ({}))) as { playerId?: unknown };
  if (typeof playerId !== 'string') return json({ error: 'playerId required' }, 400);

  const { data: child } = await admin.from('players').select('id, profile_id, full_name, guardian').eq('id', playerId).single();
  if (!child || child.profile_id !== caller.user.id) return json({ error: 'not your profile' }, 403);
  const g = (child.guardian ?? {}) as { name?: string; email?: string };
  if (!g.email) return json({ sent: false, reason: 'Add your parent/guardian\'s email first.' }, 400);
  if (!(await rateLimit('guardian-link', playerId, 3, 86400))) return json({ sent: false, reason: 'Already sent 3 today — try tomorrow.' }, 429);

  const { data: code, error } = await admin.rpc('create_guardian_link_code', { p_player: playerId });
  if (error || !code) return json({ sent: false, reason: 'Could not create a code.' }, 500);
  const childName = clip(child.full_name, 60) || 'Your child';
  const sent = await sendEmail(
    g.email,
    `${childName} added you as their parent/guardian on SportnNote`,
    `Hello${g.name ? ` ${clip(g.name, 60)}` : ''},\n\n${childName} added you as their parent/guardian on SportnNote, the app for school sports scores and profiles.\n\n` +
    `Coaches and scouts can't contact under-18 players directly - their messages come to you instead.\n\n${guardianLinkSteps(code as string)}\n\n` +
    `Didn't expect this? You can ignore it.`,
  );
  return json({ sent });
});
