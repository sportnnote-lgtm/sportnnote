/**
 * The generic "correct a finished match" list (parity #05): every team action in
 * the match's log, newest first. Stage ✕ Remove (void) or ✎ Player (re-credit an
 * attributed action to someone else); nothing is saved until the scorer previews
 * and publishes. Sports with their own editor (cricket, #06) replace this.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Card, Pill, SelectChip, textStyles } from './ui';
import type { MatchEventRecord, Player } from '../core/types';
import type { AmendOp } from '../sports/amend';
import type { ScoreAction } from '../sports/types';

const humanize = (t: string) => t.replace(/[_-]+/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** The ScoreAction a record replays as (so a replace keeps everything else). */
export const recordAction = (r: MatchEventRecord): ScoreAction => ({
  type: r.type,
  side: r.side ?? undefined,
  payload: r.payload ?? undefined,
  attribution: r.attribution ?? undefined,
});

export function EventCorrectionList({ log, ops, onOps, homeName, awayName, homeRoster, awayRoster }: {
  /** the effective log (corrections already applied) */
  log: MatchEventRecord[];
  ops: AmendOp[];
  onOps: (ops: AmendOp[], lines: string[]) => void;
  homeName: string;
  awayName: string;
  homeRoster: Player[];
  awayRoster: Player[];
}) {
  const [picking, setPicking] = useState<number | null>(null);
  const rows = log.filter((r) => r.side === 'home' || r.side === 'away').reverse();
  const team = (r: MatchEventRecord) => (r.side === 'home' ? homeName : awayName);
  const describe = (r: MatchEventRecord) =>
    `${humanize(r.type)} · ${team(r)}${r.attribution?.playerName ? ` · ${r.attribution.playerName}` : ''}`;
  const opFor = (seq: number) => ops.find((o) => o.seq === seq);

  const setOp = (seq: number, op: AmendOp | null) => {
    const others = ops.filter((o) => o.seq !== seq);
    const next = op ? [...others, op] : others;
    // Rebuild every line from the staged ops so un-staging drops its line too.
    const lines = next.map((o) => {
      const r = log.find((x) => x.seq === o.seq);
      if (!r) return '';
      return o.op === 'void'
        ? `Removed: ${describe(r)}`
        : `Changed: ${describe(r)} → ${o.action.attribution?.playerName ?? 'someone else'}`;
    }).filter(Boolean);
    onOps(next, lines);
  };

  if (!rows.length) return <Text style={textStyles.muted}>Nothing to correct in this match’s log.</Text>;

  return (
    <View style={{ gap: theme.spacing(2) }}>
      {rows.map((r) => {
        const op = opFor(r.seq);
        const roster = r.side === 'home' ? homeRoster : awayRoster;
        const removed = op?.op === 'void';
        const changedTo = op?.op === 'replace' ? op.action.attribution?.playerName : null;
        return (
          <Card key={r.seq} style={{ gap: theme.spacing(2), opacity: removed ? 0.55 : 1 }}>
            <View style={st.row}>
              <Text style={[textStyles.body, { flex: 1 }, removed && st.struck]} numberOfLines={2}>{describe(r)}</Text>
              {removed ? <Pill label="removed" /> : changedTo ? <Pill label="changed" /> : null}
            </View>
            {changedTo ? <Text style={textStyles.muted}>→ {changedTo}</Text> : null}
            <View style={st.actions}>
              <Text style={removed ? st.undo : st.remove} accessibilityRole="button"
                onPress={() => setOp(r.seq, removed ? null : { op: 'void', seq: r.seq })}>
                {removed ? '↺ Keep' : '✕ Remove'}
              </Text>
              {r.attribution && !removed ? (
                <Text style={st.link} accessibilityRole="button" onPress={() => setPicking(picking === r.seq ? null : r.seq)}>
                  {picking === r.seq ? 'Close' : '✎ Player'}
                </Text>
              ) : null}
              {changedTo ? <Text style={st.undo} accessibilityRole="button" onPress={() => setOp(r.seq, null)}>↺ Undo change</Text> : null}
            </View>
            {picking === r.seq && r.attribution ? (
              <View style={st.chips}>
                {roster.filter((p) => p.id !== r.attribution!.playerId).map((p) => (
                  <SelectChip key={p.id} label={p.fullName} active={op?.op === 'replace' && op.action.attribution?.playerId === p.id}
                    onPress={() => {
                      const base = recordAction(r);
                      const payload = { ...(base.payload ?? {}) } as Record<string, unknown>;
                      if ('playerName' in payload) payload.playerName = p.fullName;
                      if ('name' in payload) payload.name = p.fullName;
                      if ('playerId' in payload) payload.playerId = p.id;
                      setOp(r.seq, { op: 'replace', seq: r.seq, action: { ...base, payload, attribution: { ...r.attribution!, playerId: p.id, playerName: p.fullName } } });
                      setPicking(null);
                    }} />
                ))}
              </View>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  actions: { flexDirection: 'row', gap: theme.spacing(4) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  struck: { textDecorationLine: 'line-through' },
  remove: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '800' },
  undo: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800' },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
});
