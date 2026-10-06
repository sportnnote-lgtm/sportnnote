/** In-app messaging (migration 0027) — reach a player without seeing their number.
 *
 *  Rules (enforced server-side; mirrored here for demo mode):
 *   • Only adults (18+) can send.
 *   • A message about an UNDER-18 player goes to their parent/guardian's inbox,
 *     never to the child. Until the guardian links their own account it's emailed
 *     to the guardian address on file, with a code to link (see guardian-link).
 *   • The sender never sees the guardian's name or contact details.
 *   • Recipients can block the other person and report a message.
 *  Live writes are RPCs; after each send we ask the `message-notify` edge function
 *  to deliver it (push, or the guardian email). */
import { supabase, isSupabaseConfigured } from '../core/supabase';
import { ageOf } from '../core/age';
import { demo, genId } from './demoStore';

export interface MessageThread {
  threadId: string;
  /** the player the conversation is about (the recipient, or the guardian's child) */
  subjectPlayerId: string;
  subjectName: string;
  /** who you're talking to, as shown in the inbox ("Parent/guardian of …" when routed) */
  otherName: string;
  /** a player profile to open for the other side, when there is one */
  otherPlayerId?: string;
  iStarted: boolean;
  viaGuardian: boolean;
  /** routed to a guardian who hasn't linked an account yet (emailed meanwhile) */
  awaitingGuardian: boolean;
  lastMessageAt: string;
  lastBody?: string;
  lastFromMe?: boolean;
  unread: boolean;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  mine: boolean;
  body: string;
  createdAt: string;
  /** removed by SportnNote support after a report (body is a placeholder) */
  removed?: boolean;
}

const live = () => isSupabaseConfigured && !!supabase;

/* --------------------------- demo (in-memory) ---------------------------- */
// Demo has a single local user; threads are ones "I" started. Enough to walk the
// UI end-to-end without a backend.
interface DemoThread { id: string; playerId: string; viaGuardian: boolean; lastAt: string }
const demoThreads: DemoThread[] = [];
const demoMessages: { id: string; threadId: string; body: string; at: string }[] = [];

function demoRoute(playerId: string): { viaGuardian: boolean } {
  const p = demo.players.find((x) => x.id === playerId);
  if (!p) throw new Error('Player not found');
  const age = ageOf(p);
  if (age === undefined || age < 18) {
    if (!p.guardian?.email && !p.guardian?.phone) throw new Error('This player\'s parent/guardian can\'t be reached on SportnNote yet.');
    return { viaGuardian: true };
  }
  return { viaGuardian: false };
}

function demoThreadView(t: DemoThread): MessageThread {
  const p = demo.players.find((x) => x.id === t.playerId);
  const name = p?.fullName ?? 'Player';
  const last = [...demoMessages].reverse().find((m) => m.threadId === t.id);
  return {
    threadId: t.id, subjectPlayerId: t.playerId, subjectName: name,
    otherName: t.viaGuardian ? `Parent/guardian of ${name}` : name, otherPlayerId: t.playerId,
    iStarted: true, viaGuardian: t.viaGuardian, awaitingGuardian: t.viaGuardian,
    lastMessageAt: t.lastAt, lastBody: last?.body, lastFromMe: true, unread: false,
  };
}

/* ------------------------------- shared ---------------------------------- */

const cleanBody = (body: string) => {
  const b = body.trim();
  if (!b) throw new Error('Write a message first.');
  if (b.length > 2000) throw new Error('Messages can be up to 2000 characters.');
  return b;
};

/** Ask the server to deliver a just-sent message (push / guardian email). Best-effort. */
async function deliver(messageId: string): Promise<void> {
  try { await supabase!.functions.invoke('message-notify', { body: { messageId } }); } catch { /* best-effort */ }
}

/** Start (or continue) a conversation about a player. Returns the thread id. */
export async function sendMessageToPlayer(playerId: string, body: string): Promise<string> {
  const text = cleanBody(body);
  if (!live()) {
    const route = demoRoute(playerId);
    let t = demoThreads.find((x) => x.playerId === playerId);
    const at = new Date().toISOString();
    if (!t) { t = { id: genId('thr'), playerId, viaGuardian: route.viaGuardian, lastAt: at }; demoThreads.unshift(t); }
    demoMessages.push({ id: genId('msg'), threadId: t.id, body: text, at });
    t.lastAt = at;
    return t.id;
  }
  const { data, error } = await supabase!.rpc('send_message', { p_player: playerId, p_body: text });
  if (error) throw new Error(error.message);
  const row = (data as { thread_id: string; message_id: string }[] | null)?.[0];
  if (!row) throw new Error('Could not send the message');
  void deliver(row.message_id);
  return row.thread_id;
}

