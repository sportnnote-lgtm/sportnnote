/** SD-98 — the cycling official's controls on the results screen:
 *   - FinishOrderCard (road race, a road stage, keirin, scratch, elimination):
 *     tap the riders in the order they cross the line; road — the winner's
 *     time, then a time only where a gap opens (everyone else "same time");
 *     scratch — laps gained / lost; elimination — tap the rider out each time
 *     (places fill from the back); DNF / OTL / DQ / DNS by mode; a stage —
 *     time bonus, points and KOM points per rider.
 *   - StageCard: a road stage (FinishOrderCard) or a time-trial stage (a time
 *     per rider, start order = reverse GC).
 *   - PointsRaceCard: each sprint's first four (5-3-2-1, the finish double),
 *     the finish order, laps gained / lost (±20).
 *   - SprintBracketCard: the seeded bracket (bronze before gold); each match
 *     heat by heat (best of three) with walkovers; a correction that changes
 *     who went through asks first and clears the later heats that no longer fit.
 *  Pure rules live in data/results/cycling.ts / cyclingRank.ts. */
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Card, SelectChip, textStyles } from '../ui';
import { askConfirm } from '../ConfirmSheet';
import {
  parseMark, formatMark, roadTimes, placeOnLine, nextFin, nextOutPlace, pointsTotal, setSprintPlace, sprintCount, sprintPoints,
  SPRINT_POINTS, cycEventOf, bracketState, staleMatchData, clearMatches, setWalkover, setSprintHeat, sprintMatch, sprintBo, roundShort, secsText, gapText, startText, ittStart,
  type BMatch, type CycKind, type DisciplineDef, type EntryResult, type ResultEntry, type ResultStatus,
} from '../../data/results';

type Save = (entryId: string, next: EntryResult, undoLabel?: string) => void;
const first = (name: string) => name.split(' ')[0];
const statusOf = (e: ResultEntry) => (e.result?.status ?? 'ok') as ResultStatus;
const inRace = (e: ResultEntry) => statusOf(e) === 'ok';
const byOrder = (a: ResultEntry, b: ResultEntry) => (a.result?.order ?? 99) - (b.result?.order ?? 99) || a.name.localeCompare(b.name);
const ROAD_TIME = { unit: 'time' as const, dp: 0 };
const STATUS_HELP: Partial<Record<ResultStatus, string>> = {
  DNF: 'did not finish', OTL: 'outside the time limit (not classified)', DQ: 'disqualified / relegated out', DNS: 'did not start',
};

/** Apply several row changes (one undo label on the first). */
function saveAll(changes: { id: string; result: EntryResult }[], onSave: Save, label: string) {
  changes.forEach((c, i) => onSave(c.id, c.result, i === 0 ? label : undefined));
}

/* ---------------------------------- statuses --------------------------------- */

function ModeChips({ modes, mode, setMode, lineLabel = 'On the line' }: { modes: ('line' | ResultStatus)[]; mode: 'line' | ResultStatus; setMode: (m: 'line' | ResultStatus) => void; lineLabel?: string }) {
  return (
    <View style={st.wrap}>
      {modes.map((m) => <SelectChip key={m} label={m === 'line' ? lineLabel : m} active={mode === m} onPress={() => setMode(m)} />)}
    </View>
  );
}

/* -------------------------------- finish order -------------------------------- */

/**
 * The order on the line. `kind`: 'rr' / 'stage' (times with s.t. groups, a
 * stage adds bonus / points / KOM), 'keirin', 'scratch' (laps), 'elim'.
 */
