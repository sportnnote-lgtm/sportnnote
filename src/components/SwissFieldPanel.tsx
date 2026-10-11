/** SD-134 — "Who plays round N": the Swiss field before the next round is
 *  paired. Per entrant: withdraw (not paired again), absent this round (0),
 *  a requested ½- or 0-point bye (½ capped by the organiser's limit), and
 *  late entries (join from round N with 0 or ½ for each missed round). Saved
 *  on the tournament's sport format (`swissOps`) — the pairing skips anyone
 *  not available, the table scores the byes. Withdrawing asks first. */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip, textStyles } from './ui';
import { askConfirm } from './ConfirmSheet';
import {
  unavailableIn, withdraw, reinstate, setAbsent, setRequestedBye, addLate, removeLate, setHpbLimit, hpbLimitOf, halfByesOf,
  type SwissOps,
} from '../data/swissOps';

const half = (n: number) => String(n).replace('.5', '½').replace(/^0½$/, '½');

export function SwissFieldPanel({ round, entrants, candidates, ops, onSave, busy }: {
  /** the round about to be paired */
  round: number;
  /** everyone in the Swiss so far (with their score) */
  entrants: { id: string; name: string; score?: number }[];
  /** tournament entrants not yet in the Swiss (late-entry candidates) */
  candidates: { id: string; name: string }[];
  ops: SwissOps;
  onSave: (next: SwissOps) => Promise<void>;
  busy?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [lateMissed, setLateMissed] = useState<0 | 0.5>(0);
  const [note, setNote] = useState<string | null>(null);
  const limit = hpbLimitOf(ops);
  const save = async (next: SwissOps | string) => {
    if (typeof next === 'string') { setNote(next); return; }
    setNote(null);
    await onSave(next);
  };
  const statusOf = (id: string) => {
    const why = unavailableIn(ops, id, round);
    if (why === 'withdrawn') return `Withdrawn (from round ${ops.withdrawn![id]})`;
    if (why === 'absent') return 'Absent this round — 0';
    if (why === 'bye') { const p = ops.byes?.[id]?.[String(round)] ?? 0; return `${half(p)}-point bye (requested)`; }
    if (why === 'late') return `Joins in round ${ops.late![id].round}`;
    return ops.late?.[id] ? `Late entry (missed rounds: ${half(ops.late[id].missed)} each)` : 'Plays';
  };
  const paired = entrants.filter((e) => unavailableIn(ops, e.id, round) === null).length;

  return (
    <View style={st.box}>
      <Text style={st.head}>🧾 Who plays round {round}</Text>
      <Text style={textStyles.muted}>
        {paired} of {entrants.length} to pair. Tap a name to withdraw, mark absent or give a requested bye. Not paired = 0 points (FIDE: an unplayed round).
      </Text>
      {entrants.map((e) => {
        const why = unavailableIn(ops, e.id, round);
        const isOpen = open === e.id;
        const curBye = ops.byes?.[e.id]?.[String(round)];
        return (
          <View key={e.id} style={[st.row, why && st.rowOff]}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${e.name}: ${statusOf(e.id)}`} onPress={() => setOpen(isOpen ? null : e.id)} style={st.rowHead}>
              <Text style={[textStyles.body, st.flex, why && st.off]} numberOfLines={1}>{e.name}{e.score !== undefined ? ` · ${half(e.score)}` : ''}</Text>
              <Text style={[st.status, why ? st.statusOff : null]} numberOfLines={1}>{statusOf(e.id)}</Text>
            </TouchableOpacity>
            {isOpen && (
              <View style={st.chips}>
                {why === 'withdrawn' ? (
                  <SelectChip label="↩ Bring back" active={false} onPress={() => void save(reinstate(ops, e.id))} />
                ) : (
                  <>
                    <SelectChip label="Plays" active={!why} onPress={() => void save(curBye !== undefined ? (setRequestedBye(ops, e.id, round, null) as SwissOps) : setAbsent(ops, e.id, round, false))} />
                    <SelectChip label="Absent (0)" active={why === 'absent'} onPress={() => void save(setAbsent(ops, e.id, round, why !== 'absent'))} />
                    <SelectChip label={`½ bye (${halfByesOf(ops, e.id)}/${limit})`} active={curBye === 0.5}
                      onPress={() => { const r = setRequestedBye(ops, e.id, round, curBye === 0.5 ? null : 0.5); void save(r === 'limit' ? `${e.name} has used the ${limit} half-point bye${limit === 1 ? '' : 's'} allowed. Give a 0-point bye, or raise the limit below.` : r === 'withdrawn' ? `${e.name} has withdrawn.` : r); }} />
                    <SelectChip label="0 bye" active={curBye === 0} onPress={() => { const r = setRequestedBye(ops, e.id, round, curBye === 0 ? null : 0); void save(typeof r === 'string' ? `${e.name} has withdrawn.` : r); }} />
                    <SelectChip label="🚪 Withdraw…" active={false} onPress={() => void (async () => {
                      const ok = await askConfirm({
                        title: `Withdraw ${e.name}?`,
                        message: `${e.name} won't be paired from round ${round} on. Their results so far stay; each round they miss scores 0. You can bring them back later.`,
                        yesLabel: 'Yes, withdraw', noLabel: 'No, keep them in', tone: 'danger',
                      });
                      if (ok) await save(withdraw(ops, e.id, round));
                    })()} />
                    {ops.late?.[e.id] && <SelectChip label="✕ Not a late entry" active={false} onPress={() => void save(removeLate(ops, e.id))} />}
                  </>
                )}
              </View>
            )}
          </View>
        );
      })}
      {note ? <Text style={[textStyles.muted, { color: theme.colors.accent }]}>{note}</Text> : null}

      {round >= 2 && candidates.length > 0 && (
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={st.sub}>＋ Late entry — joins from round {round}</Text>
          <View style={st.chips}>
            <SelectChip label="Missed rounds: 0" active={lateMissed === 0} onPress={() => setLateMissed(0)} />
            <SelectChip label="Missed rounds: ½ each" active={lateMissed === 0.5} onPress={() => setLateMissed(0.5)} />
          </View>
          <View style={st.chips}>
            {candidates.map((c) => (
              <SelectChip key={c.id} label={`＋ ${c.name}`} active={false} onPress={() => void (async () => {
                const ok = await askConfirm({
                  title: `Add ${c.name} from round ${round}?`,
                  message: `${c.name} is paired from round ${round}. Rounds 1–${round - 1} score ${half(lateMissed)} each (not games played).`,
                  yesLabel: 'Yes, add them', noLabel: 'No', tone: 'caution',
                });
                if (ok) await save(addLate(ops, c.id, round, lateMissed, c.name));
              })()} />
            ))}
          </View>
        </View>
      )}

      <View style={{ gap: theme.spacing(1) }}>
        <Text style={st.sub}>Half-point byes a player may request</Text>
        <View style={st.chips}>
          {[0, 1, 2, 3, 4].map((n) => <SelectChip key={n} label={String(n)} active={limit === n} onPress={() => void save(setHpbLimit(ops, n))} />)}
        </View>
      </View>
      {busy ? <Text style={textStyles.muted}>Saving…</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  box: { gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  head: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  sub: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  row: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border, paddingTop: theme.spacing(1), gap: theme.spacing(1) },
  rowOff: { opacity: 0.85 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), minHeight: 36 },
  flex: { flex: 1 },
  off: { color: theme.colors.textMuted },
  status: { color: theme.colors.textMuted, fontSize: theme.font.small, maxWidth: '55%' },
  statusOff: { color: theme.colors.accent, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
