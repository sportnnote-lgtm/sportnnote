/** SD-97 — the weightlifting official's controls on the results screen:
 *   - WeighInCard: bodyweight (to 0.01 kg) and the opening snatch / C&J per
 *     lifter, in lot order; a bodyweight outside the category, or any weight
 *     outside the usual range, asks first (never refused);
 *   - NextLiftCard: "Next: Asha Rao · 87 kg · 2nd attempt" from the IWF calling
 *     order, one tap for Good lift / No lift (or the three referees' lights),
 *     change the declared weight, declined; the next attempt is declared
 *     automatically (+1 kg after a good lift, the same after a no lift);
 *   - LiftGrid: one lifter's 3 + 3 attempts, tap a cell to correct it.
 *  Pure rules live in data/results/weightlifting.ts. */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Card, SelectChip, textStyles } from '../ui';
import { askConfirm } from '../ConfirmSheet';
import {
  activeLift, liftingOrder, callText, declareError, declare, recordLift, pendingIndex, taken, weighInIssue, classForBodyweight,
  summarizeLifts, bombedOutOf, fmtKg, WL_RANGE, BIG_JUMP, LIFT_LABEL, LIFT_SHORT, LIFTS, ordinal,
  type EntryResult, type LiftAttempt, type Lift, type ResultEntry,
} from '../../data/results';

type Save = (entryId: string, next: EntryResult, undoLabel?: string) => void;
const kgOf = (t: string): number | undefined => { const v = Number(t.trim().replace(',', '.')); return t.trim() && Number.isFinite(v) ? v : undefined; };
const RANGE_KEY: Record<Lift, string> = { snatch: 'wl.snatch', cj: 'wl.cj' };

/** Ask before an unusual weight: outside the usual range, or a jump of more than 20 kg. Resolves rangeOk / false. */
async function checkWeight(lift: Lift, kg: number, prev?: number): Promise<{ ok: boolean; rangeOk?: true }> {
  const r = WL_RANGE[RANGE_KEY[lift]];
  if (kg < r.min || kg > r.max) {
    const ok = await askConfirm({ title: 'Check this weight', message: `${kg} kg looks too ${kg < r.min ? 'light' : 'heavy'} for the ${LIFT_LABEL[lift].toLowerCase()} — the usual range is ${r.min}–${r.max} kg. Check the digits before saving.`, yesLabel: `Yes, ${kg} kg`, noLabel: 'No, re-enter it', tone: 'caution' });
    return ok ? { ok: true, rangeOk: true } : { ok: false };
  }
  if (prev != null && kg - prev > BIG_JUMP) {
    const ok = await askConfirm({ title: 'Big jump', message: `${kg} kg is ${kg - prev} kg more than the attempt before (${prev} kg). Is that right?`, yesLabel: `Yes, ${kg} kg`, noLabel: 'No, re-enter it', tone: 'caution' });
    return ok ? { ok: true } : { ok: false };
  }
  return { ok: true };
}

/** Validate + confirm a declaration for the lifter's pending attempt. Returns the new list or null. */
async function declared(list: LiftAttempt[] | undefined, lift: Lift, kg: number, setErr: (s: string | null) => void): Promise<LiftAttempt[] | null> {
  const l = list ?? [];
  const i = pendingIndex(l) >= 0 ? pendingIndex(l) : l.length;
  const bad = declareError(l, i, kg);
  if (bad) { setErr(bad); return null; }
  const c = await checkWeight(lift, kg, i > 0 ? l[i - 1]?.kg : undefined);
  if (!c.ok) return null;
  setErr(null);
  return declare(l, kg, c.rangeOk);
}

/* ------------------------------- weigh-in ------------------------------- */

