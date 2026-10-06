/**
 * Edge Function: message-notify
 * ------------------------------------------------------------------------
 * Delivers ONE just-sent in-app message (migration 0027). The client calls this
 * right after send_message / reply_message with the new message's id:
 *
 *   • recipient has an inbox (the player, or a linked guardian) → push to their
 *     devices ("💬 New message from …");
 *   • about an under-18 whose guardian hasn't linked yet → email the guardian
 *     address on file with the message + a link code, so they can read & reply
 *     in their own account. The child is never notified.
 *
 * Guards: signed-in caller must be the message's sender; each message is
 * delivered at most once (notified_at) and only within 10 minutes of sending;
 * guardian emails are capped at 3 per child per day. Links are stripped from
 * anything we relay.
 *
 * Contract: POST { messageId } → 200 { delivered: 'push' | 'email' | 'none' }
 * Deploy:   supabase functions deploy message-notify
 * Secrets:  RESEND_API_KEY, SUPPORT_EMAIL, INVITE_FROM/SUPPORT_FROM (shared).
 */
import { admin, clip, CORS, guardianLinkSteps, json, pushToProfiles, rateLimit, requireUser, sendEmail, stripLinks } from '../_shared/guard.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const caller = await requireUser(req);
  if (caller instanceof Response) return caller;
  const { messageId } = (await req.json().catch(() => ({}))) as { messageId?: unknown };
  if (typeof messageId !== 'string') return json({ error: 'messageId required' }, 400);

  // Claim the delivery atomically: only the sender, only once, only if fresh.
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: msg } = await admin.from('messages')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', messageId).eq('sender_profile_id', caller.user.id).is('notified_at', null).gte('created_at', since)
    .select('id, body, thread_id').maybeSingle();
  if (!msg) return json({ delivered: 'none', reason: 'not deliverable' });

  const { data: thread } = await admin.from('message_threads')
    .select('subject_player_id, sender_profile_id, recipient_profile_id, via_guardian').eq('id', msg.thread_id).single();
  if (!thread) return json({ delivered: 'none' });

  const [{ data: child }, { data: me }] = await Promise.all([
    admin.from('players').select('id, full_name, guardian').eq('id', thread.subject_player_id).single(),
    admin.from('players').select('full_name').eq('profile_id', caller.user.id).limit(1).maybeSingle(),
  ]);
  const senderName = clip(me?.full_name, 60) || 'A SportnNote user';
  const preview = stripLinks(clip(msg.body, 140));

  // Who receives it: the other party of the conversation.
  const to = caller.user.id === thread.sender_profile_id ? thread.recipient_profile_id : thread.sender_profile_id;
  if (to) {
    const about = thread.via_guardian && caller.user.id === thread.sender_profile_id ? ` · about ${child?.full_name ?? 'your child'}` : '';
    const n = await pushToProfiles([to], { title: `💬 ${senderName}${about}`, body: preview, data: { threadId: msg.thread_id } });
    return json({ delivered: n ? 'push' : 'none' });
  }

  // Guardian not on the app yet → email them (with a code to link their account).
  const email = (child?.guardian as { email?: string } | null)?.email ?? '';
  if (!thread.via_guardian || !email) return json({ delivered: 'none' });
  if (!(await rateLimit('guardian-email', thread.subject_player_id, 3, 86400))) return json({ delivered: 'none', reason: 'email cap' });
  const { data: code, error } = await admin.rpc('create_guardian_link_code', { p_player: thread.subject_player_id });
  if (error || !code) return json({ delivered: 'none', reason: 'no code' });
  const childName = child?.full_name ?? 'your child';
  const sent = await sendEmail(
    email,
    `${senderName} wants to get in touch about ${childName} on SportnNote`,
    `Hello,\n\n${senderName} sent a message about ${childName} on SportnNote. Because ${childName} is under 18, messages about them come to you as their parent/guardian.\n\n` +
    `"${stripLinks(clip(msg.body, 2000))}"\n\n${guardianLinkSteps(code as string)}\n\n` +
    `Didn't expect this? You can ignore it - nothing is shared unless you link your account.`,
  );
  return json({ delivered: sent ? 'email' : 'none' });
});
