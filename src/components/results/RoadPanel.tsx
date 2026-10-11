/** SD-92 — the official's controls for an athletics road race, race walk or
 *  cross-country race on the results screen (the SD-98 cycling finish-order
 *  pattern, without same-time groups):
 *   - RoadFinishCard: tap runners — or type a bib and press Enter — in the
 *     order they cross the line; a time per runner is optional (type it at
 *     gaps or for everyone; gun time by default); ↑ moves a runner up, ✕ takes
 *     them off the line; DNF / DQ / DNS by mode; race walks add a 🟥 red-card
 *     mode (3 from different judges disqualify, TR 54.7.1 — 4 with the Penalty
 *     Zone rule) with a confirm before the DQ.
 *   - TeamTable: the team score by placings (complete teams ranked by total,
 *     the last-scorer tie-break shown; incomplete teams listed, not ranked).
 *  Pure rules live in data/results/road.ts. */
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import type { TextInput as TextInputT } from 'react-native';
import { theme } from '../../core/theme';
import { Card, SelectChip, textStyles } from '../ui';
import { askConfirm } from '../ConfirmSheet';
import {
  formatMark, placeOnLine, nextFin, parseRoadTime, entryByBib, orderClash, walkCards, dqCards, roadRange, roadEventOf, rangeCheck,
  teamLine, tieBrokenByLast, describeTeamScoring, penaltyMinutes,
  type DisciplineDef, type EntryResult, type ResultEntry, type ResultStatus, type RoadFormat, type TeamResult,
} from '../../data/results';

type Save = (entryId: string, next: EntryResult, undoLabel?: string) => void;
type Mode = 'line' | 'card' | ResultStatus;
const first = (name: string) => name.split(' ')[0];
const statusOf = (e: ResultEntry) => (e.result?.status ?? 'ok') as ResultStatus;
const inRace = (e: ResultEntry) => statusOf(e) === 'ok';
const bibNo = (e: ResultEntry) => Number(e.result?.bib) || e.result?.order || 9999;
const byBib = (a: ResultEntry, b: ResultEntry) => bibNo(a) - bibNo(b) || a.name.localeCompare(b.name);
const STATUS_HELP: Partial<Record<ResultStatus, string>> = { DNF: 'did not finish', DQ: 'disqualified (give the rule, e.g. TR 54.7 / TR 17)', DNS: 'did not start' };

function saveAll(changes: { id: string; result: EntryResult }[], onSave: Save, label: string) {
  changes.forEach((c, i) => onSave(c.id, c.result, i === 0 ? label : undefined));
}

/** "Road 10 km · certified course · gun time" — the line under the event title. */
export function roadHeader(def: DisciplineDef, road?: RoadFormat): string {
  const ev = roadEventOf(def.key);
  if (!ev) return '';
  const bits = [
    ev.kind === 'xc' ? 'World Athletics TR 56 cross-country · order of finish · no records (courses differ)'
      : ev.kind === 'walk' ? `World Athletics TR 54 race walk · ${road?.penaltyZone ? `Penalty Zone rule: 3 red cards = ${penaltyMinutes(ev.metres)} min in the zone, 4th = DQ` : '3 red cards from different judges = DQ'}`
        : 'World Athletics TR 55 road race · order of finish',
    ev.kind !== 'xc' ? (ev.track ? 'track walk, times to 1/100' : 'times to the whole second (TR 19.24)') : '',
    ev.kind === 'road' || (ev.kind === 'walk' && !ev.track) ? (road?.certified ? 'certified course — records count' : 'course not certified — no records (PBs still count)') : '',
    road?.timing === 'chip' ? 'chip (net) times — not official, no records' : ev.kind !== 'xc' ? 'gun time' : '',
  ];
  return bits.filter(Boolean).join(' · ');
}

