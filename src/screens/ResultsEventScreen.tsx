/** One phase of a timed / measured event (results engine, SD-28): the official's
 *  phone screen. Start list by heat → enter marks / attempts / bar clearances /
 *  lifts / scores and statuses → live ranking with Q / q and PB / SB / MR
 *  flags → close the round (seeds the next one) or finish the final (records).
 *  Everything is driven by the discipline definition (unit, capture, tie rule,
 *  wind, attempts), so Wave 4 sports only add disciplines. Saves are offline-safe
 *  (the golf outbox). */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { confirmAction } from '../core/confirm';
import { Button, Card, FormError, LoadingState, SelectChip, textStyles } from '../components/ui';
import { ResultsSheet, Flags, windText } from '../components/results/ResultsSheet';
import type { RootStackParamList } from '../navigation/types';
import { useParamState } from '../navigation/useParamState';
import { getPlayers } from '../data/repos';
import type { FieldEntry, FieldEvent } from '../core/types';
import {
  getPhase, getResultsPhases, getPhaseEntries, saveEntryResult, patchPhaseFormat, setPhaseStatus, advancePhase,
  completeFinal, getMarkHistory, getRecordBook,
} from '../data/resultsStore';
import {
  disciplineOf, phaseOf, phaseLabel, toResultEntry, rankByHeat, qualify, withQualification, withRecordFlags,
  fieldFinalists, firstRoundsDone, attemptOrder, formatMark, parseMark, attemptText, summarizeHeights, addTry,
  eventAwards, categoryKey, categoryLabel, usesLanes,
  type DisciplineDef, type EntryResult, type MarkHistory, type RankedEntry, type RecordMark, type ResultStatus, type LiftAttempt,
} from '../data/results';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Change = (next: EntryResult) => void;

const STATUSES: ResultStatus[] = ['DNS', 'DNF', 'FS', 'DQ'];
const statusesFor = (def: DisciplineDef): ResultStatus[] =>
  def.capture === 'single' ? (def.unit === 'time' ? STATUSES : ['DNS', 'DQ']) : ['DNS', 'DQ', 'WD'];
const ruleHint = (def: DisciplineDef) => (def.sport === 'swimming' ? 'SW 7.6' : def.sport === 'athletics' ? 'TR 16.8' : 'rule');
const num = (t: string) => { const v = Number(t.trim().replace(',', '.').replace('−', '-')); return t.trim() && Number.isFinite(v) ? v : undefined; };

