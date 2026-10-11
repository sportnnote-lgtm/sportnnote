/** SD-137b — the official's controls for team events on the results screen:
 *   - TeamScoresCard (archery team / mixed team ranking, shooting teams of 3):
 *     each team's members with their score in the individual event, taken in
 *     one tap from those events ("↻ Take the members' scores") or typed for a
 *     member who shot elsewhere; the team's total (and 10s / X / inner tens)
 *     follows and ranks as usual.
 *   - ShootMatchCard (ISSF mixed team): the gold (1 v 2) and bronze (3 v 4)
 *     medal matches — one shot per athlete a series, 2 points for the higher
 *     series, 1 each for a tie, first to 16; a 16–16 shoot-off; walkovers.
 *  Pure rules live in data/results/teamEvents.ts and shootMatch.ts. */
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, Card, SelectChip, textStyles } from '../ui';
import { askConfirm } from '../ConfirmSheet';
import { memberScoresFrom } from '../../data/resultsStore';
import {
  fillFromIndividuals, setMemberScore, shootEventOf, scoreText, shotError,
  shootMatchState, shootMatchText, setShootSeries, setShootSo, setShootWalkover, SHOOT_MATCH_WIN,
  type EntryResult, type ResultEntry, type ShotScoring,
} from '../../data/results';

type Save = (entryId: string, next: EntryResult, undoLabel?: string) => void;
const first = (name: string) => name.split(' ')[0];
const num = (t: string): number | undefined => { const v = Number(t.trim().replace(',', '.')); return t.trim() && Number.isFinite(v) ? v : undefined; };

/* ------------------------------ team ranking ------------------------------ */

