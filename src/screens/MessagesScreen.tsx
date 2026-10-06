/** Inbox — conversations started with you (or with your child, as their linked
 *  parent/guardian) and ones you started. See data/messages.ts for the rules. */
import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, Pill, ScreenTitle, FormError, textStyles } from '../components/ui';
import { getMyThreads, getMyBlocks, unblock, type MessageThread, type BlockedPerson } from '../data/messages';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const when = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

export default function MessagesScreen() {
  const nav = useNavigation<Nav>();
  const [threads, setThreads] = useState<MessageThread[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [blocks, setBlocks] = useState<BlockedPerson[]>([]);

  const load = useCallback(async () => {
    try { setThreads(await getMyThreads()); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load messages'); setThreads([]); }
    getMyBlocks().then(setBlocks).catch(() => {});
  }, []);
  const doUnblock = async (b: BlockedPerson) => {
    try { await unblock(b.id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not unblock'); }
  };
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={st.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <ScreenTitle title="Messages" subtitle="Your number stays private — people reach you here" />
        <FormError message={error} />
        {threads && threads.length === 0 && (
          <Card style={{ gap: theme.spacing(1) }}>
            <Text style={textStyles.body}>No messages yet.</Text>
            <Text style={textStyles.muted}>Open a player&apos;s profile and tap “💬 Message” to get in touch. Messages about under-18 players go to their parent/guardian.</Text>
          </Card>
        )}
        {(threads ?? []).map((t) => (
          <TouchableOpacity
            key={t.threadId}
            accessibilityRole="button"
            accessibilityLabel={`Conversation with ${t.otherName}${t.unread ? ', unread' : ''}`}
            activeOpacity={0.8}
            onPress={() => nav.navigate('Conversation', { threadId: t.threadId, title: t.otherName })}
          >
            <Card style={st.row}>
              <View style={[st.dot, !t.unread && st.dotRead]} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={st.top}>
                  <Text style={[textStyles.body, t.unread && st.bold, { flex: 1 }]} numberOfLines={1}>{t.otherName}</Text>
                  <Text style={textStyles.muted}>{when(t.lastMessageAt)}</Text>
                </View>
                {!t.iStarted && t.viaGuardian ? <Text style={st.about}>About your child {t.subjectName}</Text> : null}
                <Text style={textStyles.muted} numberOfLines={1}>{t.lastFromMe ? 'You: ' : ''}{t.lastBody ?? ''}</Text>
                {t.iStarted && t.awaitingGuardian ? (
                  <Pill label="Emailed to their parent/guardian" color={theme.colors.surfaceAlt} textColor={theme.colors.textMuted} />
                ) : null}
              </View>
            </Card>
          </TouchableOpacity>
        ))}

        {blocks.length > 0 && (
          <Card style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.h3}>🚫 Blocked</Text>
            <Text style={textStyles.muted}>They can&apos;t message you. Unblock to let them reach you again.</Text>
            {blocks.map((b) => (
              <View key={b.id} style={st.top}>
                <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>{b.label}</Text>
                <Text style={st.unblock} accessibilityRole="button" accessibilityLabel={`Unblock ${b.label}`} onPress={() => doUnblock(b)}>Unblock</Text>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing(3) },
  top: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.primary, marginTop: 6 },
  dotRead: { backgroundColor: 'transparent' },
  bold: { fontWeight: '800' },
  unblock: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
  about: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700' },
});
