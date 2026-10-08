/**
 * Cricket's correction editor (parity #06): innings → overs (newest first) →
 * ball chips. Tap a ball to edit it in place (runs, off bat / bye / leg bye, who
 * faced; out type and fielder; wide ⇄ no ball), tap the bowler to replace them
 * for this over or all their overs, tap a batter to swap two batters' records.
 * Edits are staged as #05 AMEND ops — nothing changes until "Update score"
 * (live) or Preview → Publish (after the match).
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip, textStyles } from '../../components/ui';
import type { MatchEventRecord, Player } from '../../core/types';
import type { AmendOp } from '../amend';
import {
  editableOvers, editBall, changeBowlerOps, swapBattersOps, applyOps, chipLabel, overSymbolTone,
  ballDiffLine, bowlerDiffLine, swapDiffLine, describeBall, CATEGORY_HINT,
  type EditableBall, type EditableInnings, type EditableOver, type BallEdit,
} from './editOvers';

type Staged = { key: string; ops: AmendOp[]; line: string };
const WICKET_KINDS = [['bowled', 'Bowled'], ['caught', 'Caught'], ['lbw', 'LBW'], ['stumped', 'Stumped'], ['runout', 'Run out'], ['hitwicket', 'Hit wicket']] as const;

export function OverEditor({ log, config, onOps, homeName, awayName, homeRoster, awayRoster }: {
  log: MatchEventRecord[];
  config?: Record<string, unknown>;
  ops: AmendOp[];
  onOps: (ops: AmendOp[], lines: string[]) => void;
  homeName: string; awayName: string;
  homeRoster: Player[]; awayRoster: Player[];
}) {
  const [staged, setStaged] = useState<Staged[]>([]);
  const allOps = useMemo(() => staged.flatMap((s) => s.ops), [staged]);
  // What the scorecard looks like with the staged edits applied.
  const view = useMemo(() => editableOvers(applyOps(log, allOps), config), [log, allOps, config]);
  const touched = new Set(allOps.map((o) => o.seq));
  const [openInn, setOpenInn] = useState<number>(0);
  const [editing, setEditing] = useState<{ ball: EditableBall; over: EditableOver; inn: EditableInnings } | null>(null);
  const [bowlerPick, setBowlerPick] = useState<{ over: EditableOver; inn: EditableInnings; scope: 'over' | 'all'; to?: Player } | null>(null);
  const [swapPick, setSwapPick] = useState<{ batter: { id: string; name: string }; inn: EditableInnings; to?: Player } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Over lists are rebuilt as edits are staged — match overs by innings + number.
  const isOver = (x: { over: EditableOver; inn: EditableInnings } | null, inn: EditableInnings, ov: EditableOver) =>
    !!x && x.inn.inningsIx === inn.inningsIx && x.inn.side === inn.side && x.over.n === ov.n;
  const teamOf = (side: 'home' | 'away') => (side === 'home' ? homeName : awayName);
  const rosterOf = (side: 'home' | 'away') => (side === 'home' ? homeRoster : awayRoster);
  const other = (side: 'home' | 'away') => (side === 'home' ? 'away' : 'home');

  const stage = (key: string, ops: AmendOp[], line: string) => {
    // A newer edit of the same thing replaces the older one.
    const next = [...staged.filter((s) => s.key !== key), ...(ops.length ? [{ key, ops, line }] : [])];
    setStaged(next);
    onOps(next.flatMap((s) => s.ops), next.map((s) => s.line));
  };

  return (
    <View style={{ gap: theme.spacing(3) }}>
      {view.length === 0 ? <Text style={textStyles.muted}>No balls bowled yet.</Text> : null}
      {view.map((inn, ii) => (
        <View key={`${inn.side}${inn.inningsIx}`} style={st.innings}>
          <TouchableOpacity accessibilityRole="button" onPress={() => setOpenInn(openInn === ii ? -1 : ii)} style={st.innHead}>
            <Text style={textStyles.h3}>{teamOf(inn.side)} {inn.header}</Text>
            <Text style={textStyles.muted}>{openInn === ii ? '▴' : '▾'}</Text>
          </TouchableOpacity>
          {openInn === ii && inn.overs.map((ov) => (
            <View key={ov.n} style={st.over}>
              <View style={st.overHead}>
                <Text style={st.ovNo}>Ov {ov.n}</Text>
                <Text style={[st.link, ov.balls.some((b) => touched.has(b.seq)) && st.changed]} accessibilityRole="button"
                  onPress={() => { setError(null); setBowlerPick({ over: ov, inn, scope: 'over' }); setEditing(null); setSwapPick(null); }}>
                  {ov.bowler.name}
                </Text>
                <Text style={textStyles.muted}>to</Text>
                {ov.batters.map((b) => (
                  <Text key={b.id} style={st.link} accessibilityRole="button"
                    onPress={() => { setError(null); setSwapPick({ batter: b, inn }); setEditing(null); setBowlerPick(null); }}>{b.name}</Text>
                ))}
              </View>
              <View style={st.chips}>
                {ov.balls.map((b) => {
                  const tone = overSymbolTone(b.sym);
                  return (
                    <TouchableOpacity key={b.seq} accessibilityRole="button" accessibilityLabel={`Edit ball ${b.stamp}`}
                      onPress={() => { setError(null); setEditing({ ball: b, over: ov, inn }); setBowlerPick(null); setSwapPick(null); }}
                      style={[st.chip, st[tone], touched.has(b.seq) && st.chipStaged]}>
                      <Text style={[st.chipText, tone === 'plain' && { color: theme.colors.text }]}>{chipLabel(b.sym)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {isOver(editing, inn, ov) && editing && <BallCard key={editing.ball.seq} ball={editing.ball} log={log}
                fielders={rosterOf(other(inn.side))} keeper={undefined}
                onCancel={() => setEditing(null)}
                onSave={(edit) => {
                  const rec = log.find((r) => r.seq === editing.ball.seq);
                  if (!rec) return;
                  const action = editBall(rec, edit);
                  if ('error' in action) { setError(action.error); return; }
                  // Nothing actually changed → nothing to stage (drops an earlier edit of it).
                  if (JSON.stringify({ t: action.type, p: action.payload, a: action.attribution ?? null }) === JSON.stringify({ t: rec.type, p: rec.payload ?? undefined, a: rec.attribution ?? null })) {
                    stage(`ball:${rec.seq}`, [], ''); setEditing(null); return;
                  }
                  stage(`ball:${rec.seq}`, [{ op: 'replace', seq: rec.seq, action }], ballDiffLine(editing.ball.stamp, editing.ball.action, action));
                  setEditing(null);
                }} />}
              {isOver(bowlerPick, inn, ov) && bowlerPick && (
                <View style={st.card}>
                  <Text style={textStyles.body}>Replace {ov.bowler.name} with…</Text>
                  <View style={st.chips}>
                    {rosterOf(other(inn.side)).filter((p) => p.id !== ov.bowler.id).map((p) => (
                      <SelectChip key={p.id} label={p.fullName} active={bowlerPick.to?.id === p.id} onPress={() => setBowlerPick({ ...bowlerPick, to: p })} />
                    ))}
                  </View>
                  <View style={st.chips}>
                    <SelectChip label="This over" active={bowlerPick.scope === 'over'} onPress={() => setBowlerPick({ ...bowlerPick, scope: 'over' })} />
                    <SelectChip label={`All overs by ${ov.bowler.name}`} active={bowlerPick.scope === 'all'} onPress={() => setBowlerPick({ ...bowlerPick, scope: 'all' })} />
                  </View>
                  {bowlerPick.to ? (
                    <View style={st.row}>
                      <Button label={`Replace ${ov.bowler.name} with ${bowlerPick.to.fullName}`} style={{ flex: 1 }} onPress={() => {
                        const to = bowlerPick.to!;
                        const ops = changeBowlerOps(inn, ov.n, { id: to.id, name: to.fullName }, bowlerPick.scope, log);
                        if ('error' in ops) { setError(ops.error); return; }
                        const overs = bowlerPick.scope === 'all' ? inn.overs.filter((o) => o.bowler.id === ov.bowler.id).map((o) => o.n).reverse() : ov.n;
                        stage(`bowler:${inn.inningsIx}:${bowlerPick.scope === 'all' ? ov.bowler.id : ov.n}`, ops, bowlerDiffLine(overs, ov.bowler.name, to.fullName));
                        setBowlerPick(null);
                      }} />
                      <Button label="Cancel" variant="ghost" onPress={() => setBowlerPick(null)} />
                    </View>
                  ) : <Button label="Cancel" variant="ghost" onPress={() => setBowlerPick(null)} />}
                </View>
              )}
              {swapPick && swapPick.inn.inningsIx === inn.inningsIx && swapPick.inn.side === inn.side && ov.n === inn.overs.find((o) => o.batters.some((b) => b.id === swapPick.batter.id))?.n && (
                <View style={st.card}>
                  <Text style={textStyles.body}>Swap all records of {swapPick.batter.name} with…</Text>
                  <View style={st.chips}>
                    {rosterOf(inn.side).filter((p) => p.id !== swapPick.batter.id).map((p) => (
                      <SelectChip key={p.id} label={p.fullName} active={swapPick.to?.id === p.id} onPress={() => setSwapPick({ ...swapPick, to: p })} />
                    ))}
                  </View>
                  <View style={st.row}>
                    {swapPick.to ? (
                      <Button label={`Swap ${swapPick.batter.name} ⇄ ${swapPick.to.fullName}`} style={{ flex: 1 }} onPress={() => {
                        const b = { id: swapPick.to!.id, name: swapPick.to!.fullName };
                        stage(`swap:${inn.inningsIx}:${[swapPick.batter.id, b.id].sort().join(':')}`, swapBattersOps(log, inn.inningsIx, swapPick.batter, b, config), swapDiffLine(swapPick.batter.name, b.name));
                        setSwapPick(null);
                      }} />
                    ) : null}
                    <Button label="Cancel" variant="ghost" onPress={() => setSwapPick(null)} />
                  </View>
                </View>
              )}
            </View>
          ))}
        </View>
      ))}
      {error ? <Text style={st.err}>{error}</Text> : null}
      {staged.length > 0 && (
        <View style={st.card}>
          <Text style={textStyles.muted}>Staged</Text>
          {staged.map((s) => (
            <View key={s.key} style={st.row}>
              <Text style={[textStyles.body, { flex: 1 }]}>• {s.line}</Text>
              <Text style={st.undo} accessibilityRole="button" onPress={() => stage(s.key, [], '')}>↺</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** The inline "Edit ball" card — same category only (legal / wicket / extra). */