/** Reply in an existing conversation. */
export async function replyToThread(threadId: string, body: string): Promise<void> {
  const text = cleanBody(body);
  if (!live()) {
    const t = demoThreads.find((x) => x.id === threadId);
    if (!t) throw new Error('Conversation not found');
    const at = new Date().toISOString();
    demoMessages.push({ id: genId('msg'), threadId, body: text, at });
    t.lastAt = at;
    return;
  }
  const { data, error } = await supabase!.rpc('reply_message', { p_thread: threadId, p_body: text });
  if (error) throw new Error(error.message);
  if (data) void deliver(data as string);
}

/** My conversations, newest first. */
export async function getMyThreads(): Promise<MessageThread[]> {
  if (!live()) return [...demoThreads].sort((a, b) => b.lastAt.localeCompare(a.lastAt)).map(demoThreadView);
  const { data, error } = await supabase!.rpc('my_threads');
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((r) => ({
    threadId: r.thread_id, subjectPlayerId: r.subject_player_id, subjectName: r.subject_name,
    otherName: r.other_name, otherPlayerId: r.other_player_id ?? undefined,
    iStarted: r.i_started, viaGuardian: r.via_guardian, awaitingGuardian: r.awaiting_guardian,
    lastMessageAt: r.last_message_at, lastBody: r.last_body ?? undefined, lastFromMe: r.last_from_me ?? undefined,
    unread: !!r.unread,
  }));
}

/** How many conversations have something I haven't read. */
export async function getUnreadThreadCount(): Promise<number> {
  try { return (await getMyThreads()).filter((t) => t.unread).length; } catch { return 0; }
}

/** The conversation I already started about this player, if any. */
export async function findMyThreadForPlayer(playerId: string): Promise<string | null> {
  if (!live()) return demoThreads.find((t) => t.playerId === playerId)?.id ?? null;
  const { data } = await supabase!.rpc('my_thread_for_player', { p_player: playerId });
  return (data as string | null) ?? null;
}

/** Messages in a conversation, oldest first. */
export async function getThreadMessages(threadId: string, myProfileId?: string): Promise<ChatMessage[]> {
  if (!live()) {
    return demoMessages.filter((m) => m.threadId === threadId)
      .map((m) => ({ id: m.id, threadId, mine: true, body: m.body, createdAt: m.at }));
  }
  const { data, error } = await supabase!
    .from('messages').select('id, thread_id, sender_profile_id, body, created_at, removed_at')
    .eq('thread_id', threadId).order('created_at', { ascending: true }).limit(500);
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id, threadId: r.thread_id, mine: r.sender_profile_id === myProfileId, body: r.body, createdAt: r.created_at,
    removed: !!r.removed_at,
  }));
}

export async function markThreadRead(threadId: string): Promise<void> {
  if (!live()) return;
  await supabase!.rpc('mark_thread_read', { p_thread: threadId });
}

/** Block the other person in this conversation — they can't message you again. */
export async function blockThreadSender(threadId: string): Promise<void> {
  if (!live()) return;
  const { error } = await supabase!.rpc('block_thread_sender', { p_thread: threadId });
  if (error) throw new Error(error.message);
}

/** Report a message to SportnNote support. */
export async function reportMessage(messageId: string, reason: string): Promise<void> {
  if (!live()) return;
  const { error } = await supabase!.rpc('report_message', { p_message: messageId, p_reason: reason });
  if (error) throw new Error(error.message);
}

/* ---------------------------- guardian link ------------------------------ */

/** From the child's profile: email the guardian a code to link their own account. */
export async function inviteGuardianToLink(playerId: string): Promise<{ sent: boolean; reason?: string }> {
  if (!live()) return { sent: true };
  const { data, error } = await supabase!.functions.invoke('guardian-link', { body: { playerId } });
  const d = data as { sent?: boolean; reason?: string } | null;
  if (error && !d) return { sent: false, reason: 'Could not send right now — try again later.' };
  return { sent: !!d?.sent, reason: d?.reason };
}

