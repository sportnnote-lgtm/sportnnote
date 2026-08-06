/** Shared voice/typed scoring panel for any sport whose plugin declares `voice`.
 *  A mic toggle (Web Speech / native adapter) drives *continuous, hands-free*
 *  listening — every spoken call is parsed by the plugin's pure parser. Because a
 *  mishear must never silently change a scoreline, calls default to a **confirm**
 *  step (propose → tap to apply); a scorer who trusts it can flip on **auto-apply**
 *  for confident calls, with a live feed + one-tap **Undo** as the safety net.
 *  Typed commands are explicit, so they apply immediately. */
import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Button, TextField, textStyles } from '../components/ui';
import { useSpeech } from '../core/speech';
import type { Player } from '../core/types';
import type { ScoreAction, SportPlugin } from './types';

/** Below this recognizer confidence a call is sent to confirm even in auto mode
 *  (0 / absent confidence ⇒ unknown ⇒ trusted, so it still works where the
 *  browser doesn't report one). */
const LOW_CONFIDENCE = 0.55;

type LogKind = 'applied' | 'confirmed' | 'discarded' | 'unheard';
interface LogEntry { id: number; text: string; summary: string; kind: LogKind }
interface Pending { text: string; actions: ScoreAction[]; summary: string; conf?: number; typed?: boolean }

