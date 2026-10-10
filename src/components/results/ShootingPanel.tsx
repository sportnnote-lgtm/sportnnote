/** SD-96 — the shooting official's controls on the results screen:
 *   - SeriesCard: one series at a time for every shooter (the way a range
 *     scores) — the series total (+ inner tens, integer scoring), or the shots
 *     typed in one line ("10.4 10.2 9.9 …", "10 9 X …"); hard limits refuse
 *     (a series of 10 never tops 109.0 / 100), a low series asks first;
 *   - FinalCard: the elimination final shot by shot — "Shot 13 of 24", one box
 *     per shooter still in, automatic eliminations ("out after shot 12: … 8th"),
 *     the shoot-off when the lowest are level, and corrections (a change before
 *     an elimination asks first: places may change).
 *  Pure rules live in data/results/shooting.ts. */
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Card, SelectChip, textStyles } from '../ui';
import { askConfirm } from '../ConfirmSheet';
import {
  seriesCount, positionOf, parseShot, seriesError, seriesLow, setSeries, seriesFromShots, scoreText, totalText, finalState, finalShotError,
  setFinalShot, addShootOff, finalStatusText, ordinal, POSITION_LABEL,
  type EntryResult, type ResultEntry, type ShootEventDef,
} from '../../data/results';

type Save = (entryId: string, next: EntryResult, undoLabel?: string) => void;
const first = (name: string) => name.split(' ')[0];
const inPlay = (e: ResultEntry) => !['DNS', 'WD', 'DQ'].includes(e.result.status ?? 'ok');
const num = (t: string): number | undefined => { const v = Number(t.trim().replace(',', '.')); return t.trim() && Number.isFinite(v) ? v : undefined; };

/** A final shot as typed: "10.5", or the digits only — "105" → 10.5, "98" → 9.8 (a decimal keypad shortcut). */
export function readFinalShot(t: string): number | undefined {
  const s = t.trim().replace(',', '.');
  if (!s) return undefined;
  const v = Number(s);
  if (!Number.isFinite(v)) return undefined;
  if (!s.includes('.') && v >= 11 && v <= 109) return v / 10;
  return v;
}

/* --------------------------------- series --------------------------------- */

export function SeriesCard({ entries, ev, shots, mode, editable, onSave }: {
  entries: ResultEntry[]; ev: ShootEventDef; shots: number; mode: 'series' | 'shot'; editable: boolean; onSave: Save;
}) {
  const n = seriesCount(ev, shots);
  const rows = useMemo(() => entries.filter(inPlay).sort((a, b) => (a.result.order ?? 99) - (b.result.order ?? 99)), [entries]);
  const doneIn = (i: number) => rows.filter((e) => (e.result.series ?? []).length > i).length;
  const firstOpen = Array.from({ length: n }, (_, i) => i).find((i) => doneIn(i) < rows.length) ?? n - 1;
  const [sel, setSel] = useState<number | null>(null);
  const cur = sel != null && sel < n ? sel : firstOpen;
  const label = (i: number) => { const p = positionOf(ev, shots, i); return p ? `${p}${i % Math.max(1, Math.round(n / 3)) + 1}` : `S${i + 1}`; };
  const pos = positionOf(ev, shots, cur);
  const per = Math.min(ev.seriesOf, shots - cur * ev.seriesOf);
  const all = rows.length > 0 && doneIn(n - 1) === rows.length && Array.from({ length: n }, (_, i) => doneIn(i)).every((d) => d === rows.length);
  return (
    <Card style={st.card}>
      <View style={st.headRow}>
        <Text style={[textStyles.h3, { flex: 1 }]}>🎯 {all ? 'All series in' : `Series ${cur + 1} of ${n}`}</Text>
        <Text style={textStyles.muted}>{doneIn(cur)}/{rows.length}</Text>
      </View>
      <View style={st.wrap}>
        {Array.from({ length: n }, (_, i) => (
          <SelectChip key={i} label={`${label(i)}${doneIn(i) === rows.length && rows.length ? ' ✓' : ''}`} active={i === cur} onPress={() => setSel(i)} />
        ))}
      </View>
      <Text style={textStyles.muted}>
        {pos ? `${POSITION_LABEL[pos]} · ` : ''}{per} {ev.scoring === 'hits' ? 'targets' : 'shots'} · {mode === 'shot' ? `type the shots in one line${ev.scoring === 'integer' ? ' (X = inner ten)' : ''}` : ev.scoring === 'integer' ? 'the series total and its inner tens (X)' : ev.scoring === 'hits' ? 'targets hit' : 'the series total (decimal)'}
      </Text>
      {rows.map((e) => (
        <SeriesInput key={`${e.id}:${cur}:${e.result.series?.[cur] ?? ''}:${e.result.seriesX?.[cur] ?? ''}`} e={e} i={cur} per={per} ev={ev} mode={mode} editable={editable} onSave={onSave} />
      ))}
      {!rows.length && <Text style={textStyles.muted}>No shooters in play.</Text>}
    </Card>
  );
}

