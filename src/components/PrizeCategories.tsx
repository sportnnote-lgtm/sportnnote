/** SD-134 — prize categories inside one field, shared by chess (category
 *  prizes: U-9 / U-11 / girls / unrated / rating bands) and golf (divisions on
 *  one leaderboard: Boys U-12 / U-15, Girls …). A chip row filters the board
 *  to a category; organisers pick the categories from presets, the prizes per
 *  category, the age cut-off day and the one-prize rule, and can add players
 *  the profile can't place (no age / gender). Pure rules: data/prizeCategories.ts. */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip, textStyles } from './ui';
import { cutoffLabel } from '../core/age';
import {
  presetsFor, defaultAgeOn, ruleText, unknownFor, prizeAwards, categoryBoard, DEFAULT_PLACES, DEFAULT_MAIN_PLACES,
  type PrizeSetup, type PrizeContext, type PrizeCategory, type RankedLike,
} from '../data/prizeCategories';

/** The chip row + (organiser) the category editor. `active` = the category shown (null = everyone). */
export function PrizeCategoryBar({ sport, setup, canEdit, onSave, active, onPick, ids, nameOf, ctx }: {
  sport: string;
  setup: PrizeSetup | null;
  canEdit: boolean;
  onSave: (next: PrizeSetup | null) => Promise<void>;
  active: string | null;
  onPick: (id: string | null) => void;
  /** everyone in the field (for "can't tell" hand placement) */
  ids: string[];
  nameOf: (id: string) => string;
  ctx: PrizeContext;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const cats = setup?.cats ?? [];
  const presets = presetsFor(sport);
  const cur = cats.find((c) => c.id === active) ?? null;
  // golf divisions are separate competitions (a player can win overall AND their division)
  const base: PrizeSetup = setup ?? { v: 1, cats: [], ...(sport === 'golf' ? { onePrize: false } : {}) };
  const save = async (next: PrizeSetup | null) => { setBusy(true); try { await onSave(next && next.cats.length ? next : null); } finally { setBusy(false); } };
  const toggleCat = (p: PrizeCategory) => {
    const has = cats.some((c) => c.id === p.id);
    const nextCats = has ? cats.filter((c) => c.id !== p.id) : [...cats, p].sort((a, b) => presets.findIndex((x) => x.id === a.id) - presets.findIndex((x) => x.id === b.id));
    if (has && active === p.id) onPick(null);
    void save({ ...base, cats: nextCats });
  };
  const handAdd = (catId: string, id: string, on: boolean) => {
    const add = { ...(base.add ?? {}) };
    const list = new Set(add[catId] ?? []);
    if (on) list.add(id); else list.delete(id);
    if (list.size) add[catId] = [...list]; else delete add[catId];
    void save({ ...base, add });
  };
  const unknown = cur ? unknownFor(base, cur, ids, ctx) : [];
  const handPlaced = cur ? base.add?.[cur.id] ?? [] : [];

  if (!cats.length && !canEdit) return null;
  return (
    <View style={{ gap: theme.spacing(2) }}>
      {cats.length > 0 && (
        <View style={st.chips}>
          <SelectChip label="All" active={!active} onPress={() => onPick(null)} />
          {cats.map((c) => <SelectChip key={c.id} label={c.label} active={active === c.id} onPress={() => onPick(active === c.id ? null : c.id)} />)}
          {canEdit && <SelectChip label={editing ? '✓ Done' : sport === 'golf' ? '⚙ Divisions' : '⚙ Categories'} active={editing} onPress={() => setEditing((v) => !v)} />}
        </View>
      )}
      {!cats.length && canEdit && (
        <SelectChip label={editing ? '✓ Done' : sport === 'golf' ? '🏷 Divisions (U-12 / U-15 / girls…)' : '🏷 Category prizes (U-age / girls / unrated…)'} active={editing} onPress={() => setEditing((v) => !v)} />
      )}
      {cur && (
        <Text style={st.meta}>{cur.label}: {ruleText(cur)}{(cur.under !== undefined || cur.minAge !== undefined) ? ` · ages on ${cutoffLabel(ctx.cutoff)}` : ''}. Places are within the category, in the overall order.</Text>
      )}
      {cur && canEdit && (unknown.length > 0 || handPlaced.length > 0) && (
        <View style={{ gap: theme.spacing(1) }}>
          {unknown.length > 0 && <Text style={st.meta}>No {cur.gender ? 'gender' : ''}{cur.gender && (cur.under !== undefined || cur.minAge !== undefined) ? ' / ' : ''}{cur.under !== undefined || cur.minAge !== undefined ? 'age' : ''} on the profile — tap to add to {cur.label}:</Text>}
          <View style={st.chips}>
            {unknown.map((id) => <SelectChip key={id} label={`＋ ${nameOf(id)}`} active={false} onPress={() => handAdd(cur.id, id, true)} />)}
            {handPlaced.map((id) => <SelectChip key={id} label={`✓ ${nameOf(id)} ✕`} active onPress={() => handAdd(cur.id, id, false)} />)}
          </View>
        </View>
      )}
      {editing && canEdit && (
        <View style={st.box}>
          <Text style={st.head}>{sport === 'golf' ? 'Divisions in this field' : 'Prize categories'}</Text>
          <View style={st.chips}>
            {presets.map((p) => <SelectChip key={p.id} label={`${cats.some((c) => c.id === p.id) ? '✓ ' : ''}${p.label}`} active={cats.some((c) => c.id === p.id)} onPress={() => toggleCat(p)} />)}
          </View>
          <Text style={st.sub}>Prizes in each category</Text>
          <View style={st.chips}>
            {[1, 2, 3, 5].map((n) => <SelectChip key={n} label={String(n)} active={(base.places ?? DEFAULT_PLACES) === n} onPress={() => void save({ ...base, places: n })} />)}
          </View>
          <Text style={st.sub}>Ages counted on</Text>
          <View style={st.chips}>
            {(['jan1', 'dec31', 'meet'] as const).map((b) => (
              <SelectChip key={b} label={b === 'jan1' ? '1 Jan (FIDE youth)' : b === 'dec31' ? '31 Dec' : 'Event start'} active={(base.ageOn ?? defaultAgeOn(sport)) === b} onPress={() => void save({ ...base, ageOn: b })} />
            ))}
          </View>
          <Text style={st.sub}>One prize per player</Text>
          <View style={st.chips}>
            <SelectChip label="Yes — the next player moves up" active={base.onePrize !== false} onPress={() => void save({ ...base, onePrize: true })} />
            <SelectChip label="No — can win several" active={base.onePrize === false} onPress={() => void save({ ...base, onePrize: false })} />
          </View>
          {base.onePrize !== false && (
            <>
              <Text style={st.sub}>Overall prizes (winners skip the categories)</Text>
              <View style={st.chips}>
                {[0, 1, 3, 5, 10].map((n) => <SelectChip key={n} label={String(n)} active={(base.mainPlaces ?? DEFAULT_MAIN_PLACES) === n} onPress={() => void save({ ...base, mainPlaces: n })} />)}
              </View>
            </>
          )}
          <Text style={st.meta}>Categories use each player's profile (gender, date of birth{sport === 'chess' ? ', rating on the event’s list' : ''}). Players the profile can't place show under the category for you to add.{busy ? ' Saving…' : ''}</Text>
        </View>
      )}
    </View>
  );
}

/** The prize list: overall prizes, then each category's winners. */
export function PrizeList<R extends RankedLike>({ rows, setup, ctx, nameOf, valueOf, title = '🏅 Category prizes' }: {
  rows: R[]; setup: PrizeSetup; ctx: PrizeContext; nameOf: (id: string) => string; valueOf?: (r: R) => string; title?: string;
}) {
  const res = useMemo(() => prizeAwards(rows, setup, ctx), [rows, setup, ctx]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  if (!setup.cats.length) return null;
  return (
    <View style={st.box}>
      <Text style={st.head}>{title}</Text>
      {setup.onePrize !== false && res.main.length > 0 && (
        <Text style={st.meta}>Overall prizes: {res.main.map((id, i) => `${i + 1}. ${nameOf(id)}`).join(' · ')} — one prize each, so they are passed over below.</Text>
      )}
      {setup.cats.map((c) => {
        const list = res.byCat.get(c.id) ?? [];
        return (
          <View key={c.id} style={{ gap: 2 }}>
            <Text style={st.sub}>{c.label}</Text>
            {list.length === 0 ? <Text style={st.meta}>No one yet.</Text> : list.map((a) => {
              const r = byId.get(a.id);
              return <Text key={a.id} style={textStyles.body}>{a.place}. {nameOf(a.id)}{r && valueOf ? ` · ${valueOf(r)}` : ''}{r?.position != null ? <Text style={st.meta}>  (overall {r.position})</Text> : null}</Text>;
            })}
          </View>
        );
      })}
    </View>
  );
}

/** Filter + relabel a ranked board for the chosen category. */
export function useCategoryRows<R extends RankedLike>(rows: R[], setup: PrizeSetup | null, active: string | null, ctx: PrizeContext) {
  return useMemo(() => {
    const c = setup?.cats.find((x) => x.id === active);
    if (!setup || !c) return null;
    return categoryBoard(rows, setup, c, ctx);
  }, [rows, setup, active, ctx]);
}

const st = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  box: { gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  head: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  sub: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
});