export function RoadFinishCard({ def, entries, editable, onSave, road, age }: {
  def: DisciplineDef; entries: ResultEntry[]; editable: boolean; onSave: Save; road?: RoadFormat; age?: string;
}) {
  const ev = roadEventOf(def.key);
  const walk = ev?.kind === 'walk';
  const [mode, setMode] = useState<Mode>('line');
  const [bib, setBib] = useState('');
  const [bibErr, setBibErr] = useState<string | null>(null);
  const bibRef = useRef<TextInputT>(null);
  const placed = useMemo(() => entries.filter((e) => inRace(e) && e.result?.fin != null).sort((a, b) => a.result.fin! - b.result.fin!), [entries]);
  const pool = useMemo(() => entries.filter((e) => inRace(e) && e.result?.fin == null).sort(byBib), [entries]);
  const out = useMemo(() => entries.filter((e) => !inRace(e)).sort(byBib), [entries]);
  const carded = useMemo(() => entries.filter((e) => (e.result?.rc ?? 0) > 0).sort(byBib), [entries]);
  const timed = placed.filter((e) => e.result.mark != null).length;

  const addCard = async (e: ResultEntry) => {
    const n = (e.result.rc ?? 0) + 1;
    const lim = dqCards(road?.penaltyZone);
    if (n >= lim) {
      const ok = await askConfirm({
        title: `${n === lim ? 'Disqualify' : 'Another red card for'} ${first(e.name)}?`,
        message: `${e.name} now has ${n} red cards from different judges${road?.penaltyZone ? '' : ''} — that is a disqualification (TR 54.7${road?.penaltyZone ? '.4' : '.1'}). They come off the finish order.`,
        yesLabel: 'Yes, red card + DQ', noLabel: 'No, cancel', tone: 'danger',
      });
      if (!ok) return;
      const off = placeOnLine(entries, e.id, null).map((c) => (c.id === e.id ? { ...c, result: { ...c.result, rc: n, status: 'DQ' as const, ruleRef: 'TR 54.7' } } : c));
      saveAll(off, onSave, `🟥 ${n} · DQ ${first(e.name)}`);
      return;
    }
    onSave(e.id, { ...e.result, rc: n }, `🟥 ${n} · ${first(e.name)}`);
  };
  const removeCard = (e: ResultEntry) => {
    const n = Math.max(0, (e.result.rc ?? 0) - 1);
    const undoDq = statusOf(e) === 'DQ' && e.result.ruleRef === 'TR 54.7' && n < dqCards(road?.penaltyZone);
    onSave(e.id, { ...e.result, rc: n || undefined, ...(undoDq ? { status: undefined, ruleRef: undefined } : {}) }, `🟥 −1 · ${first(e.name)}`);
  };

  const tap = (e: ResultEntry) => {
    if (!editable) return;
    if (mode === 'card') { void addCard(e); return; }
    if (mode !== 'line') {
      const changes = placeOnLine(entries, e.id, null).map((c) => (c.id === e.id ? { ...c, result: { ...c.result, status: mode } } : c));
      saveAll(changes, onSave, `${mode} · ${first(e.name)}`);
      return;
    }
    const f = nextFin(entries);
    onSave(e.id, { ...e.result, fin: f }, `${f}. ${first(e.name)}`);
  };
  const submitBib = () => {
    const b = bib.trim();
    if (!b) return;
    const e = entryByBib(entries, b);
    if (!e) { setBibErr(`No runner with bib ${b}.`); return; }
    if (mode === 'line' && e.result.fin != null) { setBibErr(`Bib ${b} (${e.name}) has already finished (place ${e.result.fin}).`); return; }
    if (mode === 'line' && !inRace(e)) { setBibErr(`Bib ${b} (${e.name}) is ${statusOf(e)} — clear that first.`); return; }
    setBibErr(null); setBib('');
    tap(e);
    bibRef.current?.focus();
  };
  const clearStatus = (e: ResultEntry) => editable && onSave(e.id, { ...e.result, status: undefined, ruleRef: undefined }, `${statusOf(e)} cleared · ${first(e.name)}`);
  const remove = async (e: ResultEntry) => {
    const last = e.result.fin === Math.max(...placed.map((x) => x.result.fin!));
    if (!last) {
      const ok = await askConfirm({ title: `Take ${first(e.name)} off the finish order?`, message: `${e.name} goes back to the runners still out on the course; everyone behind moves up one place.`, yesLabel: 'Yes, take off', noLabel: 'No, keep', tone: 'caution' });
      if (!ok) return;
    }
    saveAll(placeOnLine(entries, e.id, null), onSave, `Off the line · ${first(e.name)}`);
  };
  const up = (e: ResultEntry) => {
    const f = e.result.fin!;
    if (f > 1) saveAll(placeOnLine(entries, e.id, f - 1), onSave, `${first(e.name)} up to ${f - 1}`);
  };
  const saveTime = async (e: ResultEntry, text: string): Promise<string | null> => {
    if (!text.trim()) { if (e.result.mark != null) onSave(e.id, { ...e.result, mark: undefined, rangeOk: undefined }, `Time cleared · ${first(e.name)}`); return null; }
    const t = parseRoadTime(text, def);
    if (t == null) return ev?.track ? 'Can’t read that — m:ss.hh (13:05.42) or digits' : 'Can’t read that — h:mm:ss, m:ss or digits (3412 = 34:12)';
    if (t === e.result.mark) return null;
    // SD-112: an out-of-range time is never rejected — it asks first (range by distance and age)
    let rangeOk: true | undefined;
    const range = roadRange(def.key, age);
    if (range && (t < range.min || t > range.max)) {
      const issue = rangeCheck(def, t) ?? { message: `${formatMark(t, def)} is outside the usual ${formatMark(range.min, def)} – ${formatMark(range.max, def)} for this distance and age group.` };
      const ok = await askConfirm({ title: 'Check this time', message: issue.message.replace(/the usual range is .*$/, `the usual range for ${age ?? 'this age group'} is ${formatMark(range.min, def)} – ${formatMark(range.max, def)}. Check the digits before saving.`), yesLabel: `Yes, save ${formatMark(t, def)}`, noLabel: 'No, re-enter it', tone: 'caution' });
      if (!ok) return 'Not saved — re-enter the time.';
      rangeOk = true;
    }
    const clash = orderClash(entries, e.id, t);
    if (clash) {
      const ok = await askConfirm({ title: 'Time out of order?', message: `${clash} The finish order decides the places — save this time anyway?`, yesLabel: `Yes, save ${formatMark(t, def)}`, noLabel: 'No, re-enter it', tone: 'caution' });
      if (!ok) return 'Not saved — re-enter the time.';
    }
    onSave(e.id, { ...e.result, mark: t, rangeOk }, `${formatMark(t, def)} · ${first(e.name)}`);
    return null;
  };

  const modes: Mode[] = ['line', ...(walk ? ['card' as const] : []), 'DNF', 'DQ', 'DNS'];
  const chipLabel = (e: ResultEntry) => `${e.result.bib ? `${e.result.bib} ` : ''}${e.name}${e.result.rc ? ` 🟥${e.result.rc}` : ''}`;
  return (
    <Card style={st.card}>
      <View style={st.headRow}>
        <Text style={[textStyles.h3, { flex: 1 }]}>{ev?.kind === 'xc' ? '🌳' : walk ? '🚶' : '🏃'} Finish order</Text>
        <Text style={textStyles.muted}>{placed.length}/{placed.length + pool.length}{timed ? ` · ${timed} timed` : ''}</Text>
      </View>
      <Text style={textStyles.muted}>Tap runners as they cross the line — or type the bib and press Enter. Times are optional: type the {road?.timing === 'chip' ? 'chip' : 'gun'} time for a runner whenever you have it (at gaps, or for everyone).</Text>
      {editable && (
        <View style={st.wrap}>
          {modes.map((m) => <SelectChip key={m} label={m === 'line' ? 'On the line' : m === 'card' ? '🟥 Red card' : m} active={mode === m} onPress={() => setMode(m)} />)}
        </View>
      )}
      {mode === 'card' ? <Text style={st.hint}>Tap a walker for each red card the Chief Judge receives (from different judges). {dqCards(road?.penaltyZone)} = disqualified.</Text>
        : mode !== 'line' ? <Text style={st.hint}>Tap a runner: {mode} — {STATUS_HELP[mode] ?? ''}. Tap one under “Not classified” to clear it.</Text> : null}
      {editable && (
        <View style={{ gap: 2 }}>
          <TextInput ref={bibRef} style={[st.input, !!bibErr && st.inputBad]} value={bib} onChangeText={(x) => { setBib(x); setBibErr(null); }} onSubmitEditing={submitBib} blurOnSubmit={false}
            placeholder={mode === 'line' ? 'Bib → Enter (next across the line)' : `Bib → Enter (${mode === 'card' ? 'red card' : mode})`} placeholderTextColor={theme.colors.textMuted}
            keyboardType="numbers-and-punctuation" returnKeyType="next" accessibilityLabel="Bib number" />
          {bibErr ? <Text style={st.bad}>{bibErr}</Text> : null}
        </View>
      )}
      {pool.length > 0 && (
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={st.head}>STILL ON THE COURSE</Text>
          <View style={st.wrap}>
            {pool.map((e) => <SelectChip key={e.id} label={chipLabel(e)} dotColor={e.team?.colorHex} active={false} disabled={!editable} onPress={() => tap(e)} />)}
          </View>
        </View>
      )}
      {placed.length > 0 && (
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={st.head}>FINISHED</Text>
          {placed.map((e, i) => (
            <View key={e.id} style={st.lineRow}>
              <View style={st.row}>
                <Text style={st.pos}>{e.result.fin}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.name} numberOfLines={1}>{e.result.bib ? <Text style={st.sub}>{e.result.bib}  </Text> : null}{e.name}{e.result.rc ? ` 🟥${e.result.rc}` : ''}</Text>
                  {e.team?.name ? <Text style={st.sub} numberOfLines={1}>{e.team.name}</Text> : null}
                </View>
                {!editable && e.result.mark != null ? <Text style={st.time}>{formatMark(e.result.mark, def)}</Text> : null}
                {editable && mode === 'card' ? <SmallBtn label="🟥+" a11y={`Red card for ${e.name}`} onPress={() => void addCard(e)} /> : null}
                {editable && i > 0 ? <SmallBtn label="↑" a11y={`Move ${e.name} up one place`} onPress={() => up(e)} /> : null}
                {editable ? <SmallBtn label="✕" a11y={`Take ${e.name} off the finish order`} onPress={() => void remove(e)} /> : null}
              </View>
              {editable ? (
                <TimeBox key={`${e.id}:${e.result.mark ?? ''}`} value={e.result.mark != null ? formatMark(e.result.mark, def) : ''} placeholder={i === 0 ? 'Winner’s time (optional) e.g. 3412' : 'time (optional)'}
                  label={`Time for ${e.name}`} onCommit={(x) => saveTime(e, x)} />
              ) : null}
            </View>
          ))}
        </View>
      )}
      {walk && carded.length > 0 && (
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={st.head}>RED CARDS</Text>
          {carded.map((e) => (
            <View key={e.id} style={st.row}>
              <Text style={[st.name, { flex: 1 }]} numberOfLines={1}>{e.name} — {walkCards(e.result, road, ev?.metres).text}</Text>
              {editable ? <SmallBtn label="−🟥" a11y={`Remove a red card from ${e.name}`} onPress={() => removeCard(e)} /> : null}
            </View>
          ))}
        </View>
      )}
      {out.length > 0 && (
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={st.head}>NOT CLASSIFIED</Text>
          <View style={st.wrap}>
            {out.map((e) => <SelectChip key={e.id} label={`${statusOf(e)} · ${e.result.bib ? `${e.result.bib} ` : ''}${e.name}`} active={false} disabled={!editable} onPress={() => clearStatus(e)} />)}
          </View>
        </View>
      )}
    </Card>
  );
}