function SeriesInput({ e, i, per, ev, mode, editable, onSave }: { e: ResultEntry; i: number; per: number; ev: ShootEventDef; mode: 'series' | 'shot'; editable: boolean; onSave: Save }) {
  const r = e.result;
  const have = r.series?.[i];
  const shotsHere = r.shots?.[i];
  const [t, setT] = useState(mode === 'shot' && shotsHere?.length ? shotsHere.join(' ') : have != null ? scoreText(have, ev.scoring) : '');
  const [x, setX] = useState(r.seriesX?.[i] != null && have != null ? String(r.seriesX[i]) : '');
  const [err, setErr] = useState<string | null>(null);
  const busy = useRef(false);
  const blocked = (r.series ?? []).length < i;
  const preview = mode === 'shot' && t.trim() ? readShots(t, ev) : null;
  const commit = async () => {
    if (busy.current || !editable || blocked) return;
    busy.current = true;
    try {
      if (!t.trim()) {
        if (have != null && i === (r.series ?? []).length - 1) onSave(e.id, setSeries(r, i, ev.scoring, null), `S${i + 1} cleared · ${first(e.name)}`);
        setErr(null);
        return;
      }
      let v: { total: number; xs?: number; shots?: (number | 'X')[] };
      if (mode === 'shot') {
        const p = readShots(t, ev);
        if ('error' in p) { setErr(p.error); return; }
        if (p.shots.length !== per) { setErr(`${p.shots.length} shots typed — a series here is ${per}.`); return; }
        v = { total: p.total, shots: p.shots };
      } else {
        const total = num(t);
        if (total == null) { setErr(`Can't read "${t}".`); return; }
        const xs = x.trim() ? num(x) : undefined;
        v = { total, ...(xs != null ? { xs } : {}) };
      }
      const bad = seriesError(v.total, v.shots ? undefined : v.xs, per, ev.scoring);
      if (bad) { setErr(bad); return; }
      if (have != null && Math.abs(have - v.total) < 1e-9 && (v.shots ? JSON.stringify(v.shots) === JSON.stringify(shotsHere) : (v.xs ?? 0) === (r.seriesX?.[i] ?? 0))) { setErr(null); return; }
      const low = seriesLow(v.total, per, ev.scoring);
      if (low && !(await askConfirm({ title: 'Check this series', message: `${first(e.name)}: ${low}`, yesLabel: `Yes, ${scoreText(v.total, ev.scoring)}`, noLabel: 'No, re-enter it', tone: 'caution' }))) {
        // not saved: show what is stored, so the same digits aren't asked about again on the next blur
        setT(mode === 'shot' && shotsHere?.length ? shotsHere.join(' ') : have != null ? scoreText(have, ev.scoring) : '');
        return;
      }
      setErr(null);
      onSave(e.id, setSeries(r, i, ev.scoring, v), `S${i + 1} ${scoreText(v.total, ev.scoring)} · ${first(e.name)}`);
    } finally { busy.current = false; }
  };
  const so = (r.series ?? []).length;
  return (
    <View style={{ gap: 2 }}>
      <View style={st.headRow}>
        <Text style={st.lot}>{r.order ?? '–'}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.name} numberOfLines={1}>{e.name}</Text>
          <Text style={st.sub} numberOfLines={1}>{r.mark != null ? `${so} series · ${totalText(r.mark, ev.scoring === 'integer' ? r.xs : undefined, ev.scoring)}` : 'no series yet'}</Text>
        </View>
        {blocked ? <Text style={st.sub}>S{so + 1} first</Text> : (
          <>
            <TextInput style={[st.input, mode === 'shot' ? { width: 150 } : { width: 76 }, !!err && st.inputBad]} value={t} onChangeText={setT} editable={editable}
              placeholder={mode === 'shot' ? (ev.scoring === 'decimal' ? '10.4 10.2 …' : '10 9 X …') : 'total'}
              placeholderTextColor={theme.colors.textMuted} keyboardType={mode === 'shot' ? 'default' : ev.scoring === 'decimal' ? 'decimal-pad' : 'number-pad'} autoCapitalize="characters"
              accessibilityLabel={`Series ${i + 1} of ${e.name}`} onBlur={() => void commit()} onSubmitEditing={() => void commit()} />
            {mode === 'series' && ev.scoring === 'integer' && (
              <TextInput style={[st.input, { width: 44 }]} value={x} onChangeText={setX} editable={editable} placeholder="X" placeholderTextColor={theme.colors.textMuted}
                keyboardType="number-pad" accessibilityLabel={`Inner tens in series ${i + 1} of ${e.name}`} onBlur={() => void commit()} onSubmitEditing={() => void commit()} />
            )}
          </>
        )}
      </View>
      {preview && !('error' in preview) ? <Text style={st.hint}>{preview.shots.length} shots = {scoreText(preview.total, ev.scoring)}{preview.xs ? ` · ${preview.xs}x` : ''}</Text> : null}
      {err ? <Text style={st.bad}>{err}</Text> : null}
    </View>
  );
}

