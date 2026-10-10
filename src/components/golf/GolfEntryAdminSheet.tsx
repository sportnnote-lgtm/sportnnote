/** SD-35 — the organiser's entry admin for one golfer in one round (GF-04):
 *  withdraw (WD), disqualify (DQ) or did not start (DNS) with a reason,
 *  reinstate, edit the Handicap Index (net scores and strokes received
 *  recompute) and remove the entry. Opened by a long-press on a leaderboard
 *  row or the ⋯ on a scorecard. Presentational: the round screen saves. */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip, TextField, FormError, textStyles } from '../ui';
import { parseIndex, showIndex } from '../../data/golfLeaderboard';
import type { EntryAdmin, EntryStatus } from '../../sports/golf/engine';

type Choice = 'playing' | EntryAdmin['status'];

/** Common reasons, one tap each (the organiser can type their own). */
const REASONS: Record<EntryAdmin['status'], string[]> = {
  wd: ['Injury', 'Illness', 'Personal reasons'],
  dq: ['Wrong score signed (Rule 3.3b)', 'Late on the tee (Rule 5.3)', 'Breach of the rules (Rule 1.3)', 'Card not returned'],
  dns: ['No-show', 'Withdrew before the round'],
};
const LABEL: Record<Choice, string> = { playing: 'Playing', wd: 'WD — withdrew', dq: 'DQ — disqualified', dns: 'DNS — did not start' };
const HINT: Record<Choice, string> = {
  playing: 'In the competition as normal.',
  wd: 'Withdrew during the round: no score returned — listed below the field (R&A).',
  dq: 'Disqualified: no score — listed below the field.',
  dns: 'Never teed off: no score and no stat line.',
};

export function GolfEntryAdminSheet({
  visible, name, status, admin, thru, handicapIndex, roundState, onClose, onStatus, onHandicap, onRemove,
}: {
  visible: boolean;
  name: string;
  status: EntryStatus;
  admin?: EntryAdmin;
  /** holes on the card so far (a WD after starting is noted "after N") */
  thru: number;
  handicapIndex?: number;
  roundState: 'scheduled' | 'live' | 'completed';
  onClose: () => void;
  onStatus: (admin: EntryAdmin | null) => Promise<void>;
  onHandicap: (index: number | undefined) => Promise<void>;
  onRemove: () => void;
}) {
  const current: Choice = status === 'wd' || status === 'dq' || status === 'dns' ? status : 'playing';
  const [choice, setChoice] = useState<Choice>(current);
  const [reason, setReason] = useState(admin?.reason ?? '');
  const [idx, setIdx] = useState(showIndex(handicapIndex));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // a fresh sheet per player / open
  useEffect(() => {
    if (!visible) return;
    setChoice(current); setReason(admin?.reason ?? ''); setIdx(showIndex(handicapIndex)); setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, name]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); }
    finally { setBusy(false); }
  };
  const statusChanged = choice !== current || (choice !== 'playing' && reason.trim() !== (admin?.reason ?? ''));
  const applyStatus = () => run(() => onStatus(choice === 'playing' ? null : { status: choice, reason: reason.trim() || undefined, ...(choice === 'wd' && thru > 0 ? { thru } : {}) }));
  const idxValue = parseIndex(idx);
  const idxBad = !!idx.trim() && idxValue == null;
  const idxChanged = !idxBad && (idxValue ?? null) !== (handicapIndex ?? null);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} accessibilityLabel="Close entry admin">
        <Pressable style={st.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView contentContainerStyle={{ gap: theme.spacing(3) }} keyboardShouldPersistTaps="handled">
            <View style={st.head}>
              <Text style={st.title} numberOfLines={1}>⛳ {name}</Text>
              <Text style={st.close} accessibilityRole="button" accessibilityLabel="Close" onPress={onClose}>✕</Text>
            </View>
            <Text style={textStyles.muted}>Organiser only · {thru > 0 ? `thru ${thru}` : 'not started'}</Text>

            <Text style={st.section}>Status</Text>
            <View style={st.chips}>
              {(['playing', 'wd', 'dq', 'dns'] as Choice[]).map((c) => (
                <SelectChip key={c} label={LABEL[c]} active={choice === c} onPress={() => { setChoice(c); if (c !== current) setReason(''); }} />
              ))}
            </View>
            <Text style={textStyles.muted}>{HINT[choice]}{choice === 'dns' && thru > 0 ? ' (They have scores on the card — WD fits better.)' : ''}</Text>
            {choice !== 'playing' && (
              <>
                <View style={st.chips}>
                  {REASONS[choice].map((r) => <SelectChip key={r} label={r} active={reason === r} onPress={() => setReason(reason === r ? '' : r)} />)}
                </View>
                <TextField label="Reason (shown on the leaderboard)" value={reason} onChange={setReason} placeholder="e.g. Back injury" />
              </>
            )}
            <Button label={busy ? 'Saving…' : choice === 'playing' ? (current === 'playing' ? 'No change' : '↺ Reinstate') : `Save ${choice.toUpperCase()}`} onPress={() => void applyStatus()} disabled={busy || !statusChanged} />

            <Text style={st.section}>Handicap Index</Text>
            <TextField label="Index (e.g. 12.4, or +1.2 for a plus handicap)" value={idx} onChange={setIdx} placeholder="Blank = no handicap" autoCapitalize="none" />
            {idxBad ? <Text style={st.warn}>Enter 0–54 (one decimal), or a plus handicap up to +10.</Text> : null}
            {roundState !== 'scheduled' ? <Text style={textStyles.muted}>Strokes received and net scores recompute for the whole card{roundState === 'completed' ? '; the round\'s stat lines are rewritten.' : '.'}</Text> : null}
            <Button label={busy ? 'Saving…' : 'Save handicap'} variant="ghost" onPress={() => void run(() => onHandicap(idxValue))} disabled={busy || !idxChanged} />

            <Text style={st.section}>Entry</Text>
            <Button label="🗑 Remove from this round…" variant="danger" onPress={onRemove} disabled={busy} />
            <FormError message={error} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(4), maxHeight: '88%', width: '100%', maxWidth: 640, alignSelf: 'center',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  title: { flex: 1, color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '800' },
  close: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '800', padding: theme.spacing(1) },
  section: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', marginTop: theme.spacing(1) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  warn: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
});
