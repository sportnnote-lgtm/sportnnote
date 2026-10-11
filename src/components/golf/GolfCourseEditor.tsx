/** SD-122 — add or edit a golf course: name, city, each hole's par and stroke
 *  index (SI), and any number of tees (name, colour, course rating, slope,
 *  optional par and gender). Used by round setup for a new course (one
 *  "Default" tee to start — add more any time) and by the course edit screen.
 *  Validation lives in data/golfCourses (SI 1–18 or 1–9, each once). */
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, Card, TextField, SelectChip, FieldLabel, FormError, textStyles } from '../ui';
import { standardPar72, type Hole, type Tee } from '../../sports/golf/engine';
import { validateHoles, validateTees } from '../../data/golfCourses';
import type { GolfCourse } from '../../core/types';

export interface CourseDraft { name: string; city?: string; holes: Hole[]; tees: Tee[]; renames: Record<string, string> }

interface TeeRow { key: string; orig?: string; name: string; colour?: string; rating: string; slope: string; par: string; gender?: 'M' | 'F' }

const COLOURS: { name: string; hex: string }[] = [
  { name: 'Black', hex: '#111111' }, { name: 'Blue', hex: '#1E5BB8' }, { name: 'White', hex: '#F4F4F4' },
  { name: 'Yellow', hex: '#F2C200' }, { name: 'Red', hex: '#C62828' }, { name: 'Green', hex: '#2E7D32' },
];
export const teeHex = (colour?: string) => COLOURS.find((c) => c.name === colour)?.hex;

const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')));
const toRow = (t: Tee, i: number): TeeRow => ({
  key: `t${i}`, orig: t.name, name: t.name, colour: t.colour, gender: t.gender,
  rating: t.courseRating != null ? String(t.courseRating) : '', slope: t.slope != null ? String(t.slope) : '', par: t.par != null ? String(t.par) : '',
});