export function FinishOrderCard({ def, kind, entries, editable, onSave, statuses }: {
  def: DisciplineDef; kind: CycKind; entries: ResultEntry[]; editable: boolean; onSave: Save; statuses: ResultStatus[];
}) {
  const [mode, setMode] = useState<'line' | ResultStatus>('line');
  const timed = kind === 'rr' || kind === 'stage';
  const elim = kind === 'elim';
  const placed = useMemo(() => entries.filter((e) => inRace(e) && e.result?.fin != null).sort((a, b) => a.result.fin! - b.result.fin!), [entries]);
  const pool = useMemo(() => entries.filter((e) => inRace(e) && e.result?.fin == null).sort(byOrder), [entries]);
  const out = useMemo(() => entries.filter((e) => !inRace(e)).sort(byOrder), [entries]);
  const times = useMemo(() => (timed ? roadTimes(entries) : null), [timed, entries]);

  const tap = (e: ResultEntry) => {
    if (!editable) return;
    if (mode !== 'line') {
      // off the line too (the riders behind move up)
      const changes = placeOnLine(entries, e.id, null).map((c) => (c.id === e.id ? { ...c, result: { ...c.result, status: mode } } : c));
      saveAll(changes, onSave, `${mode} · ${first(e.name)}`);
      return;
    }
    if (elim) {
      const p = nextOutPlace(entries);
      const changes = [{ id: e.id, result: { ...e.result, fin: p } }];
      // the last two: the one left wins
      const left = pool.filter((x) => x.id !== e.id);
      if (left.length === 1 && p === 2) changes.push({ id: left[0].id, result: { ...left[0].result, fin: 1 } });
      saveAll(changes, onSave, `Out — place ${p} · ${first(e.name)}`);
      return;
    }
    onSave(e.id, { ...e.result, fin: nextFin(entries) }, `${nextFin(entries)}. ${first(e.name)}`);
  };
  const clearStatus = (e: ResultEntry) => editable && onSave(e.id, { ...e.result, status: undefined }, `${statusOf(e)} cleared · ${first(e.name)}`);
  const remove = async (e: ResultEntry) => {
    const last = e.result.fin === Math.max(...placed.map((x) => x.result.fin!));
    if (!last) {
      const ok = await askConfirm({ title: `Take ${first(e.name)} off the line?`, message: `${e.name} goes back to the riders still to place; everyone behind moves up one place.`, yesLabel: 'Yes, take off', noLabel: 'No, keep', tone: 'caution' });
      if (!ok) return;
    }
    saveAll(placeOnLine(entries, e.id, null), onSave, `Off the line · ${first(e.name)}`);
  };
  const up = (e: ResultEntry) => {
    const f = e.result.fin!;
    if (f <= 1) return;
    saveAll(placeOnLine(entries, e.id, f - 1), onSave, `${first(e.name)} up to ${f - 1}`);
  };
  const saveTime = (e: ResultEntry, text: string): string | null => {
    if (!text.trim()) { if (e.result.mark != null) onSave(e.id, { ...e.result, mark: undefined }, `Time cleared · ${first(e.name)}`); return null; }
    const p = parseMark(text, ROAD_TIME);
    if (!p) return "Can't read that — h:mm:ss or m:ss";
    if (p.mark !== e.result.mark) onSave(e.id, { ...e.result, mark: p.mark }, `${secsText(p.mark)} · ${first(e.name)}`);
    return null;
  };
  const lap = (e: ResultEntry, d: number) => onSave(e.id, { ...e.result, laps: (e.result.laps ?? 0) + d || undefined }, `${d > 0 ? '+1 lap' : '−1 lap'} · ${first(e.name)}`);

  const modes: ('line' | ResultStatus)[] = ['line', ...statuses];
  const winnerTime = placed[0] ? times?.get(placed[0].id)?.time : undefined;
  return (
    <Card style={st.card}>
      <View style={st.headRow}>
        <Text style={[textStyles.h3, { flex: 1 }]}>🚴 {elim ? 'Elimination order' : 'Order on the line'}</Text>
        <Text style={textStyles.muted}>{placed.length}/{placed.length + pool.length}</Text>
      </View>
      <Text style={textStyles.muted}>
        {elim ? 'Every 2 laps the last rider over the line is out — tap each one as they go (places fill from the back; the last two: tap the loser of the final sprint).'
          : timed ? 'Tap riders as they cross the line. Type the winner’s time; after that a time only where a gap of 1 s or more opens — riders in a group get the group’s time (s.t.).'
            : kind === 'scratch' ? 'Tap riders as they cross the line. A rider who gained a lap on the bunch ranks ahead of everyone on the lead lap (+ lap).'
              : 'Tap riders as they cross the line.'}
      </Text>
      {editable && <ModeChips modes={modes} mode={mode} setMode={setMode} lineLabel={elim ? 'Out' : 'On the line'} />}
      {mode !== 'line' ? <Text style={st.hint}>Tap a rider: {mode} — {STATUS_HELP[mode] ?? ''}. Tap a rider under “Not classified” to clear it.</Text> : null}
      {pool.length > 0 && (
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={st.head}>{elim ? 'STILL IN' : 'STILL TO CROSS THE LINE'}</Text>
          <View style={st.wrap}>
            {pool.map((e) => <SelectChip key={e.id} label={`${e.result.bib ? `${e.result.bib} ` : e.result.order ? `#${e.result.order} ` : ''}${e.name}`} dotColor={e.team?.colorHex} active={false} disabled={!editable} onPress={() => tap(e)} />)}
          </View>
        </View>
      )}
      {placed.length > 0 && (
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={st.head}>{elim ? 'PLACES' : 'ON THE LINE'}</Text>
          {placed.map((e, i) => {
            const t = times?.get(e.id);
            return (
              <View key={e.id} style={st.lineRow}>
                <View style={st.row}>
                  <Text style={st.pos}>{e.result.fin}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.name} numberOfLines={1}>{e.name}</Text>
                    {e.team?.name ? <Text style={st.sub} numberOfLines={1}>{e.team.name}</Text> : null}
                  </View>
                  {timed ? <Text style={st.gap}>{t?.time == null ? (i === 0 ? 'time?' : '') : i === 0 || !t.gap ? (i === 0 ? secsText(t.time) : 's.t.') : gapText(t.gap)}</Text> : null}
                  {kind === 'scratch' && e.result.laps ? <Text style={st.gap}>{e.result.laps > 0 ? '+' : ''}{e.result.laps} lap</Text> : null}
                  {editable && !elim && i > 0 ? <SmallBtn label="↑" a11y={`Move ${e.name} up one place`} onPress={() => up(e)} /> : null}
                  {editable ? <SmallBtn label="✕" a11y={`Take ${e.name} off the line`} onPress={() => void remove(e)} /> : null}
                </View>
                {timed && editable ? (
                  <View style={st.row}>
                    <TimeBox key={`${e.id}:${e.result.mark ?? ''}`} value={e.result.mark != null ? secsText(e.result.mark) : ''} placeholder={i === 0 ? 'Winner’s time 2:41:07' : 's.t. (or a time)'}
                      label={`Time for ${e.name}`} onCommit={(x) => saveTime(e, x)} />
                    {i > 0 && t?.raw != null && t.st ? <Text style={st.hint}>within 1 s of the rider ahead → s.t.</Text> : null}
                  </View>
                ) : null}
                {kind === 'stage' && editable ? <StageExtras e={e} onSave={onSave} /> : null}
                {kind === 'scratch' && editable ? (
                  <View style={st.row}>
                    <SmallBtn label="− lap" a11y={`${e.name} lost a lap`} onPress={() => lap(e, -1)} />
                    <SmallBtn label="+ lap" a11y={`${e.name} gained a lap`} onPress={() => lap(e, 1)} />
                  </View>
                ) : null}
              </View>
            );
          })}
          {timed && placed.length > 1 && winnerTime == null ? <Text style={st.bad}>Type the winner’s time — the group times count from it.</Text> : null}
        </View>
      )}
      {out.length > 0 && (
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={st.head}>NOT CLASSIFIED</Text>
          <View style={st.wrap}>
            {out.map((e) => <SelectChip key={e.id} label={`${statusOf(e)} · ${e.name}`} active={false} disabled={!editable} onPress={() => clearStatus(e)} />)}
          </View>
        </View>
      )}
    </Card>
  );
}

function SmallBtn({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} style={st.small}>
      <Text style={st.smallTxt}>{label}</Text>
    </TouchableOpacity>
  );
}

/** A time box that saves on blur / Enter; `onCommit` returns an error to show, or null. */
function TimeBox({ value, placeholder, label, onCommit }: { value: string; placeholder: string; label: string; onCommit: (text: string) => string | null }) {
  const [t, setT] = useState(value);
  const [err, setErr] = useState<string | null>(null);
  const commit = () => { if (t !== value) setErr(onCommit(t)); };
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <TextInput style={[st.input, !!err && st.inputBad]} value={t} onChangeText={(x) => { setT(x); setErr(null); }} placeholder={placeholder} placeholderTextColor={theme.colors.textMuted}
        keyboardType="numbers-and-punctuation" accessibilityLabel={label} onBlur={commit} onSubmitEditing={commit} />
      {err ? <Text style={st.bad}>{err}</Text> : null}
    </View>
  );
}