export default function ResultsEventScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'ResultsEvent'>>();
  const [tab, setTab] = useParamState<'enter' | 'sheet'>('tab', 'enter');
  const [phase, setPhase] = useState<FieldEvent | null>(null);
  const [phases, setPhases] = useState<FieldEvent[]>([]);
  const [entries, setEntries] = useState<FieldEntry[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [history, setHistory] = useState<MarkHistory[]>([]);
  const [records, setRecords] = useState<RecordMark[]>([]);
  const [local, setLocal] = useState<Map<string, EntryResult>>(new Map());
  const [heat, setHeat] = useState(1);
  const [bar, setBar] = useState<number | null>(null);
  const [round, setRound] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const f = phase ? phaseOf(phase) : null;
  const def = f ? disciplineOf(f.discipline) ?? null : null;

  const load = useCallback(async () => {
    const ev = await getPhase(params.phaseId);
    const pf = ev && phaseOf(ev);
    const d = pf && disciplineOf(pf.discipline);
    setPhase(ev);
    if (!ev || !pf || !d) { setLoading(false); return; }
    const [ens, ps, all, recs] = await Promise.all([getPhaseEntries([ev.id]), getPlayers(), getResultsPhases({ eventKey: pf.eventKey }), getRecordBook(ev.tournamentId, d.sport)]);
    setEntries(ens);
    setNames(new Map(ps.map((p) => [p.id, p.fullName])));
    setPhases(all.sort((a, b) => a.roundNo - b.roundNo));
    setRecords(recs);
    setLocal(new Map());
    setHistory(await getMarkHistory(d, ens.map((e) => e.playerId), ev.id));
    setLoading(false);
  }, [params.phaseId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const nameOf = useCallback((id: string) => names.get(id) ?? 'Athlete', [names]);
  const merged = useMemo(() => entries.map((e) => (local.has(e.id) ? { ...e, result: local.get(e.id) } : e)), [entries, local]);
  const resEntries = useMemo(() => merged.map((e) => toResultEntry(e, nameOf)), [merged, nameOf]);

  // Ranking per heat with Q / q and PB / SB / MR flags.
  const ranked = useMemo(() => {
    if (!def || !f || !phase) return new Map<number, RankedEntry[]>();
    const byHeat = rankByHeat(resEntries, def);
    const q = f.progression ? qualify(byHeat, def, f.progression) : null;
    const ctx = { history, records, category: categoryKey(f.category), seasonFrom: `${phase.startsAt.slice(0, 4)}-01-01`, eventKey: f.eventKey };
    return new Map([...byHeat].map(([h, rows]) => [h, withRecordFlags(q ? withQualification(rows, q) : rows, def, ctx)]));
  }, [def, f, phase, resEntries, history, records]);

  const heats = useMemo(() => [...new Set(entries.map((e) => e.groupNo))].sort((a, b) => a - b), [entries]);
  const activeHeat = heats.includes(heat) ? heat : heats[0] ?? 1;
  const heatEntries = merged.filter((e) => e.groupNo === activeHeat);
  const editable = phase?.status !== 'completed';
  const finalists = useMemo(() => (def?.capture === 'attempts' ? fieldFinalists(resEntries.filter((e) => e.heat === activeHeat), def) : new Set<string>()), [def, resEntries, activeHeat]);
  const extraOpen = def?.capture === 'attempts' && firstRoundsDone(resEntries.filter((e) => e.heat === activeHeat), def);
  const windByHeat = useMemo(() => new Map(heats.map((h) => [h, (merged.find((e) => e.groupNo === h && (e.result as EntryResult)?.wind != null)?.result as EntryResult | undefined)?.wind])), [heats, merged]);

  const save = async (entry: FieldEntry, next: EntryResult) => {
    setError(null);
    setLocal((m) => new Map(m).set(entry.id, next));
    try {
      setPending(await saveEntryResult(entry.id, next));
      if (phase?.status === 'scheduled') { await setPhaseStatus(phase.id, 'live'); setPhase({ ...phase, status: 'live' }); }
    } catch (e) { setError((e as Error).message); }
  };
  const resultOf = (e: FieldEntry): EntryResult => (local.get(e.id) ?? (e.result as EntryResult) ?? {});

  if (loading) return <LoadingState />;
  if (!phase || !f || !def) return <SafeAreaView style={st.safe}><Text style={[textStyles.muted, { padding: 16 }]}>This event isn't available.</Text></SafeAreaView>;

  const next = f.plan?.[f.phaseNo];
  const orderFor = (list: FieldEntry[]) => {
    if (def.capture === 'attempts') {
      const ids = attemptOrder(list.map((e) => toResultEntry(e, nameOf)), def, round).map((e) => e.id);
      const rest = list.filter((e) => !ids.includes(e.id));
      return [...ids.map((id) => list.find((e) => e.id === id)!), ...rest];
    }
    const key = (e: FieldEntry) => (resultOf(e).lane ?? resultOf(e).order ?? 99);
    return [...list].sort((a, b) => key(a) - key(b));
  };

  const advance = async () => {
    if (!next) return;
    const ok = await confirmAction(`Close ${phaseLabel(f.phase).toLowerCase()}?`, `The qualifiers (Q / q) are seeded into the ${phaseLabel(next.phase).toLowerCase()} and these results are locked.`, 'Close and seed');
    if (!ok) return;
    setBusy(true);
    try {
      const ev = await advancePhase(phase, merged, nameOf);
      nav.replace('ResultsEvent', { phaseId: ev.id });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const finish = async () => {
    const ok = await confirmAction('Finish and lock the results?', 'Places, medals and any new record are final. You can still view the sheet.', 'Finish');
    if (!ok) return;
    setBusy(true);
    try {
      const book = await completeFinal(phase, merged, nameOf);
      const mine = book.filter((r) => r.discipline === def.key && r.category === categoryKey(f.category));
      setInfo(mine.length ? `Records: ${mine.map((r) => `${r.scope} ${formatMark(r.value, def)} (${r.holder})`).join(' · ')}` : null);
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const heatRows = ranked.get(activeHeat) ?? [];
  const awards = f.phase === 'final' ? eventAwards([...ranked.values()].flat()) : [];

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <View>
          <Text style={textStyles.h2}>{f.eventTitle ?? def.label}</Text>
          <Text style={textStyles.muted}>
            {phaseLabel(f.phase)} · {categoryLabel(f.category)} · {phase.status === 'completed' ? 'final results' : phase.status === 'live' ? 'in progress' : 'start list'}
            {pending ? `  ·  ${pending} waiting to sync` : ''}
          </Text>
        </View>
        {phases.length > 1 && (
          <View style={st.wrap}>
            {phases.map((p) => {
              const pf = phaseOf(p)!;
              return <SelectChip key={p.id} label={`${phaseLabel(pf.phase)}${p.status === 'completed' ? ' ✓' : ''}`} active={p.id === phase.id} onPress={() => p.id !== phase.id && nav.replace('ResultsEvent', { phaseId: p.id })} />;
            })}
          </View>
        )}
        <View style={st.wrap}>
          <SelectChip label="Enter results" active={tab === 'enter'} onPress={() => setTab('enter')} />
          <SelectChip label="Results sheet" active={tab === 'sheet'} onPress={() => setTab('sheet')} />
        </View>
        <FormError message={error} />
        {info ? <Text style={st.info}>{info}</Text> : null}

        {tab === 'enter' && (
          <>
            {heats.length > 1 && (
              <View style={st.wrap}>
                {heats.map((h) => <SelectChip key={h} label={`Heat ${h}`} active={h === activeHeat} onPress={() => setHeat(h)} />)}
              </View>
            )}
            {f.progression && (
              <Text style={textStyles.muted}>
                Through: {f.progression.byPlace ? `first ${f.progression.byPlace} in each heat (Q)` : ''}{f.progression.byMark ? ` + ${f.progression.byMark} fastest / best (q)` : ''}{f.progression.standard != null ? `standard ${formatMark(f.progression.standard, def)} (Q)` : ''}
              </Text>
            )}

            {def.wind === 'race' && editable && (
              <WindField value={windByHeat.get(activeHeat)} onSave={(w) => { for (const e of heatEntries) void save(e, { ...resultOf(e), wind: w }); }} />
            )}

            {def.capture === 'attempts' && (
              <View style={st.wrap}>
                <Text style={textStyles.muted}>Round</Text>
                {Array.from({ length: (def.attempts?.count ?? 3) + (def.attempts?.extra ?? 0) }, (_, i) => i + 1).map((r) => (
                  <SelectChip key={r} label={String(r)} active={round === r} disabled={r > (def.attempts?.count ?? 3) && !extraOpen} onPress={() => setRound(r)} />
                ))}
              </View>
            )}
            {def.capture === 'attempts' && extraOpen && def.attempts?.extra ? (
              <Text style={textStyles.muted}>Top {def.attempts.finalists} after {def.attempts.count} rounds (★) take {def.attempts.extra} more, in reverse order.</Text>
            ) : null}

            {def.capture === 'heights' && (
              <BarHeights def={def} bar={f.bar ?? []} current={bar} onPick={setBar} editable={editable}
                onAdd={async (h) => { await patchPhaseFormat(phase.id, { bar: [...new Set([...(f.bar ?? []), h])].sort((a, b) => a - b) }); setBar(h); await load(); }} />
            )}

            {orderFor(heatEntries).map((e) => {
              const r = resultOf(e);
              const re = toResultEntry({ ...e, result: r }, nameOf);
              const row = heatRows.find((x) => x.id === e.id);
              return (
                <Card key={e.id} style={st.entryCard}>
                  <View style={st.headRow}>
                    <Text style={st.lane}>{usesLanes(def) ? `L${r.lane ?? '–'}` : `#${r.order ?? '–'}`}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.name} numberOfLines={1}>{finalists.has(e.id) && extraOpen ? '★ ' : ''}{re.name}</Text>
                      {re.team?.name ? <Text style={textStyles.muted} numberOfLines={1}>{re.team.name}{r.members?.length ? ` · ${r.members.map((m) => m.name.split(' ')[0]).join(', ')}` : ''}</Text> : null}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={st.place}>{row?.label || ''}</Text>
                      {row ? <Flags flags={row.flags} /> : null}
                    </View>
                  </View>
                  {def.capture === 'single' || def.capture === 'target' ? (
                    <MarkField key={`${e.id}:${r.mark ?? ''}:${r.thousandths ?? ''}`} def={def} r={r} editable={editable && (r.status ?? 'ok') === 'ok'} onChange={(n) => void save(e, n)} />
                  ) : null}
                  {def.capture === 'attempts' && (
                    <AttemptCells def={def} r={r} round={round} editable={editable && (r.status ?? 'ok') === 'ok'}
                      extraAllowed={extraOpen && finalists.has(e.id)} onChange={(n) => void save(e, n)} />
                  )}
                  {def.capture === 'heights' && <HeightRow def={def} r={r} bar={bar} editable={editable && (r.status ?? 'ok') === 'ok'} onChange={(n) => void save(e, n)} />}
                  {def.capture === 'lifts' && <LiftCells r={r} editable={editable && (r.status ?? 'ok') === 'ok'} nextSeq={1 + Math.max(0, ...merged.flatMap((x) => [...((x.result as EntryResult)?.lifts?.snatch ?? []), ...((x.result as EntryResult)?.lifts?.cj ?? [])].map((l) => l.seq ?? 0)))} onChange={(n) => void save(e, n)} />}
                  {row?.needsDecider && editable && (
                    <DeciderField label={def.tie === 'vertical' ? 'Jump-off place' : 'Shoot-off place'} value={r.decider} onSave={(d) => void save(e, { ...r, decider: d })} />
                  )}
                  {editable && <StatusChips def={def} r={r} onChange={(n) => void save(e, n)} />}
                </Card>
              );
            })}

            <ResultsSheet def={def} title="Live ranking" subtitle={heats.length > 1 ? `Heat ${activeHeat}` : undefined} heats={new Map([[activeHeat, heatRows]])} wind={windByHeat} />

            {editable && next && <Button label={busy ? 'Seeding…' : `Close ${phaseLabel(f.phase).toLowerCase()} → seed the ${phaseLabel(next.phase).toLowerCase()}`} onPress={() => void advance()} disabled={busy} />}
            {editable && !next && <Button label={busy ? 'Finishing…' : '🏁 Finish & lock results'} onPress={() => void finish()} disabled={busy} />}
          </>
        )}

        {tab === 'sheet' && (
          <>
            <ResultsSheet def={def} title={phase.title} subtitle={`${categoryLabel(f.category)} · ${phase.startsAt.slice(0, 10)}`} heats={ranked} wind={windByHeat} />
            {awards.length > 0 && (
              <Card style={{ gap: theme.spacing(1) }}>
                <Text style={textStyles.h3}>Medals & points</Text>
                {awards.slice(0, 8).map((a) => (
                  <Text key={a.entryId} style={textStyles.body}>
                    {a.medal === 'gold' ? '🥇' : a.medal === 'silver' ? '🥈' : a.medal === 'bronze' ? '🥉' : `${a.position}.`} {a.name}{a.team?.name ? ` (${a.team.name})` : ''} — {a.points} pts
                  </Text>
                ))}
                <Text style={textStyles.muted}>Default 8-7-6-5-4-3-2-1; tied places share the points. These feed the meet's house / medal table.</Text>
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* --------------------------------- inputs -------------------------------- */

function WindField({ value, onSave }: { value?: number; onSave: (w: number | undefined) => void }) {
  const [t, setT] = useState(value != null ? String(value) : '');
  useEffect(() => { setT(value != null ? String(value) : ''); }, [value]);
  return (
    <View style={st.inline}>
      <Text style={st.label}>Wind (m/s)</Text>
      <TextInput style={[st.input, { width: 90 }]} value={t} onChangeText={setT} placeholder="+1.2" placeholderTextColor={theme.colors.textMuted}
        keyboardType="numbers-and-punctuation" accessibilityLabel="Race wind in metres per second" onBlur={() => onSave(num(t))} onSubmitEditing={() => onSave(num(t))} />
      <Text style={textStyles.muted}>{value != null ? (value > 2.0 ? 'wind-aided (w)' : 'legal') : 'no reading'}</Text>
    </View>
  );
}

function MarkField({ def, r, editable, onChange }: { def: DisciplineDef; r: EntryResult; editable: boolean; onChange: Change }) {
  const [t, setT] = useState(r.thousandths != null ? r.thousandths.toFixed(3) : formatMark(r.mark, def));
  const [bad, setBad] = useState(false);
  const commit = () => {
    if (!t.trim()) { setBad(false); if (r.mark != null) onChange({ ...r, mark: undefined, thousandths: undefined }); return; }
    const p = parseMark(t, def);
    setBad(!p);
    if (p && (p.mark !== r.mark || p.thousandths !== r.thousandths)) onChange({ ...r, mark: p.mark, thousandths: p.thousandths });
  };
  const hint = def.unit === 'time' ? '10.85' : def.unit === 'points' ? 'score' : 'mark';
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={st.inline}>
        <TextInput style={[st.input, st.markInput, bad && st.bad]} value={t} onChangeText={setT} editable={editable} placeholder={hint}
          placeholderTextColor={theme.colors.textMuted} keyboardType="numbers-and-punctuation" accessibilityLabel={def.unit === 'time' ? 'Time' : 'Mark'}
          onBlur={commit} onSubmitEditing={commit} />
        {def.unit === 'time' && <SelectChip label="Hand" active={!!r.hand} disabled={!editable} onPress={() => onChange({ ...r, hand: !r.hand || undefined })} />}
        {bad && <Text style={st.badTxt}>Can't read that</Text>}
      </View>
      {def.capture === 'target' && (
        <View style={st.inline}>
          <SmallNum label="10s" value={r.tens} editable={editable} onSave={(v) => onChange({ ...r, tens: v })} />
          <SmallNum label="X / inner" value={r.xs} editable={editable} onSave={(v) => onChange({ ...r, xs: v })} />
        </View>
      )}
    </View>
  );
}

function SmallNum({ label, value, editable, onSave }: { label: string; value?: number; editable: boolean; onSave: (v: number | undefined) => void }) {
  const [t, setT] = useState(value != null ? String(value) : '');
  return (
    <View style={st.inline}>
      <Text style={st.label}>{label}</Text>
      <TextInput style={[st.input, { width: 64 }]} value={t} onChangeText={setT} editable={editable} keyboardType="number-pad" accessibilityLabel={label}
        onBlur={() => onSave(num(t))} onSubmitEditing={() => onSave(num(t))} />
    </View>
  );
}

function DeciderField({ label, value, onSave }: { label: string; value?: number; onSave: (v: number | undefined) => void }) {
  return <SmallNum label={label} value={value} editable onSave={onSave} />;
}

function StatusChips({ def, r, onChange }: { def: DisciplineDef; r: EntryResult; onChange: Change }) {
  const s = r.status ?? 'ok';
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={st.wrap}>
        {statusesFor(def).map((x) => (
          <TouchableOpacity key={x} accessibilityRole="button" accessibilityState={{ selected: s === x }} accessibilityLabel={`Mark ${x}`}
            onPress={() => onChange({ ...r, status: s === x ? undefined : x, ruleRef: s === x ? undefined : x === 'FS' ? 'TR 16.8' : r.ruleRef })}
            style={[st.status, s === x && st.statusOn]}>
            <Text style={[st.statusTxt, s === x && st.statusTxtOn]}>{x}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {(s === 'DQ' || s === 'FS') && (
        <RuleRef value={r.ruleRef} hint={ruleHint(def)} onSave={(v) => onChange({ ...r, ruleRef: v || undefined })} />
      )}
    </View>
  );
}

function RuleRef({ value, hint, onSave }: { value?: string; hint: string; onSave: (v: string) => void }) {
  const [t, setT] = useState(value ?? '');
  return (
    <View style={st.inline}>
      <Text style={st.label}>Rule</Text>
      <TextInput style={[st.input, { flex: 1 }]} value={t} onChangeText={setT} placeholder={hint} placeholderTextColor={theme.colors.textMuted}
        accessibilityLabel="Rule reference" onBlur={() => onSave(t.trim())} onSubmitEditing={() => onSave(t.trim())} />
    </View>
  );
}

/** Field events: one cell per attempt; the selected round's cell is the input. */
function AttemptCells({ def, r, round, editable, extraAllowed, onChange }: { def: DisciplineDef; r: EntryResult; round: number; editable: boolean; extraAllowed: boolean; onChange: Change }) {
  const count = def.attempts?.count ?? 3;
  const slots = count + (def.attempts?.extra ?? 0);
  const list = r.attempts ?? [];
  const [t, setT] = useState('');
  const [w, setW] = useState('');
  const i = round - 1;
  const allowed = editable && (i < count || extraAllowed) && list.length >= i;
  const put = (a: EntryResult['attempts'] extends (infer A)[] | undefined ? A : never) => {
    const next = [...list];
    next[i] = a;
    onChange({ ...r, attempts: next });
    setT(''); setW('');
  };
  const commit = () => {
    const p = parseMark(t, def);
    if (p) put({ mark: p.mark, ...(def.wind === 'attempt' && num(w) != null ? { wind: num(w) } : {}) });
  };
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={st.cells}>
        {Array.from({ length: slots }, (_, k) => (
          <View key={k} style={[st.cell, k === i && st.cellOn, k >= count && !extraAllowed && st.cellOff]}>
            <Text style={st.cellTxt}>{attemptText(list[k], def) || (k < list.length ? '' : '·')}</Text>
            {def.wind === 'attempt' && list[k]?.wind != null ? <Text style={st.cellWind}>{windText(list[k]?.wind)}</Text> : null}
          </View>
        ))}
      </View>
      {allowed && (
        <View style={st.inline}>
          <TextInput style={[st.input, { width: 80 }]} value={t} onChangeText={setT} placeholder={`R${round}`} placeholderTextColor={theme.colors.textMuted}
            keyboardType="decimal-pad" accessibilityLabel={`Attempt ${round} mark`} onSubmitEditing={commit} />
          {def.wind === 'attempt' && (
            <TextInput style={[st.input, { width: 64 }]} value={w} onChangeText={setW} placeholder="wind" placeholderTextColor={theme.colors.textMuted}
              keyboardType="numbers-and-punctuation" accessibilityLabel={`Attempt ${round} wind`} onSubmitEditing={commit} />
          )}
          <SelectChip label="✓" active={false} onPress={commit} />
          <SelectChip label="X" active={list[i]?.foul === true} onPress={() => put({ foul: true })} />
          <SelectChip label="–" active={list[i]?.pass === true} onPress={() => put({ pass: true })} />
        </View>
      )}
    </View>
  );
}

function BarHeights({ def, bar, current, onPick, onAdd, editable }: { def: DisciplineDef; bar: number[]; current: number | null; onPick: (h: number) => void; onAdd: (h: number) => Promise<void>; editable: boolean }) {
  const [t, setT] = useState('');
  return (
    <Card style={{ gap: theme.spacing(2), padding: theme.spacing(3) }}>
      <Text style={st.label}>Bar heights</Text>
      <View style={st.wrap}>
        {bar.map((h) => <SelectChip key={h} label={formatMark(h, def)} active={current === h} onPress={() => onPick(h)} />)}
        {!bar.length && <Text style={textStyles.muted}>Add the opening height.</Text>}
      </View>
      {editable && (
        <View style={st.inline}>
          <TextInput style={[st.input, { width: 90 }]} value={t} onChangeText={setT} placeholder="1.20" placeholderTextColor={theme.colors.textMuted}
            keyboardType="decimal-pad" accessibilityLabel="New bar height" />
          <SelectChip label="Add height" active={false} onPress={() => { const p = parseMark(t, def); if (p) { setT(''); void onAdd(p.mark); } }} />
        </View>
      )}
    </Card>
  );
}

function HeightRow({ def, r, bar, editable, onChange }: { def: DisciplineDef; r: EntryResult; bar: number | null; editable: boolean; onChange: Change }) {
  const list = r.heights ?? [];
  const sum = summarizeHeights(list);
  const at = bar == null ? undefined : list.find((h) => h.height === bar);
  const tries = at?.tries ?? '';
  const done = tries.endsWith('O') || tries.endsWith('-') || tries.length >= 3;
  const set = (next: string) => {
    const rest = list.filter((h) => h.height !== bar);
    onChange({ ...r, heights: next ? [...rest, { height: bar as number, tries: next }].sort((a, b) => a.height - b.height) : rest });
  };
  const series = list.filter((h) => h.tries).map((h) => `${formatMark(h.height, def)} ${h.tries}`).join(' · ');
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.muted}>{series || 'No attempts yet'}{sum.eliminated ? ' · out' : ''}</Text>
      {bar != null && editable && (
        <View style={st.inline}>
          <Text style={st.label}>{formatMark(bar, def)}: {tries || '—'}</Text>
          {(['O', 'X', '-'] as const).map((x) => (
            <SelectChip key={x} label={x === '-' ? '– pass' : x} active={false} disabled={done || (sum.eliminated && !tries)} onPress={() => set(addTry(tries, x))} />
          ))}
          {tries ? <SelectChip label="Undo" active={false} onPress={() => set(tries.slice(0, -1))} /> : null}
        </View>
      )}
    </View>
  );
}

function LiftCells({ r, editable, nextSeq, onChange }: { r: EntryResult; editable: boolean; nextSeq: number; onChange: Change }) {
  const [kg, setKg] = useState('');
  const add = (lift: 'snatch' | 'cj', good: boolean) => {
    const v = num(kg);
    const list = r.lifts?.[lift] ?? [];
    if (v == null || list.length >= 3) return;
    const next: LiftAttempt[] = [...list, { kg: v, good, seq: nextSeq }];
    onChange({ ...r, lifts: { ...r.lifts, [lift]: next } });
    setKg('');
  };
  const row = (lift: 'snatch' | 'cj', label: string) => (
    <View style={st.inline}>
      <Text style={[st.label, { width: 44 }]}>{label}</Text>
      {(r.lifts?.[lift] ?? []).map((a, k) => <Text key={k} style={[st.cellTxt, a.good === false && { textDecorationLine: 'line-through', color: theme.colors.danger }]}>{a.kg}</Text>)}
      {editable && (r.lifts?.[lift]?.length ?? 0) < 3 && (
        <>
          <SelectChip label="✓ good" active={false} onPress={() => add(lift, true)} />
          <SelectChip label="✗ no lift" active={false} onPress={() => add(lift, false)} />
        </>
      )}
    </View>
  );
  return (
    <View style={{ gap: theme.spacing(2) }}>
      {editable && <TextInput style={[st.input, { width: 90 }]} value={kg} onChangeText={setKg} placeholder="kg" placeholderTextColor={theme.colors.textMuted} keyboardType="decimal-pad" accessibilityLabel="Weight in kg" />}
      {row('snatch', 'Sn')}
      {row('cj', 'C&J')}
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(12) },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), alignItems: 'center' },
  inline: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), alignItems: 'center' },
  info: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700' },
  entryCard: { gap: theme.spacing(2), padding: theme.spacing(3) },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  lane: { width: 34, color: theme.colors.textMuted, fontWeight: '800', fontSize: theme.font.small },
  name: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  place: { color: theme.colors.text, fontWeight: '900', fontSize: theme.font.h3 },
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  input: {
    backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(2.5), color: theme.colors.text, fontSize: theme.font.body,
  },
  markInput: { width: 130, fontSize: theme.font.h3, fontWeight: '800' },
  bad: { borderColor: theme.colors.danger },
  badTxt: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  status: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border },
  statusOn: { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger },
  statusTxt: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  statusTxtOn: { color: '#fff' },
  cells: { flexDirection: 'row', gap: 4 },
  cell: { flex: 1, minHeight: 40, borderRadius: theme.radius.sm, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  cellOn: { borderColor: theme.colors.primary },
  cellOff: { opacity: 0.35 },
  cellTxt: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800', fontVariant: ['tabular-nums'] },
  cellWind: { color: theme.colors.textMuted, fontSize: 9 },
});