/** "10.4 10.2 9.9" / "10 9 X" → the shots, their total and inner tens. */
function readShots(t: string, ev: ShootEventDef): { shots: (number | 'X')[]; total: number; xs: number } | { error: string } {
  const parts = t.trim().split(/[\s,;]+/).filter(Boolean);
  const shots: (number | 'X')[] = [];
  for (const p of parts) {
    const s = parseShot(p, ev.scoring);
    if ('error' in s) return { error: `Shot ${shots.length + 1}: ${s.error}` };
    shots.push(s.value);
  }
  return { shots, ...seriesFromShots(shots) };
}

/* ---------------------------------- final ---------------------------------- */

export function FinalCard({ entries, ev, editable, onSave }: { entries: ResultEntry[]; ev: ShootEventDef; editable: boolean; onSave: Save }) {
  const state = useMemo(() => finalState(entries, ev), [entries, ev]);
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const nameOf = (id: string) => byId.get(id)?.name ?? '';
  const [fixing, setFixing] = useState<string | null>(null);
  const lastOut = state.out[state.out.length - 1];
  const total = (id: string) => scoreText((state.totals.get(id) ?? 0) / 10, 'decimal');
  // the shooters still to fire the next shot (in firing-point order)
  const shooters = state.alive.map((id) => byId.get(id)!).sort((a, b) => (a.result.order ?? 99) - (b.result.order ?? 99));
  const passed = Math.max(0, ...state.out.map((o) => o.after));
  return (
    <Card style={st.upCard}>
      <View style={st.headRow}>
        <Text style={st.tag}>FINAL</Text>
        <Text style={[textStyles.muted, { flex: 1, textAlign: 'right' }]} numberOfLines={1}>{state.n} finalists · {ev.final?.stage ?? 'single shots'}</Text>
      </View>
      <Text style={st.upName} accessibilityRole="header">{finalStatusText(state, nameOf)}</Text>
      {lastOut && !state.done ? <Text style={st.out}>Out after shot {lastOut.after}: {nameOf(lastOut.id)} — {ordinal(lastOut.place)} ({total(lastOut.id)})</Text> : null}
      {editable && state.shootOff ? (
        <View style={{ gap: theme.spacing(2) }}>
          {state.shootOff.ids.map((id) => {
            const e = byId.get(id)!;
            const have = e.result.so?.[String(state.shootOff!.after)]?.[state.shootOff!.round - 1];
            return (
              <ShotRow key={`${id}:so:${state.shootOff!.after}:${state.shootOff!.round}:${have ?? ''}`} name={e.name} sub={`level on ${total(id)} · shoot-off shot ${state.shootOff!.round}`} value={have} done={have != null}
                onSave={(v) => onSave(id, addShootOff(e.result, state.shootOff!.after, state.shootOff!.round, v), `Shoot-off ${v.toFixed(1)} · ${first(e.name)}`)} />
            );
          })}
          <Text style={st.hint}>One shot each; the lowest goes out (level again: another shot). Shoot-off shots are not added to the total.</Text>
        </View>
      ) : editable && !state.done ? (
        <View style={{ gap: theme.spacing(2) }}>
          {shooters.map((e) => {
            const fired = (e.result.fshots ?? []).length;
            const has = fired >= state.nextShot;
            return (
              <ShotRow key={`${e.id}:${state.nextShot}:${fired}`} name={e.name} lot={e.result.order} sub={`${total(e.id)} after ${fired} shot${fired === 1 ? '' : 's'}${fired ? ` · last ${e.result.fshots![fired - 1].toFixed(1)}` : ''}`}
                value={has ? e.result.fshots![state.nextShot - 1] : undefined} done={has}
                onSave={(v) => onSave(e.id, setFinalShot(e.result, fired, v), `Shot ${fired + 1} ${v.toFixed(1)} · ${first(e.name)}`)} />
            );
          })}
          <Text style={st.hint}>Type each shot as it is shown (10.5, or 105). After the elimination shot the lowest total goes out automatically; equal lowest totals shoot off.</Text>
        </View>
      ) : null}
      {editable && (
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={st.head}>Correct a shot — tap a finalist</Text>
          <View style={st.wrap}>
            {entries.filter(inPlay).map((e) => <SelectChip key={e.id} label={first(e.name)} active={fixing === e.id} onPress={() => setFixing(fixing === e.id ? null : e.id)} />)}
          </View>
          {fixing && byId.get(fixing) && <ShotFixer key={fixing} e={byId.get(fixing)!} passed={passed} onSave={onSave} onDone={() => setFixing(null)} />}
        </View>
      )}
    </Card>
  );
}