function NumBox({ value, label, placeholder, onSave }: { value?: number; label: string; placeholder: string; onSave: (v: number | undefined) => void }) {
  const [t, setT] = useState(value != null ? String(value) : '');
  const commit = () => { const v = t.trim() ? Number(t.trim()) : undefined; if (v === undefined || (Number.isFinite(v) && v >= 0)) { if (v !== value) onSave(v || undefined); } };
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <TextInput style={[st.input, { width: 60, textAlign: 'center' }]} value={t} onChangeText={setT} placeholder={placeholder} placeholderTextColor={theme.colors.textMuted}
        keyboardType="number-pad" accessibilityLabel={label} onBlur={commit} onSubmitEditing={commit} />
      <Text style={st.sub}>{label.split(' for ')[0]}</Text>
    </View>
  );
}

/** A stage: time bonus (s), points and mountains (KOM) points earned. */
function StageExtras({ e, onSave }: { e: ResultEntry; onSave: Save }) {
  const set = (k: 'bonus' | 'pts' | 'kom', v: number | undefined) => onSave(e.id, { ...e.result, [k]: v }, `${k === 'bonus' ? 'Bonus' : k === 'pts' ? 'Points' : 'KOM'} ${v ?? 0} · ${first(e.name)}`);
  return (
    <View style={[st.row, { justifyContent: 'flex-end' }]}>
      <NumBox value={e.result.bonus} label={`Bonus s for ${e.name}`} placeholder="0" onSave={(v) => set('bonus', v)} />
      <NumBox value={e.result.pts} label={`Points for ${e.name}`} placeholder="0" onSave={(v) => set('pts', v)} />
      <NumBox value={e.result.kom} label={`KOM for ${e.name}`} placeholder="0" onSave={(v) => set('kom', v)} />
    </View>
  );
}

