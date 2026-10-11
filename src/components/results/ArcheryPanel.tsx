/** SD-95 — the archery official's controls on the results screen:
 *   - EndCard (ranking round): one end at a time for every archer, in target
 *     order — tap the arrows on the keypad (X 10 … 1 M) or type them
 *     ("X 10 9 9 8 7", "= 53" checks the scorecard total); a full end saves on
 *     its own (Undo for 5 s) and the next archer comes up; E1 … E12 to correct.
 *   - BracketCard (match play): the seeded bracket by round (bronze before
 *     gold); the match being shot with its ends, set points / totals, the
 *     one-arrow shoot-off and "closest to the centre", walkovers; a correction
 *     that changes who went through asks first and clears the later scores
 *     that no longer belong.
 *  Pure rules live in data/results/archery.ts and archeryBracket.ts. */
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, Card, SelectChip, textStyles } from '../ui';
import { askConfirm } from '../ConfirmSheet';
import {
  endsOf, endSum, endText, parseEnd, archRowText, setEnd, sortEnd,
  bracketState, staleMatchData, outcomeText, roundShort, setMatchEnd, setMatchSo, setCloser, setWalkover, clearMatches,
  MATCH_ARROWS, MATCH_ENDS, arrowValue,
  type Arrow, type ArchRoundDef, type ArchMatchFormat, type BMatch, type EntryResult, type ResultEntry,
} from '../../data/results';

type Save = (entryId: string, next: EntryResult, undoLabel?: string) => void;
const first = (name: string) => name.split(' ')[0];
const inPlay = (e: ResultEntry) => !['DNS', 'WD', 'DQ'].includes(e.result.status ?? 'ok');
const KEYS: Arrow[][] = [['X', 10, 9, 8, 7, 6], [5, 4, 3, 2, 1, 'M']];

/* --------------------------------- keypad --------------------------------- */