export function VoiceScorer({
  voice, state, dispatch, homeName, awayName, homeRoster = [], awayRoster = [], onUndo,
}: {
  voice: NonNullable<SportPlugin['voice']>;
  state: unknown;
  dispatch: (a: ScoreAction) => void;
  homeName: string;
  awayName: string;
  homeRoster?: Player[];
  awayRoster?: Player[];
  /** the live screen's rewind — wired to the "Undo last" safety button */
  onUndo?: () => void;
}) {
  const [text, setText] = useState('');
  const [autoApply, setAutoApply] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const idRef = useRef(0);

  // Hints use a `{name}` token so the example reads with a real player from this
  // match ("two Nidhi") rather than a stock placeholder no one recognises.
  const sampleName = (homeRoster[0] ?? awayRoster[0])?.fullName?.split(' ')[0] ?? 'a player';
  const hints = voice.hints.map((h) => h.replace(/\{name\}/g, sampleName));

  /** Human-readable one-liner for what a parsed call will do. */
  const describe = (actions: ScoreAction[]): string => {
    const a = actions[actions.length - 1];
    const p = a.payload as Record<string, unknown> | undefined;
    const who = a.attribution?.playerName;
    const sideName = a.side === 'home' ? homeName : a.side === 'away' ? awayName : '';
    const detail = p?.runs != null ? `${p.runs} run${p.runs === 1 ? '' : 's'}`
      : p?.points != null ? `${p.points} pt`
      : p?.kind ? String(p.kind)
      : a.type.toLowerCase();
    return `${detail}${who ? ` · ${who}` : ''}${sideName ? ` — ${sideName}` : ''}`;
  };

  const pushLog = (text: string, summary: string, kind: LogKind) =>
    setLog((prev) => [{ id: ++idRef.current, text, summary, kind }, ...prev].slice(0, 6));

  const applyNow = (actions: ScoreAction[], text: string, summary: string, kind: LogKind = 'applied') => {
    actions.forEach(dispatch);
    pushLog(text, summary, kind);
    setPending(null);
  };

  /** A recognized phrase (or a typed command). `typed` = explicit intent → apply. */
  const handle = (raw: string, confidence?: number, typed = false) => {
    const t = raw.trim();
    if (!t) return;
    const actions = voice.parse(t, { state, homeName, awayName, homeRoster, awayRoster });
    if (!actions || actions.length === 0) { pushLog(t, `didn’t catch “${t}”`, 'unheard'); return; }
    const summary = describe(actions);
    const lowConf = confidence != null && confidence > 0 && confidence < LOW_CONFIDENCE;
    // Auto mode applies confident calls straight away; Confirm mode (default) and any
    // low-confidence call wait for a tap — a mishear never changes the score silently.
    if (autoApply && !lowConf) applyNow(actions, t, summary);
    else setPending({ text: t, actions, summary, conf: confidence, typed });
  };

  const speech = useSpeech(handle);
  const send = () => { if (text.trim()) { handle(text, undefined, true); setText(''); } };

  const kindIcon = (k: LogKind) => (k === 'applied' ? '✅' : k === 'confirmed' ? '✅' : k === 'discarded' ? '↩︎' : '🤔');

  return (
    <View style={st.box}>
      <View style={st.headRow}>
        <Button
          label={speech.listening ? '🛑 Stop listening' : '🎤 Voice scoring'}
          variant={speech.listening ? 'danger' : 'ghost'}
          style={st.flex}
          onPress={() =>
            speech.listening ? speech.stop() : speech.supported ? speech.start()
              : pushLog('', 'voice needs Chrome/Edge on web (or a device build) — type below', 'unheard')
          }
        />
        <Button
          label={autoApply ? '⚡ Auto ON' : '✋ Confirm'}
          variant={autoApply ? 'primary' : 'ghost'}
          onPress={() => setAutoApply((v) => !v)}
          accessibilityHint={autoApply ? 'Confident calls apply automatically' : 'Every call waits for you to tap Apply'}
        />
      </View>
      {speech.interim ? <Text style={st.heard}>🎙 {speech.interim}</Text> : null}
      <Text style={textStyles.muted}>
        Say e.g. {hints.slice(0, 3).map((h) => `“${h}”`).join(', ')}.{' '}
        {autoApply ? 'Confident calls apply automatically.' : 'Each call waits for you to tap Apply.'}
      </Text>

      {/* Proposal awaiting confirmation — the safety step against a mishear. */}
      {pending ? (
        <View style={st.pending}>
          <View style={{ flex: 1 }}>
            <Text style={st.pendingHeard} numberOfLines={1}>{pending.typed ? 'Call' : 'Heard'} “{pending.text}”</Text>
            <Text style={st.pendingSummary} numberOfLines={1}>→ {pending.summary}</Text>
          </View>
          <Button label="✕" variant="ghost" onPress={() => { pushLog(pending.text, pending.summary, 'discarded'); setPending(null); }} />
          <Button label="✓ Apply" variant="primary" onPress={() => applyNow(pending.actions, pending.text, pending.summary, 'confirmed')} />
        </View>
      ) : null}

      <View style={st.row}>
        <View style={st.flex}>
          <TextField label="" value={text} onChange={setText} placeholder="…or type a command" autoCapitalize="none" />
        </View>
        <Button label="Send" variant="ghost" onPress={send} disabled={!text.trim()} />
      </View>

      {/* Live call feed + one-tap undo — so any wrong call is visible and reversible. */}
      {log.length > 0 ? (
        <View style={st.feed}>
          <View style={st.feedHead}>
            <Text style={st.feedTitle}>Recent calls</Text>
            {onUndo ? <Button label="↩ Undo last" variant="ghost" style={st.undoBtn} onPress={onUndo} /> : null}
          </View>
          {log.map((e) => (
            <Text key={e.id} style={[st.feedRow, e.kind === 'unheard' && st.feedMuted]} numberOfLines={1}>
              {kindIcon(e.kind)} {e.summary}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  box: {
    gap: theme.spacing(2),
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    padding: theme.spacing(3),
  },
  headRow: { flexDirection: 'row', gap: theme.spacing(2), alignItems: 'center' },
  row: { flexDirection: 'row', gap: theme.spacing(2), alignItems: 'flex-end' },
  flex: { flex: 1 },
  heard: { color: theme.colors.accent, fontSize: theme.font.small, fontStyle: 'italic' },
  pending: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2),
    backgroundColor: theme.colors.primary + '1A', borderRadius: theme.radius.sm,
    borderWidth: 1, borderColor: theme.colors.primary, padding: theme.spacing(2),
  },
  pendingHeard: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700' },
  pendingSummary: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  feed: { gap: 2, marginTop: theme.spacing(1) },
  feedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  feedTitle: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  undoBtn: { paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(2) },
  feedRow: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '600' },
  feedMuted: { color: theme.colors.textMuted, fontWeight: '400' },
});