/** As a parent/guardian (signed in with my own account): enter the emailed code. */
export async function claimGuardianLink(code: string): Promise<string> {
  const c = code.trim().toUpperCase();
  if (!c) throw new Error('Enter the code from the email.');
  if (!live()) throw new Error('Guardian linking needs the live app.');
  const { data, error } = await supabase!.rpc('claim_guardian_link', { p_code: c });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Children linked to me as their guardian. */
export async function getMyGuardedPlayers(): Promise<{ id: string; fullName: string }[]> {
  if (!live()) return [];
  const { data } = await supabase!.rpc('my_guarded_players');
  return ((data ?? []) as { id: string; full_name: string }[]).map((r) => ({ id: r.id, fullName: r.full_name }));
}

/* ------------------------------ live updates ------------------------------ */

/** Listen for new / removed messages in a conversation while it's open (Supabase
 *  Realtime; RLS means only participants receive rows). Returns an unsubscribe.
 *  No-op in demo mode. */
export function subscribeToThread(threadId: string, onChange: () => void): () => void {
  if (!live()) return () => {};
  const ch = supabase!
    .channel(`thread:${threadId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` }, () => onChange())
    .subscribe();
  return () => { void supabase!.removeChannel(ch); };
}

/* -------------------------------- blocking -------------------------------- */

export interface BlockedPerson { id: string; label: string; createdAt: string }

/** People I've blocked (label + an opaque id — never their account). */
export async function getMyBlocks(): Promise<BlockedPerson[]> {
  if (!live()) return [];
  const { data, error } = await supabase!.rpc('my_blocks');
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; label: string; created_at: string }[])
    .map((r) => ({ id: r.id, label: r.label, createdAt: r.created_at }));
}

export async function unblock(blockId: string): Promise<void> {
  if (!live()) return;
  const { error } = await supabase!.rpc('unblock_message_sender', { p_block: blockId });
  if (error) throw new Error(error.message);
}

/* ---------------------------- support moderation --------------------------- */

export interface MessageReport {
  reportId: string;
  createdAt: string;
  status: 'open' | 'actioned' | 'dismissed';
  resolution?: 'dismissed' | 'removed' | 'banned';
  reason?: string;
  messageId?: string;
  threadId?: string;
  /** the reported text as it was when reported (kept even after removal) */
  messageBody?: string;
  messageRemoved: boolean;
  reporterName?: string;
  senderName?: string;
  senderBanned: boolean;
  subjectName?: string;
  viaGuardian: boolean;
  /** total reports ever filed against this sender */
  reportCount: number;
}

export type ReportAction = 'dismiss' | 'remove' | 'ban';

/** Support: the message-report queue. */
export async function getMessageReports(status: 'open' | 'all' = 'open'): Promise<MessageReport[]> {
  if (!live()) return [];
  const { data, error } = await supabase!.rpc('support_message_reports', { p_status: status });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((r) => ({
    reportId: r.report_id, createdAt: r.created_at, status: r.status, resolution: r.resolution ?? undefined,
    reason: r.reason ?? undefined, messageId: r.message_id ?? undefined, threadId: r.thread_id ?? undefined,
    messageBody: r.message_body ?? undefined, messageRemoved: !!r.message_removed,
    reporterName: r.reporter_name ?? undefined, senderName: r.sender_name ?? undefined,
    senderBanned: !!r.sender_banned, subjectName: r.subject_name ?? undefined,
    viaGuardian: !!r.via_guardian, reportCount: r.report_count ?? 0,
  }));
}

/** Support: dismiss a report, remove the message, or remove it AND turn off the
 *  sender's messaging. Resolves every open report on that message. */
export async function resolveMessageReport(reportId: string, action: ReportAction): Promise<void> {
  const { error } = await supabase!.rpc('support_resolve_report', { p_report: reportId, p_action: action });
  if (error) throw new Error(error.message);
}

/** Support: turn a sender's messaging back on. */
export async function liftMessagingBan(reportId: string): Promise<void> {
  const { error } = await supabase!.rpc('support_lift_messaging_ban', { p_report: reportId });
  if (error) throw new Error(error.message);
}