/* ------------------------------ stage race card ------------------------------- */

/** A stage: road (finish order + group times) or a time trial (a time per rider, reverse-GC start order). */
export function StageCard({ def, stageType, stageNo, stages, interval, entries, editable, onSave, statuses }: {
  def: DisciplineDef; stageType: 'road' | 'itt'; stageNo: number; stages: number; interval?: number; entries: ResultEntry[]; editable: boolean; onSave: Save; statuses: ResultStatus[];
}) {
  if (stageType === 'road') {
    return (
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={textStyles.muted}>Stage {stageNo} of {stages} · road stage (mass start). Time bonuses come off the GC time; points and KOM build the points and mountains classifications.</Text>
        <FinishOrderCard def={def} kind="stage" entries={entries} editable={editable} onSave={onSave} statuses={statuses} />
      </View>
    );
  }
  return <IttStageCard stageNo={stageNo} stages={stages} interval={interval} entries={entries} editable={editable} onSave={onSave} statuses={statuses} />;
}

const ITT_TIME = { unit: 'time' as const, dp: 2 };

function IttStageCard({ stageNo, stages, interval, entries, editable, onSave, statuses }: {
  stageNo: number; stages: number; interval?: number; entries: ResultEntry[]; editable: boolean; onSave: Save; statuses: ResultStatus[];
}) {
  const rows = [...entries].sort(byOrder);
  const save = (e: ResultEntry, text: string): string | null => {
    if (!text.trim()) { if (e.result.mark != null) onSave(e.id, { ...e.result, mark: undefined, thousandths: undefined }, `Time cleared · ${first(e.name)}`); return null; }
    const p = parseMark(text, ITT_TIME);
    if (!p) return "Can't read that — m:ss.hh";
    onSave(e.id, { ...e.result, mark: p.mark, thousandths: p.thousandths }, `${formatMark(p.mark, ITT_TIME)} · ${first(e.name)}`);
    return null;
  };
  return (
    <Card style={st.card}>
      <Text style={textStyles.h3}>⏱ Stage {stageNo} of {stages} · time trial</Text>
      <Text style={textStyles.muted}>Riders start alone in reverse GC order (the leader last){interval ? `, every ${interval} s` : ''}. Enter each rider’s time to 1/100 — the GC counts whole seconds and keeps the hundredths for a tie (UCI 2.6.015).</Text>
      {rows.map((e) => (
        <View key={e.id} style={st.lineRow}>
          <View style={st.row}>
            <Text style={st.pos}>#{e.result.order ?? '–'}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.name} numberOfLines={1}>{e.name}</Text>
              <Text style={st.sub}>{interval ? `Start ${startText(ittStart(e.result.order, interval))}` : ''}{e.result.gc ? `${interval ? ' · ' : ''}GC before: ${secsText(e.result.gc.time)}` : ''}</Text>
            </View>
            {inRace(e) ? null : <Text style={st.gap}>{statusOf(e)}</Text>}
          </View>
          {editable && inRace(e) ? <TimeBox key={`${e.id}:${e.result.mark ?? ''}`} value={e.result.mark != null ? formatMark(e.result.thousandths ?? e.result.mark, { ...ITT_TIME, dp: e.result.thousandths != null ? 3 : 2 }) : ''} placeholder="12:34.56" label={`Time for ${e.name}`} onCommit={(x) => save(e, x)} /> : null}
          {editable ? (
            <View style={st.wrap}>
              {statuses.map((s) => <SelectChip key={s} label={s} active={statusOf(e) === s} onPress={() => onSave(e.id, { ...e.result, status: statusOf(e) === s ? undefined : s }, `${s} · ${first(e.name)}`)} />)}
            </View>
          ) : null}
          {editable && inRace(e) ? <StageExtras e={e} onSave={onSave} /> : null}
        </View>
      ))}
    </Card>
  );
}

/* -------------------------------- points race --------------------------------- */

