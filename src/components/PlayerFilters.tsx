/**
 * Discover filters — one "⚙ Filters" button that expands a tidy panel instead of
 * endless sideways chip rows: sports (multi-select, wrapped grid), city
 * (type-to-search over the cities players are in), gender, age band and
 * verified-only. Active filters show as removable chips under the search box.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Card, SelectChip, TextField, textStyles } from './ui';
import { SPORT_LIST, getSport } from '../sports/registry';
import type { PlayerSearch } from '../data/repos';
import type { SportId } from '../core/types';

export type PlayerFilterState = Omit<PlayerSearch, 'query'> & {
  /** only when `typeOptions` is given (Connect: post types) */
  types?: string[];
};
type Section = 'types' | 'sports' | 'cities' | 'gender' | 'age' | 'verified';
const ALL_SECTIONS: Section[] = ['types', 'sports', 'cities', 'gender', 'age', 'verified'];

const AGES: Array<{ id: NonNullable<PlayerSearch['age']>; label: string }> = [
  { id: 'u14', label: 'Under 14' },
  { id: 'u16', label: 'Under 16' },
  { id: 'u18', label: 'Under 18' },
  { id: 'adult', label: '18–34' },
  { id: '35plus', label: '35+' },
];
const AGE_LABEL = Object.fromEntries(AGES.map((a) => [a.id, a.label])) as Record<string, string>;

export const activeFilterCount = (f: PlayerFilterState) =>
  (f.types?.length ?? 0) + (f.sports?.length ?? 0) + (f.cities?.length ?? 0) + (f.gender ? 1 : 0) + (f.age ? 1 : 0) + (f.verifiedOnly ? 1 : 0);

const toggle = <T,>(list: T[] | undefined, v: T): T[] => {
  const cur = list ?? [];
  return cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
};

