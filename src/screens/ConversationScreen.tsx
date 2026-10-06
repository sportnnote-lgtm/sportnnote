/** One conversation. Opened from the inbox (threadId) or from a player's profile
 *  (playerId — resumes your existing conversation about them, or starts one on
 *  first send). Under-18s are reached through their parent/guardian; the sender
 *  never sees the guardian's details. Block + report live in the header menu. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { confirmAction, notice } from '../core/confirm';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { FormError, textStyles } from '../components/ui';
import { useAuth } from '../core/auth';
import {
  getThreadMessages, sendMessageToPlayer, replyToThread, markThreadRead, findMyThreadForPlayer,
  blockThreadSender, reportMessage, subscribeToThread, type ChatMessage,
} from '../data/messages';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ConversationScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Conversation'>>();
  const { profile } = useAuth();
  const [threadId, setThreadId] = useState<string | null>(params.threadId ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => { nav.setOptions({ title: params.title ?? 'Message' }); }, [nav, params.title]);

  // From a profile: resume the conversation I already started about this player.
  useEffect(() => {
    if (threadId || !params.playerId) return;
    findMyThreadForPlayer(params.playerId).then((id) => { if (id) setThreadId(id); }).catch(() => {});
  }, [threadId, params.playerId]);

  const load = useCallback(async () => {
    if (!threadId) return;
    try {
      setMessages(await getThreadMessages(threadId, profile?.id));
      if (!params.readOnly) void markThreadRead(threadId);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load messages'); }
  }, [threadId, profile?.id, params.readOnly]);
  // Refresh on focus, and live while the conversation is open (new replies,
  // or a message removed by support).
  useFocusEffect(useCallback(() => {
    void load();
    if (!threadId) return undefined;
    return subscribeToThread(threadId, () => { void load(); });
  }, [load, threadId]));

  const send = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      if (threadId) await replyToThread(threadId, draft);
      else if (params.playerId) setThreadId(await sendMessageToPlayer(params.playerId, draft));
      setDraft('');
      if (threadId) await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send');
    } finally { setBusy(false); }
  };

  const block = async () => {
    if (!threadId) return;
    if (!(await confirmAction('Block this person?', 'They won’t be able to message you. You can unblock them later from Messages.', 'Block', true))) return;
    try { await blockThreadSender(threadId); nav.goBack(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not block'); }
  };
  const report = async (m: ChatMessage) => {
    if (!(await confirmAction('Report this message?', 'Our support team will review it.', 'Report', true))) return;
    try { await reportMessage(m.id, 'Reported from conversation'); notice('Reported', 'Thanks — our team will take a look.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not report'); }
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <ScrollView
          ref={scroll}
          contentContainerStyle={st.content}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
        >
          {!threadId && (
            <Text style={[textStyles.muted, st.center]}>
              {params.viaGuardian
                ? 'This player is under 18, so your message goes to their parent/guardian — not to them. You won’t see the guardian’s contact details.'
                : 'Your number stays private. They can reply here.'}
            </Text>
          )}
          {messages.map((m) => (
            <TouchableOpacity
              key={m.id}
              activeOpacity={0.9}
              onLongPress={m.mine || m.removed || params.readOnly ? undefined : () => void report(m)}
              accessibilityHint={m.mine || m.removed || params.readOnly ? undefined : 'Long-press to report'}
              style={[st.bubble, m.mine ? st.mine : st.theirs, m.removed && st.removed]}
            >
              <Text style={[st.body, m.mine && st.mineText, m.removed && st.removedText]}>{m.body}</Text>
              <Text style={[st.time, m.mine && st.mineText]}>
                {new Date(m.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
              </Text>
            </TouchableOpacity>
          ))}
          {threadId && !params.readOnly && messages.some((m) => !m.mine) && (
            <Text style={st.blockLink} accessibilityRole="button" onPress={() => void block()}>Block this person</Text>
          )}
        </ScrollView>
        <FormError message={error} />
        {params.readOnly ? (
          <Text style={[textStyles.muted, st.center]}>Support view — read only.</Text>
        ) : (
        <View style={st.composer}>
          <TextInput
            style={st.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a message…"
            placeholderTextColor={theme.colors.textMuted}
            multiline
            maxLength={2000}
            accessibilityLabel="Message"
          />
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Send" onPress={send} disabled={busy || !draft.trim()} style={[st.send, (busy || !draft.trim()) && { opacity: 0.4 }]}>
            <Text style={st.sendText}>{busy ? '…' : 'Send'}</Text>
          </TouchableOpacity>
        </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(2), flexGrow: 1 },
  center: { textAlign: 'center', marginVertical: theme.spacing(4) },
  bubble: { maxWidth: '82%', padding: theme.spacing(3), borderRadius: 14, gap: 4 },
  mine: { alignSelf: 'flex-end', backgroundColor: theme.colors.primary },
  theirs: { alignSelf: 'flex-start', backgroundColor: theme.colors.surface },
  body: { color: theme.colors.text, fontSize: theme.font.body },
  mineText: { color: '#06120D' },
  time: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  removed: { backgroundColor: theme.colors.surfaceAlt },
  removedText: { color: theme.colors.textMuted, fontStyle: 'italic' },
  blockLink: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700', textAlign: 'center', marginTop: theme.spacing(4) },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing(2), padding: theme.spacing(3), borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.bg },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderRadius: 12, paddingHorizontal: theme.spacing(3), paddingVertical: theme.spacing(2), backgroundColor: theme.colors.surface, color: theme.colors.text, fontSize: theme.font.body },
  send: { paddingHorizontal: theme.spacing(4), paddingVertical: theme.spacing(2) + 2, borderRadius: 12, backgroundColor: theme.colors.primary },
  sendText: { color: '#06120D', fontWeight: '800' },
});