function ShotRow({ name, lot, sub, value, done, onSave }: { name: string; lot?: number; sub: string; value?: number; done?: boolean; onSave: (v: number) => void }) {
  const [t, setT] = useState(value != null ? value.toFixed(1) : '');
  const [err, setErr] = useState<string | null>(null);
  const commit = () => {
    if (done || !t.trim()) return;
    const v = readFinalShot(t);
    const bad = v == null ? `Can't read "${t}".` : finalShotError(v);
    if (bad) { setErr(bad); return; }
    setErr(null);
    onSave(v!);
  };
  return (
    <View style={{ gap: 2 }}>
      <View style={st.headRow}>
        {lot != null ? <Text style={st.lot}>{lot}</Text> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.name} numberOfLines={1}>{name}</Text>
          <Text style={st.sub} numberOfLines={1}>{sub}</Text>
        </View>
        {done ? <Text style={st.doneTxt}>✓ {value?.toFixed(1)}</Text> : (
          <TextInput style={[st.input, { width: 76 }, !!err && st.inputBad]} value={t} onChangeText={setT} placeholder="10.5" placeholderTextColor={theme.colors.textMuted}
            keyboardType="decimal-pad" accessibilityLabel={`Shot for ${name}`} onBlur={commit} onSubmitEditing={commit} />
        )}
      </View>
      {err ? <Text style={st.bad}>{err}</Text> : null}
    </View>
  );
}