export function GolfCourseEditor({ initial, saveLabel, onSave, onCancel }: {
  initial?: GolfCourse;
  saveLabel?: string;
  onSave: (d: CourseDraft) => Promise<void> | void;
  onCancel?: () => void;
}) {
  const editing = !!initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [holes, setHoles] = useState<Hole[]>(() => (initial ? [...initial.holes].sort((a, b) => a.n - b.n) : standardPar72()));
  const [tees, setTees] = useState<TeeRow[]>(() => (initial?.tees.length ? initial.tees.map(toRow) : [{ key: 't0', name: 'Default', rating: '', slope: '', par: '' }]));
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nine = holes.length === 9;

  // stroke indexes used more than once / out of range — shown red as you type
  const badSi = useMemo(() => {
    const seen = new Map<number, number>();
    for (const h of holes) seen.set(h.si, (seen.get(h.si) ?? 0) + 1);
    return new Set(holes.filter((h) => !h.si || h.si > holes.length || (seen.get(h.si) ?? 0) > 1).map((h) => h.n));
  }, [holes]);

  const cyclePar = (i: number) => setHoles((hs) => hs.map((h, j) => (j === i ? { ...h, par: h.par >= 5 ? 3 : h.par + 1 } : h)));
  const setSi = (i: number, v: string) => setHoles((hs) => hs.map((h, j) => (j === i ? { ...h, si: Number(v.replace(/[^0-9]/g, '')) || 0 } : h)));
  const patchTee = (key: string, p: Partial<TeeRow>) => setTees((ts) => ts.map((t) => (t.key === key ? { ...t, ...p } : t)));
  const addTee = () => {
    const key = `t${Date.now()}`;
    const used = new Set(tees.map((t) => t.name));
    const nm = COLOURS.map((c) => c.name).find((c) => !used.has(c)) ?? `Tee ${tees.length + 1}`;
    setTees((ts) => [...ts, { key, name: nm, colour: COLOURS.some((c) => c.name === nm) ? nm : undefined, rating: '', slope: '', par: '' }]);
    setOpen(key);
  };

  const build = (): CourseDraft => {
    const out: Tee[] = tees.map((t) => {
      const rating = num(t.rating), slope = num(t.slope), par = num(t.par);
      if ([rating, slope, par].some((x) => x != null && !Number.isFinite(x))) throw new Error(`${t.name || 'Tee'}: numbers only for rating, slope and par.`);
      return {
        name: t.name.trim(),
        ...(t.colour ? { colour: t.colour } : {}),
        ...(rating != null ? { courseRating: rating } : {}),
        ...(slope != null ? { slope } : {}),
        ...(par != null ? { par } : {}),
        ...(t.gender ? { gender: t.gender } : {}),
      };
    });
    // keep any 9-hole ratings the course already had for a tee
    const kept = out.map((t, i) => {
      const was = initial?.tees.find((x) => x.name === tees[i].orig);
      return was ? { ...pick9(was), ...t } : t;
    });
    validateHoles(holes);
    validateTees(kept, holes.length);
    const renames = Object.fromEntries(tees.filter((t) => t.orig && t.orig !== t.name.trim()).map((t) => [t.orig!, t.name.trim()]));
    return { name: name.trim() || 'My course', city: city.trim() || undefined, holes, tees: kept, renames };
  };

  const save = async () => {
    setError(null);
    let d: CourseDraft;
    try { d = build(); } catch (e) { setError(e instanceof Error ? e.message : 'Check the course'); return; }
    setBusy(true);
    try { await onSave(d); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the course'); } finally { setBusy(false); }
  };

  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.muted}>Copy pars and stroke indexes (SI) from the scorecard. Tap a par to change it.{editing ? '' : ' Starts from a standard par-72 layout.'}</Text>
      <TextField label="Course name" value={name} onChange={setName} placeholder="e.g. Lakeview Golf Club" />
      <TextField label="City (optional)" value={city} onChange={setCity} placeholder="Hyderabad" />
      {!editing ? (
        <View style={st.chips}>
          <SelectChip label="18 holes" active={!nine} onPress={() => setHoles(standardPar72())} />
          <SelectChip label="9 holes" active={nine} onPress={() => setHoles((hs) => hs.slice(0, 9).map((h, i) => ({ ...h, n: i + 1, si: i + 1 })))} />
        </View>
      ) : (
        <Text style={textStyles.muted}>{holes.length} holes · par {holes.reduce((t, h) => t + h.par, 0)}</Text>
      )}
      <View style={st.grid}>
        {holes.map((h, i) => (
          <View key={h.n} style={st.holeCell}>
            <Text style={st.holeLbl}>{h.n}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Hole ${h.n} par ${h.par}, tap to change`} onPress={() => cyclePar(i)} style={st.parBtn}>
              <Text style={st.parTxt}>P{h.par}</Text>
            </TouchableOpacity>
            <TextInput style={[st.siInput, badSi.has(h.n) && st.siBad]} value={h.si ? String(h.si) : ''} onChangeText={(v) => setSi(i, v)} keyboardType="number-pad" maxLength={2}
              accessibilityLabel={`Hole ${h.n} stroke index`} placeholder="SI" placeholderTextColor={theme.colors.textMuted} />
          </View>
        ))}
      </View>
      {badSi.size > 0 && <Text style={st.warn}>Each stroke index 1–{holes.length} once — check the red ones.</Text>}

      <FieldLabel>Tees</FieldLabel>
      {tees.map((t) => {
        const isOpen = open === t.key || tees.length === 1;
        const summary = [t.rating && t.slope ? `${t.rating} / ${t.slope}` : 'no rating', t.par ? `par ${t.par}` : '', t.gender === 'F' ? 'women' : t.gender === 'M' ? 'men' : ''].filter(Boolean).join(' · ');
        return (
          <View key={t.key} style={st.teeBox}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${t.name || 'Tee'} tee, ${summary}. Tap to ${isOpen ? 'close' : 'edit'}`} onPress={() => setOpen(isOpen ? null : t.key)} style={st.teeHead}>
              <View style={[st.swatch, { backgroundColor: teeHex(t.colour) ?? theme.colors.surfaceAlt }]} />
              <Text style={[textStyles.body, st.flex]} numberOfLines={1}>{t.name || 'Tee'}</Text>
              <Text style={textStyles.muted} numberOfLines={1}>{summary}</Text>
            </TouchableOpacity>
            {isOpen && (
              <View style={{ gap: theme.spacing(2) }}>
                <TextField label="Tee name" value={t.name} onChange={(v) => patchTee(t.key, { name: v })} placeholder="e.g. White" />
                <View style={st.chips}>
                  {COLOURS.map((c) => (
                    <SelectChip key={c.name} label={c.name} active={t.colour === c.name} onPress={() => patchTee(t.key, {
                      colour: t.colour === c.name ? undefined : c.name,
                      // a tee still called "Default", blank, or after its colour takes the new colour's name
                      ...(t.colour !== c.name && (t.name === 'Default' || !t.name.trim() || t.name === t.colour) ? { name: c.name } : {}),
                    })} />
                  ))}
                </View>
                <View style={st.row}>
                  <View style={st.flex}><TextField label="Course rating" value={t.rating} onChange={(v) => patchTee(t.key, { rating: v })} placeholder="71.5" autoCapitalize="none" /></View>
                  <View style={st.flex}><TextField label="Slope" value={t.slope} onChange={(v) => patchTee(t.key, { slope: v })} placeholder="128" autoCapitalize="none" /></View>
                  <View style={st.flex}><TextField label="Tee par" value={t.par} onChange={(v) => patchTee(t.key, { par: v })} placeholder={String(holes.reduce((s, h) => s + h.par, 0))} autoCapitalize="none" /></View>
                </View>
                <View style={st.chips}>
                  <SelectChip label="Anyone" active={!t.gender} onPress={() => patchTee(t.key, { gender: undefined })} />
                  <SelectChip label="Men" active={t.gender === 'M'} onPress={() => patchTee(t.key, { gender: 'M' })} />
                  <SelectChip label="Women" active={t.gender === 'F'} onPress={() => patchTee(t.key, { gender: 'F' })} />
                  {tees.length > 1 && <SelectChip label="✕ Remove tee" active={false} onPress={() => setTees((ts) => ts.filter((x) => x.key !== t.key))} />}
                </View>
              </View>
            )}
          </View>
        );
      })}
      <Text style={st.link} accessibilityRole="button" onPress={addTee}>＋ Add a tee</Text>

      <FormError message={error} />
      <View style={st.row}>
        {onCancel && <View style={st.flex}><Button label="Cancel" variant="ghost" onPress={onCancel} /></View>}
        <View style={st.flex}><Button label={busy ? 'Saving…' : saveLabel ?? 'Save course'} onPress={() => void save()} disabled={busy} /></View>
      </View>
    </Card>
  );
}

const pick9 = (t: Tee): Partial<Tee> => ({
  ...(t.rating9F != null ? { rating9F: t.rating9F } : {}), ...(t.slope9F != null ? { slope9F: t.slope9F } : {}),
  ...(t.rating9B != null ? { rating9B: t.rating9B } : {}), ...(t.slope9B != null ? { slope9B: t.slope9B } : {}),
});

const st = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  row: { flexDirection: 'row', gap: theme.spacing(2) },
  flex: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  holeCell: { width: 52, alignItems: 'center', gap: 2, padding: 4, borderRadius: 8, backgroundColor: theme.colors.surfaceAlt },
  holeLbl: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  parBtn: { paddingVertical: 2, paddingHorizontal: 6, borderRadius: 6, backgroundColor: theme.colors.surface },
  parTxt: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.small },
  siInput: { width: 40, textAlign: 'center', color: theme.colors.text, fontSize: theme.font.small, borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingVertical: 2 },
  siBad: { color: theme.colors.danger, borderBottomColor: theme.colors.danger },
  warn: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  teeBox: { gap: theme.spacing(2), padding: theme.spacing(2), borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceAlt },
  teeHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), minHeight: 36 },
  swatch: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700', paddingVertical: theme.spacing(1) },
});