export function PointsRaceCard({ entries, laps, every, editable, onSave, statuses }: {
  entries: ResultEntry[]; laps?: number; every?: number; editable: boolean; onSave: Save; statuses: ResultStatus[];
}) {
  const S = Math.max(1, sprintCount(laps, every) || 1);
  const [sel, setSel] = useState<number>(() => {
    // the first sprint without its four places, else the finish
    for (let k = 1; k < S; k++) if (entries.filter((e) => e.result?.spr?.[String(k)] != null).length < Math.min(4, entries.length)) return k;
    return S;
  });
  const [mode, setMode] = useState<'line' | ResultStatus>('line');
  const isFinish = sel === S;
  const riders = entries.filter(inRace).sort(byOrder);
  const placedIn = (k: number) => riders.filter((e) => (k === S ? e.result.fin : e.result.spr?.[String(k)]) != null)
    .sort((a, b) => ((k === S ? a.result.fin : a.result.spr![String(k)]) ?? 0) - ((k === S ? b.result.fin : b.result.spr![String(k)]) ?? 0));
  const placed = placedIn(sel);
  const pool = riders.filter((e) => !placed.includes(e));
  const out = entries.filter((e) => !inRace(e)).sort(byOrder);

  const tap = (e: ResultEntry) => {
    if (!editable) return;
    if (mode !== 'line') { onSave(e.id, { ...e.result, status: mode }, `${mode} · ${first(e.name)}`); return; }
    if (isFinish) { const p = nextFin(entries); onSave(e.id, { ...e.result, fin: p }, `Finish ${p}. ${first(e.name)}${p <= 4 ? ` (${SPRINT_POINTS[p - 1] * 2} pts)` : ''}`); return; }
    if (placed.length >= 4) return;
    const p = placed.length + 1;
    saveAll(setSprintPlace(entries, e.id, sel, p), onSave, `Sprint ${sel}: ${p}. ${first(e.name)} (${sprintPoints(p, sel, S)} pts)`);
  };
  const unplace = (e: ResultEntry) => {
    if (!editable) return;
    if (isFinish) saveAll(placeOnLine(entries, e.id, null), onSave, `Off the finish · ${first(e.name)}`);
    else {
      // the riders behind move up one place
      const k = String(sel);
      const p = e.result.spr![k];
      const changes = entries.flatMap((x) => {
        const v = x.result?.spr?.[k];
        if (x.id === e.id) { const spr = { ...x.result.spr }; delete spr[k]; return [{ id: x.id, result: { ...x.result, spr } }]; }
        return v != null && v > p ? [{ id: x.id, result: { ...x.result, spr: { ...x.result.spr, [k]: v - 1 } } }] : [];
      });
      saveAll(changes, onSave, `Sprint ${sel}: ${first(e.name)} off`);
    }
  };
  const lap = (e: ResultEntry, d: number) => onSave(e.id, { ...e.result, laps: (e.result.laps ?? 0) + d || undefined }, `${d > 0 ? '+1 lap (+20)' : '−1 lap (−20)'} · ${first(e.name)}`);

  return (
    <Card style={st.card}>
      <View style={st.headRow}>
        <Text style={[textStyles.h3, { flex: 1 }]}>🚴 Points race</Text>
        <Text style={textStyles.muted}>{laps ? `${laps} laps · ` : ''}{S} sprint{S === 1 ? '' : 's'}</Text>
      </View>
      <Text style={textStyles.muted}>A sprint every {every ?? '–'} laps: 5-3-2-1 points; the final sprint (the finish) scores double, 10-6-4-2. Gaining a lap on the bunch +20, losing one −20. Equal points: the order in the final sprint.</Text>
      <View style={st.wrap}>
        {Array.from({ length: S }, (_, i) => i + 1).map((k) => {
          const n = placedIn(k).length;
          return <SelectChip key={k} label={`${k === S ? 'Finish' : `S${k}`}${n ? ` ✓${k === S ? n : ''}` : ''}`} active={sel === k} onPress={() => setSel(k)} />;
        })}
      </View>
      {editable && <ModeChips modes={['line', ...statuses]} mode={mode} setMode={setMode} lineLabel="Placings" />}
      <Text style={st.head}>{isFinish ? 'FINISH — TAP RIDERS IN ORDER (top 4 double points; the rest settle ties)' : `SPRINT ${sel} — TAP THE FIRST FOUR`}</Text>
      {placed.map((e) => {
        const p = isFinish ? e.result.fin! : e.result.spr![String(sel)];
        return (
          <View key={e.id} style={st.row}>
            <Text style={st.pos}>{p}</Text>
            <Text style={[st.name, { flex: 1 }]} numberOfLines={1}>{e.name}</Text>
            <Text style={st.gap}>{isFinish ? (p <= 4 ? `${SPRINT_POINTS[p - 1] * 2} pts` : '') : `${sprintPoints(p, sel, S)} pts`}</Text>
            {editable ? <SmallBtn label="✕" a11y={`Take ${e.name} off this sprint`} onPress={() => unplace(e)} /> : null}
          </View>
        );
      })}
      {(isFinish || placed.length < 4) && pool.length > 0 && (
        <View style={st.wrap}>
          {pool.map((e) => <SelectChip key={e.id} label={`${e.result.order ? `#${e.result.order} ` : ''}${e.name}`} dotColor={e.team?.colorHex} active={false} disabled={!editable} onPress={() => tap(e)} />)}
        </View>
      )}
      <Text style={st.head}>LAPS GAINED / LOST · TOTALS</Text>
      {riders.map((e) => {
        const t = pointsTotal(e.result);
        return (
          <View key={e.id} style={st.row}>
            <Text style={[st.name, { flex: 1 }]} numberOfLines={1}>{e.name}</Text>
            {editable ? <SmallBtn label="−" a11y={`${e.name} lost a lap`} onPress={() => lap(e, -1)} /> : null}
            <Text style={[st.gap, { minWidth: 44, textAlign: 'center' }]}>{e.result.laps ? `${e.result.laps > 0 ? '+' : ''}${e.result.laps} lap` : '0 lap'}</Text>
            {editable ? <SmallBtn label="+" a11y={`${e.name} gained a lap`} onPress={() => lap(e, 1)} /> : null}
            <Text style={[st.total]}>{t.total}</Text>
          </View>
        );
      })}
      {out.length > 0 && (
        <View style={st.wrap}>
          {out.map((e) => <SelectChip key={e.id} label={`${statusOf(e)} · ${e.name}`} active={false} disabled={!editable} onPress={() => onSave(e.id, { ...e.result, status: undefined }, `${statusOf(e)} cleared`)} />)}
        </View>
      )}
    </Card>
  );
}

/* ------------------------------- sprint bracket -------------------------------- */

export function SprintBracketCard({ entries, editable, onSave }: { entries: ResultEntry[]; editable: boolean; onSave: Save }) {
  const bo = sprintBo(entries);
  const match = useMemo(() => sprintMatch(bo), [bo]);
  const state = useMemo(() => bracketState(entries, 'sets', match), [entries, match]);
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const nm = (id?: string) => (id ? byId.get(id)?.name ?? '' : '');
  const seed = (id?: string) => (id ? byId.get(id)?.result.seed : undefined);
  const [selKey, setSelKey] = useState<string | null>(null);
  const sel = state.matches.find((m) => `${m.key}:${m.slot}` === selKey) ?? state.current;
  const order = (m: BMatch) => (m.round === 'B' ? state.rounds - 0.5 : (m.round as number));
  const groups = useMemo(() => {
    const g = new Map<string, BMatch[]>();
    for (const m of [...state.matches].sort((a, b) => order(a) - order(b) || a.slot - b.slot)) g.set(m.label, [...(g.get(m.label) ?? []), m]);
    return [...g].map(([label, ms]) => [label.replace('Gold medal match', 'Final (gold)').replace('Bronze medal match', 'Final (bronze)').replace(/^1\/(\d+) elimination$/, '1/$1 final'), ms] as const);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <Card style={st.card}>
      <View style={st.headRow}>
        <Text style={[textStyles.h3, { flex: 1 }]}>🚴 Sprint — match play</Text>
        <Text style={textStyles.muted}>{state.done ? 'complete' : `bracket of ${state.size}`}</Text>
      </View>
      <Text style={textStyles.muted}>{bo === 3 ? 'Best of three heats: the first to win two goes through.' : 'One heat per match.'} Seeded by the flying 200 m (1 v {state.size}, 2 v {state.size - 1} …); the semi-final losers race for bronze.</Text>
      {groups.map(([label, ms]) => (
        <View key={label} style={{ gap: theme.spacing(1) }}>
          <Text style={st.head}>{label.toUpperCase()}</Text>
          {ms.map((m) => {
            const on = sel && sel.key === m.key && sel.slot === m.slot;
            const score = m.bye ? (m.winner ? 'bye' : '') : m.out?.walkover ? 'w/o' : m.out && m.out.ends.length ? `${m.out.a}–${m.out.b}` : '';
            return (
              <TouchableOpacity key={`${m.key}:${m.slot}`} accessibilityRole="button" accessibilityLabel={`${label}: ${nm(m.a) || 'to come'} against ${nm(m.b) || (m.bye ? 'a bye' : 'to come')}`}
                disabled={m.bye || !m.known} onPress={() => setSelKey(`${m.key}:${m.slot}`)} style={[st.match, on && st.rowOn]}>
                <Text style={[st.mName, m.winner && m.winner === m.a && st.win]} numberOfLines={1}>{m.a ? `${seed(m.a)}. ${first(nm(m.a))}` : m.bye ? '—' : 'to come'}</Text>
                <Text style={st.mScore}>{score || 'v'}</Text>
                <Text style={[st.mName, { textAlign: 'right' }, m.winner && m.winner === m.b && st.win]} numberOfLines={1}>{m.b ? `${first(nm(m.b))} .${seed(m.b)}` : m.bye ? 'bye' : 'to come'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
      {sel && sel.known && !sel.bye && sel.a && sel.b ? (
        <SprintMatch key={`${sel.key}:${sel.slot}:${sel.a}:${sel.b}`} m={sel} rounds={state.rounds} bo={bo} entries={entries} editable={editable} onSave={onSave} />
      ) : null}
    </Card>
  );
}

function SprintMatch({ m, rounds, bo, entries, editable, onSave }: { m: BMatch; rounds: number; bo: 1 | 3; entries: ResultEntry[]; editable: boolean; onSave: Save }) {
  const ea = entries.find((e) => e.id === m.a)!, eb = entries.find((e) => e.id === m.b)!;
  const A = ea.result.mp?.[m.key], B = eb.result.mp?.[m.key];
  const out = m.out!;
  const match = sprintMatch(bo);
  const tag = m.round === 'B' ? 'Bronze' : roundShort(m.round, rounds);
  const apply = async (ra: EntryResult, rb: EntryResult, label: string) => {
    const after = entries.map((e) => (e.id === ea.id ? { ...e, result: ra } : e.id === eb.id ? { ...e, result: rb } : e));
    const stale = staleMatchData(after, 'sets', entries, match);
    const before = bracketState(entries, 'sets', match).matches.find((x) => x.key === m.key && x.slot === m.slot);
    const now = bracketState(after, 'sets', match).matches.find((x) => x.key === m.key && x.slot === m.slot);
    const flipped = !!before?.winner && before.winner !== now?.winner;
    if (stale.length || flipped) {
      const lines = stale.map((s) => `${entries.find((e) => e.id === s.id)?.name}: ${s.keys.map((k) => (k === 'B' ? 'bronze final' : roundShort(Number(k), rounds))).join(', ')}`);
      const ok = await askConfirm({
        title: 'Change the result of this match?',
        message: `${flipped ? `${before!.winner === ea.id ? ea.name : eb.name} won this match; with this change ${now?.winner ? `${now.winner === ea.id ? ea.name : eb.name} wins` : 'it is undecided'}. ` : ''}${lines.length ? `Later heats that no longer fit the bracket are cleared — ${lines.join('; ')}.` : ''}`,
        yesLabel: 'Yes, change it', noLabel: 'No, keep it', tone: 'danger',
      });
      if (!ok) return;
    }
    const next = new Map<string, EntryResult>([[ea.id, ra], [eb.id, rb]]);
    for (const s of stale) next.set(s.id, clearMatches(next.get(s.id) ?? entries.find((e) => e.id === s.id)!.result, s.keys));
    for (const [id, r] of next) onSave(id, r, id === ea.id ? label : undefined);
  };
  const heat = (k: number, w: 'a' | 'b' | null) => {
    const [ra, rb] = setSprintHeat(ea.result, eb.result, m.key, k, w);
    void apply(ra, rb, w ? `${tag} heat ${k + 1}: ${first(w === 'a' ? ea.name : eb.name)}` : `${tag} heat ${k + 1} cleared`);
  };
  const walkover = async (absent: 'a' | 'b') => {
    const e = absent === 'a' ? ea : eb;
    const ok = await askConfirm({ title: `${e.name} doesn't start this match?`, message: `${absent === 'a' ? eb.name : ea.name} goes through (walkover). ${e.name} keeps the earlier rounds and is placed with this round's losers.`, yesLabel: 'Yes, walkover', noLabel: 'No', tone: 'caution' });
    if (!ok) return;
    await apply(absent === 'a' ? setWalkover(ea.result, m.key, true) : ea.result, absent === 'b' ? setWalkover(eb.result, m.key, true) : eb.result, `Walkover · ${first(e.name)} out`);
  };
  const heatsShown = Math.min(bo, out.done ? out.ends.length : out.ends.length + 1);
  const wo = !!A?.wo || !!B?.wo;
  return (
    <View style={st.editor}>
      <Text style={st.tag}>{tag.toUpperCase()}</Text>
      <Text style={st.upName} accessibilityRole="header">{ea.result.seed}. {ea.name} {out.walkover ? 'v' : `${out.a}–${out.b}`} {eb.name} .{eb.result.seed}</Text>
      <Text style={textStyles.muted}>{out.done ? `${m.winner === ea.id ? ea.name : eb.name} wins${out.walkover ? ' (walkover)' : ''}.` : `Heat ${out.nextEnd ?? 1}${bo === 3 ? ' of 3' : ''} — who crossed the line first?`}</Text>
      {!wo && Array.from({ length: heatsShown }, (_, k) => {
        const w = A?.heats?.[k] === 1 ? 'a' : B?.heats?.[k] === 1 ? 'b' : null;
        return (
          <View key={k} style={st.row}>
            <Text style={[st.pos, { width: 54 }]}>Heat {k + 1}</Text>
            <SelectChip label={`${w === 'a' ? '✓ ' : ''}${first(ea.name)}`} active={w === 'a'} disabled={!editable} onPress={() => heat(k, w === 'a' ? null : 'a')} />
            <SelectChip label={`${w === 'b' ? '✓ ' : ''}${first(eb.name)}`} active={w === 'b'} disabled={!editable} onPress={() => heat(k, w === 'b' ? null : 'b')} />
          </View>
        );
      })}
      <Text style={st.hint}>A rider relegated by the commissaires loses the heat — tap the other rider. Tap a winner again to clear that heat.</Text>
      {editable && (
        <View style={st.wrap}>
          {wo ? <SelectChip label="Undo the walkover" active={false} onPress={() => void apply(setWalkover(ea.result, m.key, false), setWalkover(eb.result, m.key, false), 'Walkover removed')} />
            : !out.ends.length ? (
              <>
                <SelectChip label={`${first(ea.name)} absent (w/o)`} active={false} onPress={() => void walkover('a')} />
                <SelectChip label={`${first(eb.name)} absent (w/o)`} active={false} onPress={() => void walkover('b')} />
              </>
            ) : null}
        </View>
      )}
    </View>
  );
}

/** "Road race · 72 km" / "Points race · 40 laps, sprints every 10" — the header line. */
export function cycHeader(kind: CycKind | undefined, def: DisciplineDef, f: { cyc?: { laps?: number; sprintEvery?: number; interval?: number; km?: number; stageType?: 'road' | 'itt' }; handTimed?: boolean }): string {
  const c = f.cyc ?? {};
  const bits = [`UCI ${cycEventOf(def.key)?.setting ?? 'road'}`];
  if (kind === 'itt') bits.push(`riders start alone${c.interval ? ` every ${c.interval} s` : ''}`, 'times to 1/100 (thousandths split a tie)');
  if (kind === 'stage' && c.stageType === 'itt') bits.push('time-trial stage', 'GC on cumulative time');
  else if (kind === 'rr' || kind === 'stage') bits.push(c.km ? `${c.km} km` : '', 'order on the line; groups get the same time');
  if (kind === 'points') bits.push(c.laps ? `${c.laps} laps` : '', c.sprintEvery ? `a sprint every ${c.sprintEvery} laps` : '');
  if (kind === 'scratch') bits.push(c.laps ? `${c.laps} laps` : '', 'first over the line wins');
  if (kind === 'elim') bits.push('the last rider every 2 laps is out');
  if (kind === 'keirin') bits.push('paced laps, then the sprint — order on the line');
  if (kind === 'ip' || kind === 'tt' || kind === 'sprint') bits.push('times to 1/1000');
  if (f.handTimed) bits.push('hand timing');
  return bits.filter(Boolean).join(' · ');
}

const st = StyleSheet.create({
  card: { gap: theme.spacing(2), padding: theme.spacing(3) },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), alignItems: 'center' },
  head: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  rowOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.surfaceAlt },
  lineRow: { gap: theme.spacing(1), paddingVertical: theme.spacing(1.5), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  pos: { width: 28, color: theme.colors.text, fontWeight: '900', fontSize: theme.font.small, fontVariant: ['tabular-nums'] },
  name: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  sub: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  gap: { color: theme.colors.text, fontWeight: '800', fontVariant: ['tabular-nums'], fontSize: theme.font.small },
  total: { color: theme.colors.primary, fontWeight: '900', fontVariant: ['tabular-nums'], fontSize: theme.font.body, minWidth: 36, textAlign: 'right' },
  small: { minWidth: 36, minHeight: 36, paddingHorizontal: theme.spacing(2), borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceAlt },
  smallTxt: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.small },
  input: {
    backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(2), color: theme.colors.text, fontSize: theme.font.body,
  },
  inputBad: { borderColor: theme.colors.danger },
  bad: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  hint: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  editor: { gap: theme.spacing(2), padding: theme.spacing(2.5), borderRadius: theme.radius.sm, borderWidth: 2, borderColor: theme.colors.primary },
  match: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(1.5), paddingHorizontal: theme.spacing(1.5), borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.border },
  mName: { flex: 1, minWidth: 0, color: theme.colors.text, fontSize: theme.font.small },
  win: { fontWeight: '900', color: theme.colors.primary },
  mScore: { color: theme.colors.text, fontWeight: '800', fontVariant: ['tabular-nums'], fontSize: theme.font.small, textAlign: 'center', minWidth: 56 },
  tag: { color: theme.colors.primary, fontWeight: '900', fontSize: theme.font.small, letterSpacing: 0.5 },
  upName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
});