function Keypad({ onKey, onBack, disabled }: { onKey: (a: Arrow) => void; onBack: () => void; disabled?: boolean }) {
  return (
    <View style={{ gap: theme.spacing(1.5) }}>
      {KEYS.map((row, i) => (
        <View key={i} style={st.keyRow}>
          {row.map((a) => (
            <TouchableOpacity key={String(a)} accessibilityRole="button" accessibilityLabel={a === 'M' ? 'Miss' : a === 'X' ? 'X, inner ten' : String(a)} disabled={disabled}
              onPress={() => onKey(a)} style={[st.key, a === 'X' || a === 10 ? st.keyGold : a === 'M' ? st.keyMiss : null, disabled && { opacity: 0.4 }]}>
              <Text style={st.keyTxt}>{String(a)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Delete the last arrow" disabled={disabled} onPress={onBack} style={[st.key, st.keyBack, disabled && { opacity: 0.4 }]}>
        <Text style={st.keyTxt}>⌫ Delete last arrow</Text>
      </TouchableOpacity>
    </View>
  );
}

/** The arrow boxes of an end being entered. */
function ArrowBoxes({ arrows, n, active }: { arrows: Arrow[]; n: number; active?: boolean }) {
  return (
    <View style={st.boxes}>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={[st.box, active && i === arrows.length && st.boxNext]}>
          <Text style={st.boxTxt}>{arrows[i] != null ? String(arrows[i]) : ''}</Text>
        </View>
      ))}
      <Text style={st.boxSum}>{arrows.length ? `= ${endSum(arrows)}` : ''}</Text>
    </View>
  );
}

/* ------------------------------ ranking round ------------------------------ */

export function EndCard({ entries, round, editable, onSave }: { entries: ResultEntry[]; round: ArchRoundDef; editable: boolean; onSave: Save }) {
  const n = endsOf(round);
  const rows = useMemo(() => entries.filter(inPlay).sort((a, b) => (a.result.order ?? 99) - (b.result.order ?? 99)), [entries]);
  const shot = (e: ResultEntry, i: number) => !!e.result.ends?.[i]?.length;
  const doneIn = (i: number) => rows.filter((e) => shot(e, i)).length;
  const firstOpen = Array.from({ length: n }, (_, i) => i).find((i) => doneIn(i) < rows.length) ?? n - 1;
  const [sel, setSel] = useState<number | null>(null);
  const cur = sel != null && sel < n ? sel : firstOpen;
  const [who, setWho] = useState<string | null>(null);
  // the archer up: the chosen one, else the first in target order without this end
  const upId = who && rows.some((e) => e.id === who) ? who : rows.find((e) => !shot(e, cur) && (e.result.ends?.length ?? 0) >= cur)?.id ?? null;
  const up = rows.find((e) => e.id === upId);
  const [buf, setBuf] = useState<Arrow[]>([]);
  const [typed, setTyped] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const all = rows.length > 0 && Array.from({ length: n }, (_, i) => doneIn(i)).every((d) => d === rows.length);
  const blocked = !!up && (up.result.ends?.length ?? 0) < cur;

  const pick = (id: string) => { setWho(id); setBuf([]); setTyped(''); setErr(null); };
  const commit = (arrows: Arrow[]) => {
    if (!up || !editable) return;
    if (blocked) { setErr(`${first(up.name)} has no end ${(up.result.ends?.length ?? 0) + 1} yet — enter that first.`); return; }
    const had = up.result.ends?.[cur];
    onSave(up.id, setEnd(up.result, cur, arrows), `E${cur + 1} ${endText(sortEnd(arrows))} (${endSum(arrows)}) · ${first(up.name)}${had?.length ? ` (was ${endSum(had)})` : ''}`);
    setBuf([]); setTyped(''); setErr(null);
    // next: the next archer in target order still without this end
    const i = rows.findIndex((e) => e.id === up.id);
    const nx = [...rows.slice(i + 1), ...rows.slice(0, i)].find((e) => !shot(e, cur) && (e.result.ends?.length ?? 0) >= cur);
    setWho(nx?.id ?? null);
  };
  const key = (a: Arrow) => {
    if (!up) return;
    const next = [...buf, a];
    if (next.length > round.perEnd) return;
    setErr(null);
    if (next.length === round.perEnd) commit(next);
    else setBuf(next);
  };
  const submitTyped = () => {
    if (!typed.trim()) return;
    const p = parseEnd(typed, round.perEnd);
    if ('error' in p) { setErr(p.error); return; }
    commit(p.arrows);
  };
  const clearLast = async () => {
    if (!up) return;
    const k = (up.result.ends ?? []).length - 1;
    if (k < 0) return;
    const ok = await askConfirm({ title: `Remove end ${k + 1}?`, message: `${up.name}'s end ${k + 1} (${endText(up.result.ends![k])} = ${endSum(up.result.ends![k])}) is taken off.`, yesLabel: 'Yes, remove', noLabel: 'No, keep it', tone: 'danger' });
    if (ok) onSave(up.id, setEnd(up.result, k, null), `E${k + 1} removed · ${first(up.name)}`);
  };

  return (
    <Card style={st.card}>
      <View style={st.headRow}>
        <Text style={[textStyles.h3, { flex: 1 }]}>🏹 {all ? 'All ends in' : `End ${cur + 1} of ${n}`}</Text>
        <Text style={textStyles.muted}>{doneIn(cur)}/{rows.length}</Text>
      </View>
      <View style={st.wrap}>
        {Array.from({ length: n }, (_, i) => (
          <SelectChip key={i} label={`E${i + 1}${doneIn(i) === rows.length && rows.length ? ' ✓' : ''}`} active={i === cur} onPress={() => { setSel(i); setWho(null); setBuf([]); setErr(null); }} />
        ))}
      </View>
      <Text style={textStyles.muted}>{round.perEnd} arrows an end · tap an archer to enter or correct their end{cur >= n / 2 && !round.indoor ? ' · 2nd half' : ''}</Text>
      {rows.map((e) => {
        const has = e.result.ends?.[cur];
        const on = e.id === upId;
        return (
          <TouchableOpacity key={e.id} accessibilityRole="button" accessibilityLabel={`${e.name}, end ${cur + 1}`} onPress={() => pick(e.id)} style={[st.row, on && st.rowOn]}>
            <Text style={st.lot}>{e.result.order ?? '–'}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.name} numberOfLines={1}>{e.name}</Text>
              <Text style={st.sub} numberOfLines={1}>{archRowText(e.result, round) || 'no ends yet'}</Text>
            </View>
            <Text style={has?.length ? st.doneTxt : st.sub}>{has?.length ? `${endText(has)} · ${endSum(has)}` : on ? '…' : '—'}</Text>
          </TouchableOpacity>
        );
      })}
      {!rows.length && <Text style={textStyles.muted}>No archers in play.</Text>}
      {editable && up && (
        <View style={st.editor}>
          <Text style={st.name}>{up.name} · end {cur + 1}{up.result.ends?.[cur]?.length ? ` (now ${endText(up.result.ends[cur])})` : ''}</Text>
          {blocked ? <Text style={st.bad}>End {(up.result.ends?.length ?? 0) + 1} first.</Text> : (
            <>
              <ArrowBoxes arrows={buf} n={round.perEnd} active />
              <Keypad onKey={key} onBack={() => setBuf(buf.slice(0, -1))} />
              <View style={st.headRow}>
                <TextInput style={[st.input, { flex: 1 }, !!err && st.inputBad]} value={typed} onChangeText={setTyped} placeholder={round.perEnd === 6 ? 'or type: X 10 9 9 8 7 = 53' : 'or type: X 10 9 = 29'}
                  placeholderTextColor={theme.colors.textMuted} autoCapitalize="characters" accessibilityLabel={`Type end ${cur + 1} of ${up.name}`} onSubmitEditing={submitTyped} />
                <SelectChip label="Save" active={false} onPress={submitTyped} />
              </View>
              <Text style={st.hint}>A full end saves by itself (Undo for 5 s). An end is {round.perEnd} arrows, at most {round.perEnd * 10}. “= total” checks the scorecard.</Text>
            </>
          )}
          {err ? <Text style={st.bad}>{err}</Text> : null}
          {(up.result.ends?.length ?? 0) > 0 && <SelectChip label={`Remove ${first(up.name)}'s last end`} active={false} onPress={() => void clearLast()} />}
        </View>
      )}
    </Card>
  );
}

/* -------------------------------- match play ------------------------------- */

export function BracketCard({ entries, round, fmt, editable, onSave }: { entries: ResultEntry[]; round: ArchRoundDef; fmt: ArchMatchFormat; editable: boolean; onSave: Save }) {
  const state = useMemo(() => bracketState(entries, fmt), [entries, fmt]);
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const nm = (id?: string) => (id ? byId.get(id)?.name ?? '' : '');
  const seed = (id?: string) => (id ? byId.get(id)?.result.seed : undefined);
  const [selKey, setSelKey] = useState<string | null>(null);
  const sel = state.matches.find((m) => `${m.key}:${m.slot}` === selKey) ?? state.current;
  const order = (m: BMatch) => (m.round === 'B' ? state.rounds - 0.5 : (m.round as number));
  const groups = useMemo(() => {
    const g = new Map<string, BMatch[]>();
    for (const m of [...state.matches].sort((a, b) => order(a) - order(b) || a.slot - b.slot)) {
      const k = m.label;
      g.set(k, [...(g.get(k) ?? []), m]);
    }
    return [...g];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <Card style={st.card}>
      <View style={st.headRow}>
        <Text style={[textStyles.h3, { flex: 1 }]}>🏹 Match play</Text>
        <Text style={textStyles.muted}>{state.done ? 'complete' : `bracket of ${state.size}`}</Text>
      </View>
      <Text style={textStyles.muted}>{fmt === 'sets' ? 'Set system: ends of 3 arrows, 2 set points for the higher end, 1 each for a tie, first to 6. 5–5: one-arrow shoot-off.' : 'Cumulative: 5 ends of 3 arrows, the higher total wins. Level: one-arrow shoot-off.'}</Text>
      {groups.map(([label, ms]) => (
        <View key={label} style={{ gap: theme.spacing(1) }}>
          <Text style={st.head}>{label.toUpperCase()}</Text>
          {ms.map((m) => {
            const A = byId.get(m.a ?? '')?.result.mp?.[m.key], B = byId.get(m.b ?? '')?.result.mp?.[m.key];
            const on = sel && sel.key === m.key && sel.slot === m.slot;
            const score = m.bye ? (m.winner ? 'bye' : '') : m.out && (m.out.ends.length || m.out.walkover) ? outcomeText(m.out, A, B) : '';
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
        <MatchScorer key={`${sel.key}:${sel.slot}:${sel.a}:${sel.b}`} m={sel} rounds={state.rounds} entries={entries} fmt={fmt} editable={editable} onSave={onSave} />
      ) : null}
    </Card>
  );
}

function MatchScorer({ m, rounds, entries, fmt, editable, onSave }: { m: BMatch; rounds: number; entries: ResultEntry[]; fmt: ArchMatchFormat; editable: boolean; onSave: Save }) {
  const ea = entries.find((e) => e.id === m.a)!, eb = entries.find((e) => e.id === m.b)!;
  const A = ea.result.mp?.[m.key], B = eb.result.mp?.[m.key];
  const out = m.out!;
  const nm = (id?: string) => entries.find((e) => e.id === id)?.name ?? '';
  const nextEnd = out.nextEnd != null ? out.nextEnd - 1 : null;
  const [edit, setEdit] = useState<number | null>(null);
  const idx = edit ?? nextEnd;
  const [bufA, setBufA] = useState<Arrow[]>(edit != null ? A?.ends?.[edit] ?? [] : []);
  const [bufB, setBufB] = useState<Arrow[]>(edit != null ? B?.ends?.[edit] ?? [] : []);
  const [side, setSide] = useState<'a' | 'b'>('a');
  const [again, setAgain] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // a shoot-off arrow each (round j)
  const soRound = out.soNeed ? out.soNeed.round - 1 + (again ? 1 : 0) : null;
  const soArrows = out.soNeed?.kind === 'arrows' || again;
  const per = soRound != null && soArrows && idx == null ? 1 : MATCH_ARROWS;

  const startEdit = (k: number) => {
    setEdit(k); setBufA(A?.ends?.[k] ?? []); setBufB(B?.ends?.[k] ?? []); setSide('a'); setErr(null);
  };
  const key = (a: Arrow) => {
    setErr(null);
    if (side === 'a') { if (bufA.length < per) { const n = [...bufA, a]; setBufA(n); if (n.length === per && bufB.length < per) setSide('b'); } }
    else if (bufB.length < per) { const n = [...bufB, a]; setBufB(n); if (n.length === per && bufA.length < per) setSide('a'); }
  };
  const back = () => (side === 'a' ? setBufA(bufA.slice(0, -1)) : setBufB(bufB.slice(0, -1)));

  /** Save new results for A and B; if that changes who went through, ask, and clear the later scores that no longer belong. */
  const apply = async (ra: EntryResult, rb: EntryResult, label: string) => {
    const after = entries.map((e) => (e.id === ea.id ? { ...e, result: ra } : e.id === eb.id ? { ...e, result: rb } : e));
    const stale = staleMatchData(after, fmt, entries);
    const before = bracketState(entries, fmt).matches.find((x) => x.key === m.key && x.slot === m.slot);
    const now = bracketState(after, fmt).matches.find((x) => x.key === m.key && x.slot === m.slot);
    const flipped = !!before?.winner && before.winner !== now?.winner;
    if (stale.length || flipped) {
      const lines = stale.map((s) => `${entries.find((e) => e.id === s.id)?.name}: ${s.keys.map((k) => (k === 'B' ? 'bronze medal match' : roundShort(Number(k), rounds))).join(', ')}`);
      const ok = await askConfirm({
        title: 'Change the result of this match?',
        message: `${flipped ? `${nm(before!.winner)} won this match; with this change ${now?.winner ? `${nm(now.winner)} wins` : 'it is undecided'}. ` : ''}${lines.length ? `Later scores that no longer fit the bracket are cleared — ${lines.join('; ')}.` : ''}`,
        yesLabel: 'Yes, change it', noLabel: 'No, keep it', tone: 'danger',
      });
      if (!ok) return false;
    }
    const next = new Map<string, EntryResult>([[ea.id, ra], [eb.id, rb]]);
    for (const s of stale) next.set(s.id, clearMatches(next.get(s.id) ?? entries.find((e) => e.id === s.id)!.result, s.keys));
    for (const [id, r] of next) onSave(id, r, id === ea.id ? label : undefined);
    return true;
  };

  const saveEnd = async () => {
    if (idx == null || busy) return;
    if (bufA.length !== MATCH_ARROWS || bufB.length !== MATCH_ARROWS) { setErr(`Both archers need ${MATCH_ARROWS} arrows.`); return; }
    setBusy(true);
    try {
      const ra = setMatchEnd(ea.result, m.key, idx, bufA), rb = setMatchEnd(eb.result, m.key, idx, bufB);
      const ok = await apply(ra, rb, `${roundShort(m.round, rounds)} E${idx + 1} ${endSum(bufA)}–${endSum(bufB)}`);
      if (ok) { setBufA([]); setBufB([]); setSide('a'); setEdit(null); }
    } finally { setBusy(false); }
  };
  const saveSo = async () => {
    if (soRound == null || busy) return;
    if (bufA.length !== 1 || bufB.length !== 1) { setErr('One shoot-off arrow each.'); return; }
    setBusy(true);
    try {
      const ok = await apply(setMatchSo(ea.result, m.key, soRound, bufA[0]), setMatchSo(eb.result, m.key, soRound, bufB[0]), `Shoot-off ${bufA[0]}–${bufB[0]}`);
      if (ok) { setBufA([]); setBufB([]); setSide('a'); setAgain(false); }
    } finally { setBusy(false); }
  };
  const closer = async (w: 'a' | 'b') => {
    const j = out.soNeed!.round - 1;
    await apply(setCloser(ea.result, m.key, j, w === 'a'), setCloser(eb.result, m.key, j, w === 'b'), `Closer: ${first(nm(w === 'a' ? ea.id : eb.id))}`);
  };
  const walkover = async (absent: 'a' | 'b') => {
    const e = absent === 'a' ? ea : eb;
    const ok = await askConfirm({ title: `${e.name} doesn't shoot this match?`, message: `${nm(absent === 'a' ? eb.id : ea.id)} goes through (walkover). ${e.name} keeps the earlier rounds and is placed with this round's losers.`, yesLabel: 'Yes, walkover', noLabel: 'No', tone: 'caution' });
    if (!ok) return;
    await apply(absent === 'a' ? setWalkover(ea.result, m.key, true) : ea.result, absent === 'b' ? setWalkover(eb.result, m.key, true) : eb.result, `Walkover · ${first(e.name)} out`);
  };
  const undoWalkover = () => void apply(setWalkover(ea.result, m.key, false), setWalkover(eb.result, m.key, false), 'Walkover removed');
  const clearLastEnd = async () => {
    const k = Math.max(A?.ends?.length ?? 0, B?.ends?.length ?? 0) - 1;
    if (k < 0) return;
    const ok = await askConfirm({ title: `Remove end ${k + 1} of this match?`, message: 'Both archers\' arrows for that end are taken off (and any shoot-off).', yesLabel: 'Yes, remove', noLabel: 'No, keep it', tone: 'danger' });
    if (ok) await apply(setMatchEnd(ea.result, m.key, k, null), setMatchEnd(eb.result, m.key, k, null), `End ${k + 1} removed`);
  };

  const ptsLabel = fmt === 'sets' ? 'sets' : 'total';
  const wo = !!A?.wo || !!B?.wo;
  return (
    <View style={st.editor}>
      <Text style={st.tag}>{m.label.toUpperCase()}</Text>
      <Text style={st.upName} accessibilityRole="header">
        {ea.result.seed}. {ea.name} {out.walkover ? 'v' : `${out.a}–${out.b}`} {eb.name} .{eb.result.seed}
      </Text>
      <Text style={textStyles.muted}>
        {out.done ? `${nm(m.winner)} wins${out.walkover ? ' (walkover)' : out.soWon ? ` in the shoot-off${out.soWon.closer ? ' (closest to the centre)' : ''}` : ''}.` : out.soNeed ? 'Level — one-arrow shoot-off.' : `End ${(out.nextEnd ?? 1)} of ${MATCH_ENDS} · ${ptsLabel}${fmt === 'cumulative' ? ` ${out.ta}–${out.tb}` : ''}`}
      </Text>
      {out.ends.map((x, k) => (
        <TouchableOpacity key={k} accessibilityRole="button" accessibilityLabel={`Correct end ${k + 1}`} disabled={!editable} onPress={() => startEdit(k)} style={[st.endRow, edit === k && st.rowOn]}>
          <Text style={st.endNo}>E{k + 1}</Text>
          <Text style={st.endArrows} numberOfLines={1}>{endText(A?.ends?.[k])} <Text style={st.endSum}>{x.a}</Text></Text>
          <Text style={st.endPts}>{fmt === 'sets' ? `${x.pa}–${x.pb}` : ''}</Text>
          <Text style={[st.endArrows, { textAlign: 'right' }]} numberOfLines={1}><Text style={st.endSum}>{x.b}</Text> {endText(B?.ends?.[k])}</Text>
        </TouchableOpacity>
      ))}
      {(A?.so?.length || B?.so?.length) ? <Text style={textStyles.muted}>Shoot-off: {outcomeText({ ...out, shootOff: true }, A, B).replace(/^.*\(SO /, '').replace(/\)$/, '')}{' '}(* = closer to the centre)</Text> : null}

      {editable && out.soNeed?.kind === 'closer' && !again && idx == null && (
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={st.name}>Both scored {arrowValue(A!.so![out.soNeed.round - 1])} — which arrow is closer to the centre?</Text>
          <View style={st.wrap}>
            <SelectChip label={first(ea.name)} active={false} onPress={() => void closer('a')} />
            <SelectChip label={first(eb.name)} active={false} onPress={() => void closer('b')} />
            <SelectChip label="Can't separate — shoot again" active={false} onPress={() => { setAgain(true); setBufA([]); setBufB([]); setSide('a'); }} />
          </View>
        </View>
      )}

      {editable && (idx != null || (soRound != null && soArrows)) && !wo && (
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={st.name}>{idx != null ? `${edit != null ? 'Correct' : ''} end ${idx + 1}`.trim() : `Shoot-off arrow${soRound! > 0 ? ` ${soRound! + 1}` : ''} — one each`}</Text>
          {(['a', 'b'] as const).map((s) => (
            <TouchableOpacity key={s} accessibilityRole="button" accessibilityLabel={`Enter for ${s === 'a' ? ea.name : eb.name}`} onPress={() => setSide(s)} style={[st.row, side === s && st.rowOn]}>
              <Text style={[st.name, { width: 92 }]} numberOfLines={1}>{first(s === 'a' ? ea.name : eb.name)}</Text>
              <ArrowBoxes arrows={s === 'a' ? bufA : bufB} n={per} active={side === s} />
            </TouchableOpacity>
          ))}
          <Keypad onKey={key} onBack={back} />
          {idx != null
            ? <Button label={busy ? 'Saving…' : `Save end ${idx + 1}${bufA.length === MATCH_ARROWS && bufB.length === MATCH_ARROWS ? ` (${endSum(bufA)}–${endSum(bufB)})` : ''}`} onPress={() => void saveEnd()} disabled={busy} />
            : <Button label={busy ? 'Saving…' : 'Save shoot-off arrows'} onPress={() => void saveSo()} disabled={busy} />}
          {edit != null && <SelectChip label="Cancel correction" active={false} onPress={() => { setEdit(null); setBufA([]); setBufB([]); }} />}
          <Text style={st.hint}>{idx != null ? 'Tap the arrows for one archer, then the other. Tap an end above to correct it.' : 'The higher arrow wins; if both score the same, the judge says which arrow is closer to the centre.'}</Text>
        </View>
      )}
      {err ? <Text style={st.bad}>{err}</Text> : null}
      {editable && (
        <View style={st.wrap}>
          {(A?.ends?.length || B?.ends?.length) ? <SelectChip label="Remove the last end" active={false} onPress={() => void clearLastEnd()} /> : null}
          {wo ? <SelectChip label="Undo the walkover" active={false} onPress={undoWalkover} />
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

const st = StyleSheet.create({
  card: { gap: theme.spacing(2), padding: theme.spacing(3) },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), alignItems: 'center' },
  head: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(1.5), paddingHorizontal: theme.spacing(1.5), borderRadius: theme.radius.sm, borderWidth: 1, borderColor: 'transparent' },
  rowOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.surfaceAlt },
  lot: { color: theme.colors.textMuted, fontWeight: '800', fontSize: theme.font.small, width: 22 },
  name: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  sub: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  doneTxt: { color: theme.colors.primary, fontWeight: '800', fontVariant: ['tabular-nums'], fontSize: theme.font.small },
  editor: { gap: theme.spacing(2), padding: theme.spacing(2.5), borderRadius: theme.radius.sm, borderWidth: 2, borderColor: theme.colors.primary },
  keyRow: { flexDirection: 'row', gap: theme.spacing(1.5) },
  key: { flex: 1, minHeight: 44, borderRadius: theme.radius.sm, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border },
  keyGold: { borderColor: theme.colors.accent },
  keyMiss: { borderColor: theme.colors.danger },
  keyBack: { flex: 0, paddingHorizontal: theme.spacing(3) },
  keyTxt: { color: theme.colors.text, fontWeight: '900', fontSize: theme.font.body },
  boxes: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), flexWrap: 'wrap' },
  box: { width: 34, height: 34, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface },
  boxNext: { borderColor: theme.colors.primary, borderWidth: 2 },
  boxTxt: { color: theme.colors.text, fontWeight: '900', fontVariant: ['tabular-nums'] },
  boxSum: { color: theme.colors.textMuted, fontWeight: '800', marginLeft: theme.spacing(1) },
  input: {
    backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(1.5), color: theme.colors.text, fontSize: theme.font.body,
  },
  inputBad: { borderColor: theme.colors.danger },
  bad: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  hint: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  match: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(1.5), paddingHorizontal: theme.spacing(1.5), borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.border },
  mName: { flex: 1, minWidth: 0, color: theme.colors.text, fontSize: theme.font.small },
  win: { fontWeight: '900', color: theme.colors.primary },
  mScore: { color: theme.colors.text, fontWeight: '800', fontVariant: ['tabular-nums'], fontSize: theme.font.small, textAlign: 'center', minWidth: 56 },
  tag: { color: theme.colors.primary, fontWeight: '900', fontSize: theme.font.small, letterSpacing: 0.5 },
  upName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  endRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5), paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(1), borderRadius: theme.radius.sm, borderWidth: 1, borderColor: 'transparent' },
  endNo: { color: theme.colors.textMuted, fontWeight: '800', fontSize: theme.font.tiny, width: 22 },
  endArrows: { flex: 1, minWidth: 0, color: theme.colors.text, fontSize: theme.font.small, fontVariant: ['tabular-nums'] },
  endSum: { fontWeight: '900' },
  endPts: { color: theme.colors.primary, fontWeight: '900', fontSize: theme.font.small, minWidth: 30, textAlign: 'center' },
});
