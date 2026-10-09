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
import { DISMISSAL_NAME, isBoundaryHit } from './engine';

type Staged = { key: string; ops: AmendOp[]; line: string };
/** Same names (sentence case) as the live wicket panel. */
const WICKET_KINDS = (['bowled', 'caught', 'lbw', 'stumped', 'runout', 'hitwicket', 'hittwice', 'obstruct'] as const).map((k) => [k, DISMISSAL_NAME[k]] as const);
/** Kinds whose completed runs count (parity #16): run out and obstructing. */
const takesRuns = (k: string) => k === 'runout' || k === 'obstruct';

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
              {isOver(editing, inn, ov) && editing && <BallCard key={editing.ball.seq} ball={editing.ball} log={log} bowlerName={ov.bowler.name}
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
function BallCard({ ball, log, bowlerName, fielders, onSave, onCancel }: {
  ball: EditableBall; log: MatchEventRecord[]; bowlerName?: string; fielders: Player[]; keeper?: { id: string; name: string };
  onSave: (edit: BallEdit) => void; onCancel: () => void;
}) {
  const p = (ball.action.payload ?? {}) as Record<string, unknown>;
  const t = ball.action.type;
  const recNbByes = ball.category === 'noball' && !p.wicket && !p.runout && Number(p.byes ?? 0) > 0 && !Number(p.runs ?? 0);
  const recRuns = (recNbByes ? Number(p.byes) : Number(p.runs ?? p.byes ?? 0)) || 0;
  const [runs, setRuns] = useState<number>(recRuns);
  const [type, setType] = useState<'bat' | 'bye' | 'legbye'>(t === 'BYES' ? 'bye' : t === 'LEGBYES' ? 'legbye' : 'bat');
  const [striker, setStriker] = useState<string>(String(p.strikerId ?? ball.crease[0]));
  const [kind, setKind] = useState<string>(String(p.kind ?? 'bowled'));
  const [fielder, setFielder] = useState<string | undefined>(p.fielderId as string | undefined);
  const [out, setOut] = useState<string>(String(p.batterOut ?? 'striker') === 'nonstriker' ? 'nonstriker' : 'striker');
  const [extraKind, setExtraKind] = useState<'wide' | 'noball'>(ball.category === 'wide' ? 'wide' : 'noball');
  // #15 run detail: a 4 / 6 is a boundary or all run; overthrows stay only if kept.
  const recOt = t === 'RUNS' ? Math.min(recRuns, Number(p.overthrows ?? 0) || 0) : 0;
  const recBoundary = isBoundaryHit(recRuns, p.boundary, recOt);
  const [boundary, setBoundary] = useState<boolean>(recRuns === 4 || recRuns === 6 ? recBoundary : true);
  const [keepOt, setKeepOt] = useState(recOt > 0);
  // A no-ball's runs: off the bat, byes or leg byes (not for a wicket on the extra).
  const extraWkt = !!(p.wicket || p.runout);
  const recNbAs: 'bat' | 'bye' | 'legbye' = recNbByes ? (p.runsAs === 'legbye' ? 'legbye' : 'bye') : 'bat';
  const [nbAs, setNbAs] = useState<'bat' | 'bye' | 'legbye'>(recNbAs);
  const fourOrSix = runs === 4 || runs === 6;
  const nameOf = (id: string) => (log.find((r) => (r.payload as Record<string, unknown> | null)?.strikerId === id)?.payload as Record<string, unknown> | undefined)?.strikerName as string | undefined;
  // Send the boundary flag only when it's a real choice that changed something.
  const boundaryEdit = (offBat: boolean) => (offBat && fourOrSix && (runs !== recRuns || boundary !== recBoundary) ? boundary : undefined);
  const save = () => {
    if (ball.category === 'legal') {
      onSave({
        runs, type, strikerId: striker, strikerName: nameOf(striker),
        boundary: boundaryEdit(type === 'bat'),
        ...(recOt > 0 && type === 'bat' ? { overthrows: keepOt && !(fourOrSix && boundary) ? recOt : 0 } : {}),
      });
    }
    else if (ball.category === 'wicket') {
      const f = fielders.find((x) => x.id === fielder);
      onSave({ kind, fielderId: f?.id, fielderName: f?.fullName, runs: takesRuns(kind) ? runs : undefined, batterOut: takesRuns(kind) ? out : undefined });
    } else {
      const as = extraKind === 'noball' && !extraWkt ? nbAs : undefined;
      onSave({ extraKind, extraRuns: runs, ...(as ? { extraRunsAs: as } : {}), boundary: boundaryEdit(extraKind === 'noball' && !extraWkt && nbAs === 'bat') });
    }
  };
  const who = [bowlerName, ball.strikerName ?? nameOf(ball.crease[0])].filter(Boolean);
  return (
    <View style={st.card}>
      {/* "2.3 · Arjun to Ravi · 1 run" — bowler to batter (#06). */}
      <Text style={textStyles.body}>{ball.stamp} · {who.length === 2 ? `${who[0]} to ${who[1]} · ` : ''}{describeBall(ball.action)}</Text>
      {ball.category === 'legal' && (
        <>
          <View style={st.chips}>{[0, 1, 2, 3, 4, 5, 6, 7].map((n) => <SelectChip key={n} label={`${n} run${n === 1 ? '' : 's'}`} active={runs === n} onPress={() => setRuns(n)} />)}</View>
          <View style={st.chips}>
            <SelectChip label="Off bat" active={type === 'bat'} onPress={() => setType('bat')} />
            <SelectChip label="Bye" active={type === 'bye'} onPress={() => setType('bye')} />
            <SelectChip label="Leg bye" active={type === 'legbye'} onPress={() => setType('legbye')} />
          </View>
          {type === 'bat' && fourOrSix && (
            <View style={st.chips}>
              <SelectChip label="Boundary" active={boundary} onPress={() => setBoundary(true)} />
              <SelectChip label="All run" active={!boundary} onPress={() => setBoundary(false)} />
            </View>
          )}
          {type === 'bat' && recOt > 0 && !(fourOrSix && boundary) && (
            <View style={st.chips}>
              <SelectChip label={`Incl. ${recOt} overthrow${recOt === 1 ? '' : 's'}`} active={keepOt} onPress={() => setKeepOt(!keepOt)} />
            </View>
          )}
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
          {takesRuns(kind) && (
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
          {extraKind === 'noball' && !extraWkt && (
            <View style={st.chips}>
              <SelectChip label="Off bat" active={nbAs === 'bat'} onPress={() => setNbAs('bat')} />
              <SelectChip label="Byes" active={nbAs === 'bye'} onPress={() => setNbAs('bye')} />
              <SelectChip label="Leg byes" active={nbAs === 'legbye'} onPress={() => setNbAs('legbye')} />
            </View>
          )}
          {/* No ball +0–6 (as the live pad); a wide +0–4. */}
          <View style={st.chips}>{(extraKind === 'noball' ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4]).map((n) => <SelectChip key={n} label={`+${n}`} active={runs === n} onPress={() => setRuns(n)} />)}</View>
          {extraKind === 'noball' && !extraWkt && nbAs === 'bat' && fourOrSix && (
            <View style={st.chips}>
              <SelectChip label="Boundary" active={boundary} onPress={() => setBoundary(true)} />
              <SelectChip label="All run" active={!boundary} onPress={() => setBoundary(false)} />
            </View>
          )}
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