function BallCard({ ball, log, fielders, onSave, onCancel }: {
  ball: EditableBall; log: MatchEventRecord[]; fielders: Player[]; keeper?: { id: string; name: string };
  onSave: (edit: BallEdit) => void; onCancel: () => void;
}) {
  const p = (ball.action.payload ?? {}) as Record<string, unknown>;
  const t = ball.action.type;
  const [runs, setRuns] = useState<number>(Number(p.runs ?? p.byes ?? 0) || 0);
  const [type, setType] = useState<'bat' | 'bye' | 'legbye'>(t === 'BYES' ? 'bye' : t === 'LEGBYES' ? 'legbye' : 'bat');
  const [striker, setStriker] = useState<string>(String(p.strikerId ?? ball.crease[0]));
  const [kind, setKind] = useState<string>(String(p.kind ?? 'bowled'));
  const [fielder, setFielder] = useState<string | undefined>(p.fielderId as string | undefined);
  const [out, setOut] = useState<string>(String(p.batterOut ?? 'striker') === 'nonstriker' ? 'nonstriker' : 'striker');
  const [extraKind, setExtraKind] = useState<'wide' | 'noball'>(ball.category === 'wide' ? 'wide' : 'noball');
  const nameOf = (id: string) => (log.find((r) => (r.payload as Record<string, unknown> | null)?.strikerId === id)?.payload as Record<string, unknown> | undefined)?.strikerName as string | undefined;
  const save = () => {
    if (ball.category === 'legal') onSave({ runs, type, strikerId: striker, strikerName: nameOf(striker) });
    else if (ball.category === 'wicket') {
      const f = fielders.find((x) => x.id === fielder);
      onSave({ kind, fielderId: f?.id, fielderName: f?.fullName, runs: kind === 'runout' ? runs : undefined, batterOut: kind === 'runout' ? out : undefined });
    } else onSave({ extraKind, extraRuns: runs });
  };
  return (
    <View style={st.card}>
      <Text style={textStyles.body}>{ball.stamp} · {describeBall(ball.action)}</Text>
      {ball.category === 'legal' && (
        <>
          <View style={st.chips}>{[0, 1, 2, 3, 4, 5, 6].map((n) => <SelectChip key={n} label={`${n} run${n === 1 ? '' : 's'}`} active={runs === n} onPress={() => setRuns(n)} />)}</View>
          <View style={st.chips}>
            <SelectChip label="Off bat" active={type === 'bat'} onPress={() => setType('bat')} />
            <SelectChip label="Bye" active={type === 'bye'} onPress={() => setType('bye')} />
            <SelectChip label="Leg bye" active={type === 'legbye'} onPress={() => setType('legbye')} />
          </View>
          <Text style={textStyles.muted}>Who faced?</Text>
          <View style={st.chips}>{ball.crease.filter(Boolean).map((id) => <SelectChip key={id} label={nameOf(id) ?? 'Batter'} active={striker === id} onPress={() => setStriker(id)} />)}</View>
        </>
      )}
      {ball.category === 'wicket' && (
        <>
          <View style={st.chips}>{WICKET_KINDS.map(([k, l]) => <SelectChip key={k} label={l} active={kind === k} onPress={() => setKind(k)} />)}</View>
          {(kind === 'caught' || kind === 'runout') && (
            <View style={st.chips}>{fielders.map((f) => <SelectChip key={f.id} label={f.fullName} active={fielder === f.id} onPress={() => setFielder(f.id)} />)}</View>
          )}
          {kind === 'runout' && (
            <>
              <View style={st.chips}>{[0, 1, 2, 3].map((n) => <SelectChip key={n} label={`${n} run${n === 1 ? '' : 's'}`} active={runs === n} onPress={() => setRuns(n)} />)}</View>
              <View style={st.chips}>
                <SelectChip label="Striker out" active={out === 'striker'} onPress={() => setOut('striker')} />
                <SelectChip label="Non-striker out" active={out === 'nonstriker'} onPress={() => setOut('nonstriker')} />
              </View>
            </>
          )}
        </>
      )}
      {(ball.category === 'wide' || ball.category === 'noball') && (
        <>
          <View style={st.chips}>
            <SelectChip label="Wide" active={extraKind === 'wide'} onPress={() => setExtraKind('wide')} />
            <SelectChip label="No ball" active={extraKind === 'noball'} onPress={() => setExtraKind('noball')} />
          </View>
          <View style={st.chips}>{[0, 1, 2, 3, 4].map((n) => <SelectChip key={n} label={`+${n}`} active={runs === n} onPress={() => setRuns(n)} />)}</View>
        </>
      )}
      <Text style={textStyles.muted}>{CATEGORY_HINT}</Text>
      <View style={st.row}>
        <Button label="Save" style={{ flex: 1 }} onPress={save} />
        <Button label="Cancel" variant="ghost" onPress={onCancel} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  innings: { gap: theme.spacing(2) },
  innHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  over: { gap: theme.spacing(1), paddingVertical: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  overHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing(2) },
  ovNo: { color: theme.colors.textMuted, fontWeight: '800', fontSize: theme.font.small },
  link: { color: theme.colors.text, fontWeight: '700', fontSize: theme.font.small, textDecorationLine: 'underline' },
  changed: { color: theme.colors.primary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  chip: { minWidth: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, borderWidth: 2, borderColor: 'transparent' },
  chipStaged: { borderColor: theme.colors.primary },
  chipText: { color: '#fff', fontWeight: '800', fontSize: theme.font.small },
  plain: { backgroundColor: theme.colors.surfaceAlt },
  boundary: { backgroundColor: theme.colors.accent },
  wicket: { backgroundColor: theme.colors.danger },
  extra: { backgroundColor: theme.colors.textMuted },
  card: { gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  err: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  undo: { color: theme.colors.textMuted, fontWeight: '800', fontSize: theme.font.body, paddingHorizontal: theme.spacing(2) },
});