export function PlayerFilters({ value, onChange, cities, sections = ALL_SECTIONS, typeOptions, typeLabel = 'Type' }: {
  value: PlayerFilterState;
  onChange: (next: PlayerFilterState) => void;
  /** cities in use, most common first */
  cities: string[];
  /** which sections to show (Connect: types, sports, cities) */
  sections?: Section[];
  /** options for the 'types' section, e.g. Connect's post kinds */
  typeOptions?: Array<{ id: string; label: string }>;
  typeLabel?: string;
}) {
  const has = (sec: Section) => sections.includes(sec) && (sec !== 'types' || !!typeOptions?.length);
  const typeName = (id: string) => typeOptions?.find((t) => t.id === id)?.label ?? id;
  const [open, setOpen] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const n = activeFilterCount(value);

  // Type-to-search; with nothing typed, the most common cities.
  const citySuggestions = useMemo(() => {
    const q = cityQuery.trim().toLowerCase();
    const list = q ? cities.filter((c) => c.toLowerCase().includes(q)) : cities;
    return list.filter((c) => !(value.cities ?? []).includes(c)).slice(0, q ? 12 : 6);
  }, [cityQuery, cities, value.cities]);

  const set = (patch: Partial<PlayerFilterState>) => onChange({ ...value, ...patch });

  return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={st.bar}>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={[st.filterBtn, (open || n > 0) && st.filterBtnOn]} activeOpacity={0.8}>
          <Text style={[st.filterText, (open || n > 0) && st.filterTextOn]}>⚙ Filters{n ? ` · ${n}` : ''} {open ? '▴' : '▾'}</Text>
        </TouchableOpacity>
        {n > 0 && (
          <TouchableOpacity accessibilityRole="button" onPress={() => onChange({})} hitSlop={8}>
            <Text style={st.clear}>Clear all</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Active filters — tap ✕ to remove one. */}
      {n > 0 && !open && (
        <View style={st.wrap}>
          {(value.types ?? []).map((t) => (
            <SelectChip key={t} label={`${typeName(t)} ✕`} active onPress={() => set({ types: toggle(value.types, t) })} />
          ))}
          {(value.sports ?? []).map((s) => (
            <SelectChip key={s} label={`${getSport(s).icon} ${getSport(s).name} ✕`} active onPress={() => set({ sports: toggle(value.sports, s) })} />
          ))}
          {(value.cities ?? []).map((c) => (
            <SelectChip key={c} label={`📍 ${c} ✕`} active onPress={() => set({ cities: toggle(value.cities, c) })} />
          ))}
          {value.gender && <SelectChip label={`${value.gender === 'male' ? 'Male' : 'Female'} ✕`} active onPress={() => set({ gender: undefined })} />}
          {value.age && <SelectChip label={`${AGE_LABEL[value.age]} ✕`} active onPress={() => set({ age: undefined })} />}
          {value.verifiedOnly && <SelectChip label="☑️ Verified ✕" active onPress={() => set({ verifiedOnly: false })} />}
        </View>
      )}

      {open && (
        <Card style={{ gap: theme.spacing(4) }}>
          {has('types') && (
            <View style={st.section}>
              <Text style={st.label}>{typeLabel}{value.types?.length ? ` · ${value.types.length}` : ''}</Text>
              <View style={st.wrap}>
                {typeOptions!.map((t) => (
                  <SelectChip key={t.id} label={t.label} active={(value.types ?? []).includes(t.id)} onPress={() => set({ types: toggle(value.types, t.id) })} />
                ))}
              </View>
            </View>
          )}
          {has('sports') && (
          <View style={st.section}>
            <Text style={st.label}>Sport{value.sports?.length ? ` · ${value.sports.length}` : ''}</Text>
            <View style={st.wrap}>
              {SPORT_LIST.map((s) => (
                <SelectChip key={s.id} label={`${s.icon} ${s.name}`} active={(value.sports ?? []).includes(s.id as SportId)} onPress={() => set({ sports: toggle(value.sports, s.id as SportId) })} />
              ))}
            </View>
          </View>
          )}

          {has('cities') && (
          <View style={st.section}>
            <Text style={st.label}>City{value.cities?.length ? ` · ${value.cities.length}` : ''}</Text>
            {(value.cities ?? []).length > 0 && (
              <View style={st.wrap}>
                {(value.cities ?? []).map((c) => <SelectChip key={c} label={`📍 ${c} ✕`} active onPress={() => set({ cities: toggle(value.cities, c) })} />)}
              </View>
            )}
            <TextField label="" value={cityQuery} onChange={setCityQuery} placeholder="Type a city…" autoCapitalize="words" />
            <View style={st.wrap}>
              {citySuggestions.map((c) => (
                <SelectChip key={c} label={`📍 ${c}`} active={false} onPress={() => { set({ cities: toggle(value.cities, c) }); setCityQuery(''); }} />
              ))}
              {!!cityQuery.trim() && citySuggestions.length === 0 && (
                <Text style={textStyles.muted}>Nothing in “{cityQuery.trim()}” yet.</Text>
              )}
            </View>
          </View>
          )}

          {has('gender') && (
          <View style={st.section}>
            <Text style={st.label}>Gender</Text>
            <View style={st.wrap}>
              <SelectChip label="Any" active={!value.gender} onPress={() => set({ gender: undefined })} />
              <SelectChip label="Male" active={value.gender === 'male'} onPress={() => set({ gender: 'male' })} />
              <SelectChip label="Female" active={value.gender === 'female'} onPress={() => set({ gender: 'female' })} />
            </View>
          </View>
          )}

          {has('age') && (
          <View style={st.section}>
            <Text style={st.label}>Age group</Text>
            <View style={st.wrap}>
              <SelectChip label="Any" active={!value.age} onPress={() => set({ age: undefined })} />
              {AGES.map((a) => <SelectChip key={a.id} label={a.label} active={value.age === a.id} onPress={() => set({ age: a.id })} />)}
            </View>
          </View>
          )}

          {has('verified') && (
          <View style={st.switchRow}>
            <Text style={[textStyles.body, { flex: 1 }]}>☑️ Verified players only</Text>
            <Switch value={!!value.verifiedOnly} onValueChange={(v) => set({ verifiedOnly: v })} accessibilityLabel="Verified players only" />
          </View>
          )}

          <TouchableOpacity accessibilityRole="button" onPress={() => setOpen(false)} style={st.done} activeOpacity={0.85}>
            <Text style={st.doneText}>Done</Text>
          </TouchableOpacity>
        </Card>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  filterBtn: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), backgroundColor: theme.colors.surface },
  filterBtnOn: { borderColor: theme.colors.primary },
  filterText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  filterTextOn: { color: theme.colors.primary },
  clear: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  section: { gap: theme.spacing(2) },
  label: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  done: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingVertical: theme.spacing(3), alignItems: 'center' },
  doneText: { color: '#06120D', fontWeight: '800', fontSize: theme.font.body },
});