/** Correct one finalist's shots: tap a shot to change it, or take the last one off. */
function ShotFixer({ e, passed, onSave, onDone }: { e: ResultEntry; passed: number; onSave: Save; onDone: () => void }) {
  const shots = e.result.fshots ?? [];
  const [i, setI] = useState<number | null>(null);
  const [t, setT] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const warn = (k: number) => (k < passed ? askConfirm({ title: 'Change a shot before an elimination?', message: `Shot ${k + 1} was fired before the elimination after shot ${passed}. Changing it can change who went out and the places.`, yesLabel: 'Yes, change it', noLabel: 'No, keep it', tone: 'caution' }) : Promise.resolve(true));
  const apply = async () => {
    if (i == null) return;
    const v = readFinalShot(t);
    const bad = v == null ? 'Type the shot.' : finalShotError(v);
    if (bad) { setErr(bad); return; }
    if (!(await warn(i))) return;
    onSave(e.id, setFinalShot(e.result, i, v!), `Shot ${i + 1} → ${v!.toFixed(1)} · ${first(e.name)}`);
    onDone();
  };
  const removeLast = async () => {
    if (!shots.length) return;
    const k = shots.length - 1;
    const ok = await askConfirm({ title: `Remove shot ${k + 1}?`, message: `${e.name}'s shot ${k + 1} (${shots[k].toFixed(1)}) is taken off.${k < passed ? ` It was fired before the elimination after shot ${passed} — places may change.` : ''}`, yesLabel: 'Yes, remove', noLabel: 'No, keep it', tone: 'danger' });
    if (!ok) return;
    onSave(e.id, setFinalShot(e.result, k, null), `Shot ${k + 1} removed · ${first(e.name)}`);
    onDone();
  };
  return (
    <View style={st.editor}>
      <View style={st.wrap}>
        {shots.length ? shots.map((v, k) => (
          <TouchableOpacity key={k} accessibilityRole="button" accessibilityLabel={`Shot ${k + 1}: ${v.toFixed(1)}`} onPress={() => { setI(k); setT(v.toFixed(1)); setErr(null); }} style={[st.cell, i === k && st.cellOn]}>
            <Text style={st.cellNo}>{k + 1}</Text>
            <Text style={st.cellTxt}>{v.toFixed(1)}</Text>
          </TouchableOpacity>
        )) : <Text style={textStyles.muted}>No final shots yet.</Text>}
      </View>
      {i != null && (
        <View style={st.wrap}>
          <TextInput style={[st.input, { width: 76 }]} value={t} onChangeText={setT} keyboardType="decimal-pad" accessibilityLabel={`New value for shot ${i + 1}`} onSubmitEditing={() => void apply()} />
          <SelectChip label={`Set shot ${i + 1}`} active={false} onPress={() => void apply()} />
        </View>
      )}
      {shots.length > 0 && <SelectChip label="Remove the last shot" active={false} onPress={() => void removeLast()} />}
      {err ? <Text style={st.bad}>{err}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  card: { gap: theme.spacing(2), padding: theme.spacing(3) },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), alignItems: 'center' },
  head: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  lot: { color: theme.colors.textMuted, fontWeight: '800', fontSize: theme.font.small, width: 22 },
  name: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  sub: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  input: {
    backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(1.5), color: theme.colors.text, fontSize: theme.font.body, fontVariant: ['tabular-nums'],
  },
  inputBad: { borderColor: theme.colors.danger },
  bad: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  hint: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  upCard: { gap: theme.spacing(2), padding: theme.spacing(3), borderWidth: 2, borderColor: theme.colors.primary },
  tag: { color: theme.colors.primary, fontWeight: '900', fontSize: theme.font.small, letterSpacing: 0.5 },
  upName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  out: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  doneTxt: { color: theme.colors.primary, fontWeight: '900', fontVariant: ['tabular-nums'] },
  editor: { gap: theme.spacing(2), padding: theme.spacing(2), borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.border },
  cell: { minWidth: 44, paddingVertical: 4, paddingHorizontal: 6, borderRadius: theme.radius.sm, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  cellOn: { borderColor: theme.colors.primary },
  cellNo: { color: theme.colors.textMuted, fontSize: 9, fontWeight: '700' },
  cellTxt: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