export function WeighInCard({ entries, classes, weightClass, editable, onSave }: {
  entries: ResultEntry[]; classes: string[]; weightClass?: string; editable: boolean; onSave: Save;
}) {
  const weighed = entries.filter((e) => e.result.bodyweight != null).length;
  const started = entries.some((e) => LIFTS.some((l) => (e.result.lifts?.[l] ?? []).some(taken)));
  const [open, setOpen] = useState(!started);
  const rows = [...entries].sort((a, b) => (a.result.order ?? 99) - (b.result.order ?? 99));
  return (
    <Card style={st.card}>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={st.headRow}>
        <Text style={[textStyles.h3, { flex: 1 }]}>⚖️ Weigh-in</Text>
        <Text style={textStyles.muted}>{weighed}/{entries.length} weighed {open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && (
        <>
          <Text style={textStyles.muted}>In lot order. Bodyweight to 0.01 kg{weightClass ? ` — ${weightClass}` : ''}; openings in whole kg (they can change until the lifter is called).</Text>
          <View style={st.headRow}>
            <Text style={[st.head, { width: 26 }]}>Lot</Text>
            <Text style={[st.head, { flex: 1 }]}>Lifter</Text>
            <Text style={[st.head, st.col]}>Bw</Text>
            <Text style={[st.head, st.col]}>Sn</Text>
            <Text style={[st.head, st.col]}>C&J</Text>
          </View>
          {rows.map((e) => <WeighInRow key={e.id} e={e} classes={classes} weightClass={weightClass} editable={editable} onSave={onSave} />)}
        </>
      )}
    </Card>
  );
}

function WeighInRow({ e, classes, weightClass, editable, onSave }: { e: ResultEntry; classes: string[]; weightClass?: string; editable: boolean; onSave: Save }) {
  const r = e.result;
  const opening = (l: Lift) => { const a = r.lifts?.[l]?.[0]; return a ? String(a.kg) : ''; };
  const [bw, setBw] = useState(r.bodyweight != null ? fmtKg(r.bodyweight) : '');
  const [sn, setSn] = useState(opening('snatch'));
  const [cj, setCj] = useState(opening('cj'));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setBw(r.bodyweight != null ? fmtKg(r.bodyweight) : ''); }, [r.bodyweight]);
  useEffect(() => { setSn(opening('snatch')); setCj(opening('cj')); }, [r.lifts]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveBw = async () => {
    if (!bw.trim()) { if (r.bodyweight != null) onSave(e.id, { ...r, bodyweight: undefined }); return; }
    const v = kgOf(bw);
    if (v == null || v <= 0) { setErr("Can't read the bodyweight."); return; }
    const kg = Math.round(v * 100) / 100;
    if (kg === r.bodyweight) return;
    const rg = WL_RANGE.bodyweight;
    const back = () => setBw(r.bodyweight != null ? fmtKg(r.bodyweight) : '');
    if ((kg < rg.min || kg > rg.max) && !(await askConfirm({ title: 'Check the bodyweight', message: `${fmtKg(kg)} kg is outside the usual ${rg.min}–${rg.max} kg. Check the digits.`, yesLabel: `Yes, ${fmtKg(kg)} kg`, noLabel: 'No, re-enter it', tone: 'caution' }))) { back(); return; }
    const issue = weighInIssue(classes, weightClass, kg);
    if (issue && !(await askConfirm({ title: `${e.name.split(' ')[0]} — category`, message: `${issue} Keep them in ${weightClass} (a school meet may allow it)?`, yesLabel: 'Yes, keep in this category', noLabel: 'No, re-weigh', tone: 'caution' }))) { back(); return; }
    setErr(null);
    onSave(e.id, { ...r, bodyweight: kg });
  };
  const saveOpening = async (lift: Lift, text: string) => {
    const list = r.lifts?.[lift] ?? [];
    if (list[0] && taken(list[0])) return; // the first attempt is lifted — correct it on the attempt grid
    if (!text.trim()) { if (list[0]) onSave(e.id, { ...r, lifts: { ...r.lifts, [lift]: [] } }); return; }
    const kg = kgOf(text);
    if (kg == null) { setErr("Can't read that weight."); return; }
    if (list[0]?.kg === kg) return;
    const next = await declared([], lift, kg, setErr);
    if (next) onSave(e.id, { ...r, lifts: { ...r.lifts, [lift]: next } });
    else (lift === 'snatch' ? setSn : setCj)(opening(lift)); // not saved: show what is
  };
  const firstTaken = (l: Lift) => !!r.lifts?.[l]?.[0] && taken(r.lifts![l]![0]);
  const fits = r.bodyweight != null ? classForBodyweight(classes, r.bodyweight) : undefined;
  return (
    <View style={{ gap: 2 }}>
      <View style={st.headRow}>
        <Text style={[st.lot, { width: 26 }]}>{r.order ?? '–'}</Text>
        <Text style={[st.name, { flex: 1 }]} numberOfLines={1}>{e.name}</Text>
        <TextInput style={[st.input, st.col]} value={bw} onChangeText={setBw} editable={editable} placeholder="kg" placeholderTextColor={theme.colors.textMuted}
          keyboardType="decimal-pad" accessibilityLabel={`Bodyweight of ${e.name}`} onBlur={() => void saveBw()} onSubmitEditing={() => void saveBw()} />
        <TextInput style={[st.input, st.col]} value={sn} onChangeText={setSn} editable={editable && !firstTaken('snatch')} placeholder="kg" placeholderTextColor={theme.colors.textMuted}
          keyboardType="number-pad" accessibilityLabel={`Opening snatch of ${e.name}`} onBlur={() => void saveOpening('snatch', sn)} onSubmitEditing={() => void saveOpening('snatch', sn)} />
        <TextInput style={[st.input, st.col]} value={cj} onChangeText={setCj} editable={editable && !firstTaken('cj')} placeholder="kg" placeholderTextColor={theme.colors.textMuted}
          keyboardType="number-pad" accessibilityLabel={`Opening clean and jerk of ${e.name}`} onBlur={() => void saveOpening('cj', cj)} onSubmitEditing={() => void saveOpening('cj', cj)} />
      </View>
      {fits && weightClass && fits !== weightClass ? <Text style={st.warn}>Bodyweight is in {fits}.</Text> : null}
      {err ? <Text style={st.bad}>{err}</Text> : null}
    </View>
  );
}