export function TeamScoresCard({ entries, discipline, sport, eventKeys, editable, onSave }: {
  entries: ResultEntry[]; discipline: string; sport: 'archery' | 'shooting'; eventKeys?: string[]; editable: boolean; onSave: Save;
}) {
  const shoot = sport === 'shooting' ? shootEventOf(discipline) : undefined;
  const scoring: ShotScoring = shoot?.scoring ?? 'integer';
  const fmt = (v?: number) => (v == null ? '—' : shoot ? scoreText(v, scoring) : String(v));
  const rows = useMemo(() => entries.filter((e) => !e.athleteId).sort((a, b) => (a.result.order ?? 99) - (b.result.order ?? 99)), [entries]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: string; i: number } | null>(null);
  const [score, setScore] = useState('');
  const [tens, setTens] = useState('');
  const [xs, setXs] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const take = async () => {
    if (!eventKeys?.length) return;
    setBusy(true); setNote(null);
    try {
      const lookup = await memberScoresFrom(eventKeys);
      let changed = 0;
      const missing: string[] = [];
      for (const e of rows) {
        const f = fillFromIndividuals(e.result, lookup, discipline);
        missing.push(...f.missing);
        if (JSON.stringify(f.result.ms) !== JSON.stringify(e.result.ms)) { onSave(e.id, f.result); changed += 1; }
      }
      setNote(`${changed ? `${changed} team${changed === 1 ? '' : 's'} updated` : 'Nothing new'}${missing.length ? ` · no score yet for ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ' …' : ''} — type it, or enter it in the individual event first` : ''}.`);
    } catch (e) { setNote((e as Error).message); } finally { setBusy(false); }
  };
  const open = (id: string, i: number) => {
    const ms = rows.find((e) => e.id === id)?.result.ms?.[i];
    setEdit({ id, i }); setErr(null);
    setScore(ms?.mark != null ? String(ms.mark) : ''); setTens(ms?.tens != null ? String(ms.tens) : ''); setXs(ms?.xs != null ? String(ms.xs) : '');
  };
  const saveTyped = () => {
    if (!edit) return;
    const e = rows.find((x) => x.id === edit.id);
    if (!e) return;
    if (!score.trim()) { onSave(e.id, setMemberScore(e.result, edit.i, null, discipline)); setEdit(null); return; }
    const m = num(score);
    if (m == null || m < 0) { setErr('Type the score (a number).'); return; }
    if (shoot && scoring === 'decimal' && Math.abs(m * 10 - Math.round(m * 10)) > 1e-6) { setErr('Decimal scoring: one decimal (628.4).'); return; }
    if ((!shoot || scoring !== 'decimal') && !Number.isInteger(m)) { setErr('Whole points only.'); return; }
    const t = num(tens), x = num(xs);
    if ((t != null && (!Number.isInteger(t) || t < 0)) || (x != null && (!Number.isInteger(x) || x < 0))) { setErr('10s and X are whole numbers.'); return; }
    if (t != null && x != null && x > t) { setErr('X are 10s too — X can’t be more than the 10s.'); return; }
    const who = e.result.members?.[edit.i]?.name ?? 'member';
    onSave(e.id, setMemberScore(e.result, edit.i, { mark: m, ...(t != null ? { tens: t } : {}), ...(x != null ? { xs: x } : {}) }, discipline), `${first(who)} ${fmt(m)} · ${e.name}`);
    setEdit(null);
  };

  const done = rows.filter((e) => e.result.mark != null).length;
  return (
    <Card style={st.card}>
      <View style={st.headRow}>
        <Text style={[textStyles.h3, { flex: 1 }]}>{sport === 'archery' ? '🏹' : '🎯'} Team scores</Text>
        <Text style={textStyles.muted}>{done}/{rows.length}</Text>
      </View>
      <Text style={textStyles.muted}>
        Each team’s score is its members’ {sport === 'archery' ? 'ranking-round scores (10s and X added for ties)' : `match scores${scoring === 'integer' ? ' (inner tens added for ties)' : ''}`} added together. Take them from the individual event, or type a member’s score.
      </Text>
      {editable && eventKeys?.length ? (
        <Button label={busy ? 'Taking scores…' : `↻ Take the members’ scores from the individual event${eventKeys.length > 1 ? 's' : ''}`} variant="ghost" onPress={() => void take()} disabled={busy} />
      ) : null}
      {note ? <Text style={st.note}>{note}</Text> : null}
      {rows.map((e) => (
        <View key={e.id} style={st.team}>
          <View style={st.headRow}>
            <Text style={[st.name, { flex: 1 }]} numberOfLines={1}>{e.name}</Text>
            <Text style={st.total}>{e.result.mark != null ? fmt(e.result.mark) : '—'}</Text>
          </View>
          {(e.result.members ?? []).map((m, i) => {
            const ms = e.result.ms?.[i];
            const on = edit?.id === e.id && edit.i === i;
            return (
              <View key={i}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${m.name}: ${ms?.mark != null ? fmt(ms.mark) : 'no score'}${editable ? ', tap to type' : ''}`} disabled={!editable} onPress={() => (on ? setEdit(null) : open(e.id, i))} style={[st.member, on && st.memberOn]}>
                  <Text style={st.memberName} numberOfLines={1}>{m.name}</Text>
                  <Text style={st.sub}>{ms?.mark != null ? `${fmt(ms.mark)}${sport === 'archery' && ms.tens != null ? ` · 10s ${ms.tens} · X ${ms.xs ?? 0}` : scoring === 'integer' && ms.xs != null ? ` · ${ms.xs}x` : ''}${ms.typed ? ' ✎' : ''}` : 'no score'}</Text>
                </TouchableOpacity>
                {on && editable ? (
                  <View style={st.editor}>
                    <View style={st.wrap}>
                      <TextInput style={[st.input, { width: 96 }]} value={score} onChangeText={setScore} placeholder="Score" placeholderTextColor={theme.colors.textMuted} keyboardType="decimal-pad" accessibilityLabel={`${m.name}'s score`} />
                      {sport === 'archery' ? <TextInput style={[st.input, { width: 64 }]} value={tens} onChangeText={setTens} placeholder="10s" placeholderTextColor={theme.colors.textMuted} keyboardType="number-pad" accessibilityLabel="10s" /> : null}
                      {sport === 'archery' || scoring === 'integer' ? <TextInput style={[st.input, { width: 64 }]} value={xs} onChangeText={setXs} placeholder={sport === 'archery' ? 'X' : 'Inner 10s'} placeholderTextColor={theme.colors.textMuted} keyboardType="number-pad" accessibilityLabel={sport === 'archery' ? 'X count' : 'Inner tens'} /> : null}
                      <SelectChip label="Save" active={false} onPress={saveTyped} />
                    </View>
                    <Text style={st.sub}>Leave the score empty and Save to clear it.</Text>
                    {err ? <Text style={st.bad}>{err}</Text> : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
      {!rows.length && <Text style={textStyles.muted}>No teams in this event.</Text>}
    </Card>
  );
}

/* --------------------------- mixed team matches --------------------------- */

export function ShootMatchCard({ entries, discipline, editable, onSave }: { entries: ResultEntry[]; discipline: string; editable: boolean; onSave: Save }) {
  const scoring: ShotScoring = shootEventOf(discipline)?.scoring ?? 'decimal';
  const state = useMemo(() => shootMatchState(entries), [entries]);
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const [selKey, setSelKey] = useState<string | null>(null);
  const sel = state.matches.find((m) => m.key === selKey) ?? state.current ?? state.matches.find((m) => m.a && m.b);
  const ea = sel?.a ? byId.get(sel.a) : undefined, eb = sel?.b ? byId.get(sel.b) : undefined;
  const A = sel && ea?.result.mp?.[sel.key], B = sel && eb?.result.mp?.[sel.key];
  const out = sel?.out;
  const [ta, setTa] = useState('');
  const [tb, setTb] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const shoot = !!out?.soNeed;

  const parse = (t: string, who: string): number[] | string => {
    const parts = t.trim().split(/[\s,;]+/).filter(Boolean);
    if (parts.length !== 2) return `${who}: two shots — one per athlete (e.g. 10.4 10.2).`;
    const vals = parts.map((p) => num(p));
    if (vals.some((v) => v == null)) return `${who}: can't read "${t}".`;
    for (const v of vals as number[]) { const bad = shotError(v, scoring); if (bad) return `${who}: ${bad}`; }
    return vals as number[];
  };
  const save = () => {
    if (!sel || !ea || !eb || !out) return;
    const a = parse(ta, first(ea.name)), b = parse(tb, first(eb.name));
    if (typeof a === 'string') { setErr(a); return; }
    if (typeof b === 'string') { setErr(b); return; }
    setErr(null);
    if (shoot) {
      const j = (out.soNeed ?? 1) - 1;
      onSave(ea.id, setShootSo(ea.result, sel.key, j, a));
      onSave(eb.id, setShootSo(eb.result, sel.key, j, b));
    } else {
      const i = out.series.length;
      onSave(ea.id, setShootSeries(ea.result, sel.key, i, a), `${sel.key === 'G' ? 'Gold' : 'Bronze'} S${i + 1} · ${first(ea.name)}`);
      onSave(eb.id, setShootSeries(eb.result, sel.key, i, b));
    }
    setTa(''); setTb('');
  };
  const removeLast = async () => {
    if (!sel || !ea || !eb || !out?.series.length) return;
    const k = out.series.length - 1;
    const ok = await askConfirm({ title: `Remove series ${k + 1}?`, message: 'Both teams’ shots for that series are taken off (and any shoot-off).', yesLabel: 'Yes, remove', noLabel: 'No, keep it', tone: 'danger' });
    if (!ok) return;
    onSave(ea.id, setShootSeries(ea.result, sel.key, k, null));
    onSave(eb.id, setShootSeries(eb.result, sel.key, k, null));
  };
  const walkover = async (absent: 'a' | 'b') => {
    if (!sel || !ea || !eb) return;
    const e = absent === 'a' ? ea : eb, other = absent === 'a' ? eb : ea;
    const ok = await askConfirm({ title: `${e.name} doesn't shoot this match?`, message: `${other.name} wins the ${sel.label.toLowerCase()} (walkover).`, yesLabel: 'Yes, walkover', noLabel: 'No', tone: 'caution' });
    if (ok) onSave(e.id, setShootWalkover(e.result, sel.key, true));
  };

  return (
    <Card style={st.card}>
      <View style={st.headRow}>
        <Text style={[textStyles.h3, { flex: 1 }]}>🎯 Medal matches</Text>
        <Text style={textStyles.muted}>{state.done ? 'complete' : `first to ${SHOOT_MATCH_WIN}`}</Text>
      </View>
      <Text style={textStyles.muted}>One shot per athlete a series; the higher team total takes 2 points, a tie 1 each; the first team to {SHOOT_MATCH_WIN} wins. 16–16: a shoot-off, one shot each.</Text>
      {state.matches.map((m) => {
        const a = m.a ? byId.get(m.a) : undefined, b = m.b ? byId.get(m.b) : undefined;
        const on = sel?.key === m.key;
        const text = m.out ? shootMatchText(m.out, a?.result.mp?.[m.key], b?.result.mp?.[m.key]) : m.winner ? 'no match' : '';
        return (
          <TouchableOpacity key={m.key} accessibilityRole="button" accessibilityLabel={`${m.label}: ${a?.name ?? 'to come'} against ${b?.name ?? 'nobody'}`} disabled={!a || !b} onPress={() => setSelKey(m.key)} style={[st.match, on && st.memberOn]}>
            <Text style={st.head}>{m.label.toUpperCase()}</Text>
            <View style={st.headRow}>
              <Text style={[st.mName, m.winner && m.winner === m.a && st.win]} numberOfLines={1}>{a ? `${a.result.seed}. ${a.name}` : '—'}</Text>
              <Text style={st.mScore}>{text || 'v'}</Text>
              <Text style={[st.mName, { textAlign: 'right' }, m.winner && m.winner === m.b && st.win]} numberOfLines={1}>{b ? `${b.name} .${b.result.seed}` : '—'}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
      {sel && ea && eb && out ? (
        <View style={st.editor}>
          <Text style={st.tag}>{sel.label.toUpperCase()}</Text>
          <Text style={st.name}>{ea.name} {out.walkover ? 'v' : `${out.a}–${out.b}`} {eb.name}</Text>
          {out.series.map((x, k) => (
            <View key={k} style={st.headRow}>
              <Text style={st.sub}>S{k + 1}</Text>
              <Text style={[st.sub, { flex: 1 }]}>{(A?.ends?.[k] ?? []).map((v) => scoreText(Number(v), scoring)).join(' + ')} = {scoreText(x.a, scoring)}</Text>
              <Text style={st.pts}>{x.pa}–{x.pb}</Text>
              <Text style={[st.sub, { flex: 1, textAlign: 'right' }]}>{scoreText(x.b, scoring)} = {(B?.ends?.[k] ?? []).map((v) => scoreText(Number(v), scoring)).join(' + ')}</Text>
            </View>
          ))}
          <Text style={textStyles.muted}>{out.done ? `${byId.get(sel.winner ?? '')?.name ?? ''} wins${out.walkover ? ' (walkover)' : out.soWon ? ' in the shoot-off' : ''}.` : shoot ? `${out.a}–${out.b}: shoot-off${(out.soNeed ?? 1) > 1 ? ` round ${out.soNeed}` : ''} — one shot per athlete, the higher team total wins.` : `Series ${out.series.length + 1}`}</Text>
          {editable && !out.done && (
            <>
              <View style={st.headRow}>
                <Text style={[st.memberName, { width: 84 }]} numberOfLines={1}>{first(ea.name)}</Text>
                <TextInput style={[st.input, { flex: 1 }]} value={ta} onChangeText={setTa} placeholder={scoring === 'decimal' ? '10.4 10.2' : '10 9'} placeholderTextColor={theme.colors.textMuted} keyboardType="numbers-and-punctuation" accessibilityLabel={`${ea.name}: both shots`} />
              </View>
              <View style={st.headRow}>
                <Text style={[st.memberName, { width: 84 }]} numberOfLines={1}>{first(eb.name)}</Text>
                <TextInput style={[st.input, { flex: 1 }]} value={tb} onChangeText={setTb} placeholder={scoring === 'decimal' ? '10.1 10.6' : '10 10'} placeholderTextColor={theme.colors.textMuted} keyboardType="numbers-and-punctuation" accessibilityLabel={`${eb.name}: both shots`} onSubmitEditing={save} />
              </View>
              <Button label={shoot ? 'Save shoot-off shots' : `Save series ${out.series.length + 1}`} onPress={save} />
            </>
          )}
          {err ? <Text style={st.bad}>{err}</Text> : null}
          {editable && (
            <View style={st.wrap}>
              {out.series.length ? <SelectChip label="Remove the last series" active={false} onPress={() => void removeLast()} /> : null}
              {!out.series.length && !out.walkover ? (
                <>
                  <SelectChip label={`${first(ea.name)} absent (w/o)`} active={false} onPress={() => void walkover('a')} />
                  <SelectChip label={`${first(eb.name)} absent (w/o)`} active={false} onPress={() => void walkover('b')} />
                </>
              ) : null}
              {out.walkover ? <SelectChip label="Undo the walkover" active={false} onPress={() => { onSave(ea.id, setShootWalkover(ea.result, sel.key, false)); onSave(eb.id, setShootWalkover(eb.result, sel.key, false)); }} /> : null}
            </View>
          )}
        </View>
      ) : null}
    </Card>
  );
}

const st = StyleSheet.create({
  card: { gap: theme.spacing(2), padding: theme.spacing(3) },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), alignItems: 'center' },
  team: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, padding: theme.spacing(2), gap: theme.spacing(1) },
  name: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  total: { color: theme.colors.primary, fontWeight: '900', fontVariant: ['tabular-nums'], fontSize: theme.font.body },
  member: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(1), borderRadius: theme.radius.sm, borderWidth: 1, borderColor: 'transparent' },
  memberOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.surfaceAlt },
  memberName: { flex: 1, minWidth: 0, color: theme.colors.text, fontSize: theme.font.small },
  sub: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontVariant: ['tabular-nums'] },
  note: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  editor: { gap: theme.spacing(2), padding: theme.spacing(2), borderRadius: theme.radius.sm, borderWidth: 2, borderColor: theme.colors.primary },
  input: {
    backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(1.5), color: theme.colors.text, fontSize: theme.font.body,
  },
  bad: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  match: { gap: theme.spacing(1), paddingVertical: theme.spacing(1.5), paddingHorizontal: theme.spacing(1.5), borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.border },
  head: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5 },
  mName: { flex: 1, minWidth: 0, color: theme.colors.text, fontSize: theme.font.small },
  win: { fontWeight: '900', color: theme.colors.primary },
  mScore: { color: theme.colors.text, fontWeight: '800', fontVariant: ['tabular-nums'], fontSize: theme.font.small, textAlign: 'center', minWidth: 56 },
  tag: { color: theme.colors.primary, fontWeight: '900', fontSize: theme.font.small, letterSpacing: 0.5 },
  pts: { color: theme.colors.primary, fontWeight: '900', fontSize: theme.font.small, minWidth: 30, textAlign: 'center' },
});