/** The team score by placings — on the entry screen and the results sheet. */
export function TeamTable({ rows, scorers, basis, size }: { rows: TeamResult[]; scorers: number; basis: 'teams' | 'overall' | 'scorers'; size?: number }) {
  if (!rows.length) return null;
  const broken = tieBrokenByLast(rows);
  const anyPlaced = rows.some((r) => r.runners.length > 0);
  return (
    <Card style={st.card}>
      <Text style={textStyles.h3}>🏆 Team score</Text>
      <Text style={st.hint}>{describeTeamScoring({ scorers, basis, size })}</Text>
      {!anyPlaced ? <Text style={textStyles.muted}>No finishers yet.</Text> : rows.map((t) => (
        <View key={t.key} style={st.lineRow} accessibilityLabel={`${t.complete ? `Place ${t.label}` : 'Incomplete'}, ${t.name}, ${t.complete ? `${t.total} points` : `${t.runners.length} finished`}`}>
          <View style={st.row}>
            <Text style={[st.pos, t.position === 1 && { color: theme.colors.accent }]}>{t.complete ? t.label : '–'}</Text>
            <View style={[st.dot, { backgroundColor: t.colorHex ?? theme.colors.border }]} />
            <Text style={[st.name, { flex: 1 }]} numberOfLines={1}>{t.name}</Text>
            <Text style={st.total}>{t.complete ? t.total : 'inc'}</Text>
          </View>
          <Text style={st.sub}>{teamLine(t)}</Text>
          {broken.has(t.key) ? <Text style={st.hint}>Level on {t.total} — separated by the last scorer ({t.last}{t.last === 1 ? 'st' : t.last === 2 ? 'nd' : t.last === 3 ? 'rd' : 'th'}); the team whose last scorer finished higher wins.</Text> : null}
          {!t.complete ? <Text style={st.hint}>Fewer than {scorers} finishers — not ranked; its runners keep their individual places.</Text> : null}
        </View>
      ))}
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

/** A time box that saves on blur / Enter; `onCommit` resolves an error to show, or null. */
function TimeBox({ value, placeholder, label, onCommit }: { value: string; placeholder: string; label: string; onCommit: (text: string) => Promise<string | null> }) {
  const [t, setT] = useState(value);
  const [err, setErr] = useState<string | null>(null);
  const busy = useRef(false);
  // a time the official already declined (or that can't be read) isn't asked about again on blur
  const tried = useRef<string | null>(null);
  const commit = async () => {
    if (t === value || busy.current || t === tried.current) return;
    busy.current = true;
    try { const e = await onCommit(t); setErr(e); tried.current = e ? t : null; } finally { busy.current = false; }
  };
  return (
    <View style={{ gap: 2 }}>
      <TextInput style={[st.input, !!err && st.inputBad]} value={t} onChangeText={(x) => { setT(x); setErr(null); tried.current = null; }} placeholder={placeholder} placeholderTextColor={theme.colors.textMuted}
        keyboardType="numbers-and-punctuation" accessibilityLabel={label} onBlur={() => void commit()} onSubmitEditing={() => void commit()} />
      {err ? <Text style={st.bad}>{err}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  card: { gap: theme.spacing(2), padding: theme.spacing(3) },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), alignItems: 'center' },
  head: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  lineRow: { gap: theme.spacing(1), paddingVertical: theme.spacing(1.5), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  pos: { width: 28, color: theme.colors.text, fontWeight: '900', fontSize: theme.font.small, fontVariant: ['tabular-nums'] },
  name: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  sub: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  time: { color: theme.colors.text, fontWeight: '800', fontVariant: ['tabular-nums'], fontSize: theme.font.small },
  total: { color: theme.colors.primary, fontWeight: '900', fontVariant: ['tabular-nums'], fontSize: theme.font.body, minWidth: 36, textAlign: 'right' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  small: { minWidth: 44, minHeight: 44, paddingHorizontal: theme.spacing(2), borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceAlt },
  smallTxt: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.small },
  input: {
    backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(2), color: theme.colors.text, fontSize: theme.font.body,
  },
  inputBad: { borderColor: theme.colors.danger },
  bad: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  hint: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
});