/* ----------------------------- next attempt ----------------------------- */

export function NextLiftCard({ entries, seq, onSave }: { entries: ResultEntry[]; seq: number; onSave: Save }) {
  const lift = activeLift(entries);
  const order = useMemo(() => (lift ? liftingOrder(entries, lift) : []), [entries, lift]);
  const cur = order[0];
  const [lightsMode, setLightsMode] = useState(false);
  const [lights, setLights] = useState<(boolean | null)[]>([null, null, null]);
  const [kg, setKg] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const key = cur ? `${cur.entryId}:${cur.lift}:${cur.attempt}:${cur.kg ?? ''}` : '';
  useEffect(() => { setLights([null, null, null]); setKg(''); setErr(null); }, [key]);
  if (!lift || !cur) {
    return (
      <Card style={st.upCard}>
        <Text style={textStyles.h3}>✅ All attempts taken</Text>
        <Text style={textStyles.muted}>Check the results below, then Finish & lock.</Text>
      </Card>
    );
  }
  const e = entries.find((x) => x.id === cur.entryId)!;
  const r = e.result;
  const list = r.lifts?.[lift] ?? [];
  const first = e.name.split(' ')[0];
  const decide = (d: { good?: boolean; pass?: boolean; lights?: boolean[] }) => {
    const nextList = recordLift(list, d, seq);
    const done = nextList[pendingIndex(list)];
    const word = d.pass ? '– declined' : done?.good ? '✓ good lift' : '✗ no lift';
    onSave(e.id, { ...r, lifts: { ...r.lifts, [lift]: nextList } }, `${word} · ${first} ${cur.kg} kg`);
  };
  const changeWeight = async () => {
    const v = kgOf(kg);
    if (v == null) { setErr('Type the weight in kg.'); return; }
    const next = await declared(list, lift, v, setErr);
    if (next) onSave(e.id, { ...r, lifts: { ...r.lifts, [lift]: next } });
  };
  const decline = async () => {
    const ok = await askConfirm({ title: `${first} declines this attempt?`, message: `The ${ordinal(cur.attempt)} ${LIFT_LABEL[lift].toLowerCase()} attempt at ${cur.kg} kg counts as no lift. A declined attempt can't be taken later.`, yesLabel: 'Yes, declined', noLabel: 'No, keep it', tone: 'caution' });
    if (ok) decide({ pass: true });
  };
  const lightsDone = lights.every((x) => x != null);
  return (
    <Card style={st.upCard}>
      <View style={st.headRow}>
        <Text style={st.liftTag}>{LIFT_LABEL[lift].toUpperCase()}</Text>
        <Text style={[textStyles.muted, { flex: 1, textAlign: 'right' }]} numberOfLines={1}>lot {r.order ?? '–'}{e.team?.name ? ` · ${e.team.name}` : ''}{r.bodyweight != null ? ` · bw ${fmtKg(r.bodyweight)}` : ''}</Text>
      </View>
      <Text style={st.upName} accessibilityRole="header">Next: {callText(cur)}</Text>
      {cur.kg == null ? (
        <View style={st.headRow}>
          <TextInput style={[st.input, { width: 90 }]} value={kg} onChangeText={setKg} placeholder="kg" placeholderTextColor={theme.colors.textMuted} keyboardType="number-pad" accessibilityLabel={`Declare ${first}'s weight`} onSubmitEditing={() => void changeWeight()} />
          <SelectChip label="Declare" active={false} onPress={() => void changeWeight()} />
        </View>
      ) : (
        <>
          {!lightsMode ? (
            <View style={st.headRow}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Good lift for ${first}`} style={[st.bigBtn, st.bigOk]} onPress={() => decide({ good: true })}><Text style={st.bigTxt}>✓ Good lift</Text></TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`No lift for ${first}`} style={[st.bigBtn, st.bigX]} onPress={() => decide({ good: false })}><Text style={st.bigTxt}>✗ No lift</Text></TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: theme.spacing(2) }}>
              <View style={st.headRow}>
                {lights.map((l, i) => (
                  <TouchableOpacity key={i} accessibilityRole="button" accessibilityLabel={`Referee ${i + 1}: ${l == null ? 'not set' : l ? 'white' : 'red'}`}
                    onPress={() => setLights((ls) => ls.map((x, j) => (j === i ? (x === true ? false : true) : x)))}
                    style={[st.light, l === true && st.lightW, l === false && st.lightR]}>
                    <Text style={[st.lightTxt, l === true && { color: '#222' }, l === false && { color: '#fff' }]}>{['Left', 'Centre', 'Right'][i]}{'\n'}{l == null ? '—' : l ? 'white' : 'red'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity accessibilityRole="button" disabled={!lightsDone} style={[st.bigBtn, lightsDone ? (lights.filter(Boolean).length >= 2 ? st.bigOk : st.bigX) : st.bigOff]}
                onPress={() => decide({ lights: lights as boolean[] })}>
                <Text style={st.bigTxt}>{lightsDone ? (lights.filter(Boolean).length >= 2 ? `✓ Good lift (${lights.filter(Boolean).length} white)` : `✗ No lift (${lights.filter((x) => x === false).length} red)`) : 'Tap each referee: white / red'}</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={st.wrap}>
            <SelectChip label={lightsMode ? '✓ 3 lights' : '3 lights'} active={lightsMode} onPress={() => setLightsMode(!lightsMode)} />
            <TextInput style={[st.input, { width: 70 }]} value={kg} onChangeText={setKg} placeholder={String(cur.kg)} placeholderTextColor={theme.colors.textMuted} keyboardType="number-pad"
              accessibilityLabel={`Change ${first}'s weight`} onSubmitEditing={() => void changeWeight()} />
            <SelectChip label="Change kg" active={false} onPress={() => void changeWeight()} />
            <SelectChip label="Declined" active={false} onPress={() => void decline()} />
          </View>
        </>
      )}
      {err ? <Text style={st.bad}>{err}</Text> : null}
      {order.length > 1 && (
        <View style={{ gap: 2 }}>
          {order.slice(1, 4).map((c) => <Text key={`${c.entryId}${c.attempt}`} style={textStyles.muted} numberOfLines={1}>Then: {callText(c)}</Text>)}
        </View>
      )}
      <Text style={st.hint}>The lightest bar lifts first; at the same weight the earlier attempt, the bigger jump, then the lower lot. After a decision the next attempt is set to +1 kg (good) or the same weight (no lift) — change it if the coach declares another.</Text>
    </Card>
  );
}

/* ------------------------------ attempt grid ----------------------------- */

/** One lifter's attempts: Sn / C&J rows, tap a cell to correct it. */
export function LiftGrid({ r, editable, onChange }: { r: EntryResult; editable: boolean; onChange: (next: EntryResult) => void }) {
  const [sel, setSel] = useState<{ lift: Lift; i: number } | null>(null);
  const [kg, setKg] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const s = summarizeLifts(r.lifts);
  const bomb = bombedOutOf(r);
  const pick = (lift: Lift, i: number) => {
    if (!editable) return;
    const a = r.lifts?.[lift]?.[i];
    if (sel && sel.lift === lift && sel.i === i) { setSel(null); return; }
    setSel({ lift, i }); setKg(a ? String(a.kg) : ''); setErr(null);
  };
  const list = sel ? [...(r.lifts?.[sel.lift] ?? [])] : [];
  const cur = sel ? list[sel.i] : undefined;
  const apply = async (good?: boolean) => {
    if (!sel) return;
    const v = kgOf(kg) ?? cur?.kg;
    if (v == null) { setErr('Type the weight in kg.'); return; }
    if (sel.i > list.length || (!cur && sel.i > 0 && !taken(list[sel.i - 1]))) { setErr('Fill the attempts in order.'); return; }
    const bad = declareError(list, sel.i, v);
    if (bad) { setErr(bad); return; }
    if (v !== cur?.kg) { const c = await checkWeight(sel.lift, v, sel.i > 0 ? list[sel.i - 1]?.kg : undefined); if (!c.ok) return; }
    const next: LiftAttempt = { ...(cur ?? {}), kg: v, auto: undefined };
    if (good !== undefined) { next.good = good; next.pass = undefined; next.lights = undefined; }
    list[sel.i] = next;
    onChange({ ...r, lifts: { ...r.lifts, [sel.lift]: list } });
    setSel(null);
  };
  const clear = async () => {
    if (!sel || !cur) return;
    // clearing a decision clears every later attempt of this lift too (they followed from it)
    const later = list.slice(sel.i + 1).some(taken);
    const ok = await askConfirm({ title: 'Clear this attempt?', message: `${LIFT_LABEL[sel.lift]} attempt ${sel.i + 1} (${cur.kg} kg${taken(cur) ? `, ${cur.pass ? 'declined' : cur.good ? 'good lift' : 'no lift'}` : ''}) goes back to not lifted${later || list.length > sel.i + 1 ? ', and the attempts after it are removed' : ''}.`, yesLabel: 'Yes, clear', noLabel: 'No, keep it', tone: 'danger' });
    if (!ok) return;
    const kept = list.slice(0, sel.i);
    if (taken(cur)) kept.push({ kg: cur.kg });
    onChange({ ...r, lifts: { ...r.lifts, [sel.lift]: kept } });
    setSel(null);
  };
  return (
    <View style={{ gap: theme.spacing(1) }}>
      {LIFTS.map((lift) => (
        <View key={lift} style={st.headRow}>
          <Text style={[st.head, { width: 34 }]}>{LIFT_SHORT[lift]}</Text>
          {[0, 1, 2].map((i) => {
            const a = r.lifts?.[lift]?.[i];
            const on = sel?.lift === lift && sel.i === i;
            const txt = a ? (a.pass ? `${a.kg} –` : `${a.kg}`) : '';
            return (
              <TouchableOpacity key={i} accessibilityRole="button" disabled={!editable} onPress={() => pick(lift, i)}
                accessibilityLabel={`${LIFT_LABEL[lift]} attempt ${i + 1}: ${a ? `${a.kg} kg ${a.pass ? 'declined' : a.good === true ? 'good lift' : a.good === false ? 'no lift' : 'declared'}` : 'empty'}`}
                style={[st.cell, a?.good === true && st.cellGood, a?.good === false && st.cellBad, a && !taken(a) && st.cellDeclared, on && st.cellOn]}>
                <Text style={[st.cellTxt, a?.good === false && st.cellTxtBad, a && !taken(a) && { color: theme.colors.textMuted }]}>{txt || '·'}</Text>
              </TouchableOpacity>
            );
          })}
          <Text style={[st.best, { width: 40 }]}>{lift === 'snatch' ? s.snatch ?? '–' : s.cj ?? '–'}</Text>
        </View>
      ))}
      <Text style={[textStyles.muted, bomb && st.bad]}>
        {r.bodyweight != null ? `Bw ${fmtKg(r.bodyweight)} · ` : ''}Total {s.total != null ? `${s.total} kg` : bomb ? `— no total (no good ${bomb === 'snatch' ? 'snatch' : 'clean & jerk'})` : '—'}
      </Text>
      {sel && (
        <View style={st.editor}>
          <Text style={st.head}>{LIFT_LABEL[sel.lift]} attempt {sel.i + 1}{cur && !taken(cur) ? ' (declared)' : ''}</Text>
          <View style={st.wrap}>
            <TextInput style={[st.input, { width: 70 }]} value={kg} onChangeText={setKg} placeholder="kg" placeholderTextColor={theme.colors.textMuted} keyboardType="number-pad" accessibilityLabel="Attempt weight in kg" />
            {cur && taken(cur) ? (
              <>
                <SelectChip label="✓ Good" active={cur.good === true} onPress={() => void apply(true)} />
                <SelectChip label="✗ No lift" active={cur.good === false && !cur.pass} onPress={() => void apply(false)} />
              </>
            ) : <SelectChip label="Set weight" active={false} onPress={() => void apply()} />}
            {cur ? <SelectChip label="Clear" active={false} onPress={() => void clear()} /> : null}
          </View>
          {err ? <Text style={st.bad}>{err}</Text> : null}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  card: { gap: theme.spacing(2), padding: theme.spacing(3) },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), alignItems: 'center' },
  head: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  col: { width: 62, textAlign: 'center' },
  lot: { color: theme.colors.textMuted, fontWeight: '800', fontSize: theme.font.small },
  name: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  input: {
    backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(1.5), color: theme.colors.text, fontSize: theme.font.body,
  },
  warn: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '700', paddingLeft: 26 + theme.spacing(2) },
  bad: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  hint: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  upCard: { gap: theme.spacing(2), padding: theme.spacing(3), borderWidth: 2, borderColor: theme.colors.primary },
  liftTag: { color: theme.colors.primary, fontWeight: '900', fontSize: theme.font.small, letterSpacing: 0.5 },
  upName: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '800' },
  bigBtn: { flexGrow: 1, flexBasis: 0, minHeight: 56, paddingVertical: theme.spacing(3), borderRadius: theme.radius.sm, alignItems: 'center', justifyContent: 'center' },
  bigOk: { backgroundColor: theme.colors.primary },
  bigX: { backgroundColor: theme.colors.danger },
  bigOff: { backgroundColor: theme.colors.surfaceAlt },
  bigTxt: { color: '#fff', fontWeight: '900', fontSize: theme.font.body },
  light: { flex: 1, minHeight: 52, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceAlt },
  lightW: { backgroundColor: '#FFFFFF', borderColor: '#999' },
  lightR: { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger },
  lightTxt: { color: theme.colors.text, fontSize: theme.font.tiny, fontWeight: '800', textAlign: 'center' },
  cell: { flex: 1, minHeight: 40, borderRadius: theme.radius.sm, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  cellGood: { backgroundColor: theme.colors.primary + '33' },
  cellBad: { backgroundColor: theme.colors.danger + '22' },
  cellDeclared: { borderStyle: 'dashed', borderColor: theme.colors.border },
  cellOn: { borderColor: theme.colors.primary, borderStyle: 'solid' },
  cellTxt: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800', fontVariant: ['tabular-nums'] },
  cellTxtBad: { color: theme.colors.danger, textDecorationLine: 'line-through' },
  best: { color: theme.colors.text, fontWeight: '900', textAlign: 'right', fontVariant: ['tabular-nums'] },
  editor: { gap: theme.spacing(2), padding: theme.spacing(2), borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.border },
});
