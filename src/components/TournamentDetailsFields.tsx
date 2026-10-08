/** Tournament details sections shared by Create & Edit (parity #09): images,
 *  city / grounds / category, per-sport "basics", organiser contact and the
 *  about & rules text. Each section is its own component so the screens can
 *  interleave them with their existing fields in the spec's order:
 *  Images → Name → Place (city, grounds, category) → Dates & Sports (+ basics)
 *  → Contact & About → the rest. */
import React, { useState, useSyncExternalStore } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Button, FieldLabel, SelectChip, TextField, textStyles } from './ui';
import { LogoPicker } from './LogoPicker';
import { SportFormatEditor, type FormatVal } from './FormatEditor';
import { getSport } from '../sports/registry';
import { tournamentDraft } from '../data/tournamentDraft';
import { EVENT_CATEGORIES, addGround, inlineFieldKeys } from '../data/tournamentForm';
import type { TournamentDetails } from '../data/repos';
import type { EventCategory, SportId } from '../core/types';

export const ABOUT_MAX = 4000;

/** The form's editable details (images are handled by TournamentImagesField). */
export interface DetailsValue {
  city: string;
  grounds: string[];
  eventCategory?: EventCategory;
  organiserPhone: string;
  organiserEmail: string;
  about: string;
}

export const emptyDetails = (): DetailsValue => ({ city: '', grounds: [], organiserPhone: '', organiserEmail: '', about: '' });

/** Form value → repo payload: trimmed, blanks become null (= cleared / hidden). */
export function detailsPayload(v: DetailsValue): TournamentDetails {
  const s = (x: string) => x.trim() || null;
  return {
    city: s(v.city),
    grounds: v.grounds,
    eventCategory: v.eventCategory ?? null,
    organiserPhone: s(v.organiserPhone),
    organiserEmail: s(v.organiserEmail),
    about: v.about.trim().slice(0, ABOUT_MAX) || null,
  };
}

/** 1. Banner (3:1, full width) with the circular logo overlapping bottom-left. */
export function TournamentImagesField({ logoUrl, bannerUrl, onLogo, onBanner }: {
  logoUrl?: string;
  bannerUrl?: string;
  onLogo: (url: string) => void | Promise<void>;
  onBanner: (url: string) => void | Promise<void>;
}) {
  return (
    <View style={st.images}>
      <LogoPicker shape="banner" kind="tournament-banner" aspect={[3, 1]} label="Add banner" logoUrl={bannerUrl} canManage onPick={onBanner} />
      <View style={[st.logoWrap, bannerUrl ? st.logoOverlap : null]}>
        <LogoPicker shape="circle" kind="tournament-logo" size={64} label="Add logo" logoUrl={logoUrl} canManage onPick={onLogo} />
      </View>
    </View>
  );
}

/** 3–5. City, grounds (removable chips + add) and the optional event category. */
export function TournamentPlaceFields({ value, onChange, knownVenues }: {
  value: DetailsValue;
  onChange: (patch: Partial<DetailsValue>) => void;
  /** venues used before (knownVenueNames of all matches) — offered as suggestions */
  knownVenues: string[];
}) {
  const [draft, setDraft] = useState('');
  const add = (name: string) => { onChange({ grounds: addGround(value.grounds, name) }); setDraft(''); };
  const q = draft.trim().toLowerCase();
  const have = new Set(value.grounds.map((g) => g.toLowerCase()));
  const suggestions = knownVenues.filter((v) => !have.has(v.toLowerCase()) && (!q || v.toLowerCase().includes(q))).slice(0, 6);

  return (
    <View style={st.section}>
      <TextField label="City" value={value.city} onChange={(city) => onChange({ city })} placeholder="e.g. Hyderabad" autoCapitalize="words" />

      <FieldLabel hint="Where matches are played — they lead the venue choices when scheduling.">Grounds (optional)</FieldLabel>
      {value.grounds.length > 0 && (
        <View style={st.chips}>
          {value.grounds.map((g) => (
            <TouchableOpacity key={g} accessibilityRole="button" accessibilityLabel={`Remove ${g}`} style={st.ground} activeOpacity={0.8}
              onPress={() => onChange({ grounds: value.grounds.filter((x) => x !== g) })}>
              <Text style={st.groundText}>📍 {g}  ✕</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={st.addRow}>
        <View style={st.flex}><TextField label="" value={draft} onChange={setDraft} placeholder="Add a ground, e.g. Main Ground" autoCapitalize="words" /></View>
        <Button label="Add" variant="ghost" onPress={() => add(draft)} disabled={!draft.trim()} />
      </View>
      {suggestions.length > 0 && (
        <View style={st.chips}>
          {suggestions.map((v) => <SelectChip key={v} label={`＋ ${v}`} active={false} onPress={() => add(v)} />)}
        </View>
      )}

      <FieldLabel>Category (optional)</FieldLabel>
      <View style={st.chips}>
        {EVENT_CATEGORIES.map((c) => (
          <SelectChip key={c.key} label={c.label} active={value.eventCategory === c.key}
            onPress={() => onChange({ eventCategory: value.eventCategory === c.key ? undefined : c.key })} />
        ))}
      </View>
    </View>
  );
}

/** 6. "{icon} {Sport} basics" per chosen sport — the preset plus the fields a
 *  sport flags `onCreate`, bound to the shared tournamentDraft. Sports with no
 *  inline fields (e.g. chess) render nothing. */
export function SportBasics({ sports, onChanged }: { sports: SportId[]; onChanged?: () => void }) {
  useSyncExternalStore(tournamentDraft.subscribe, tournamentDraft.getVersion);
  return (
    <>
      {sports.map((s) => {
        const keys = inlineFieldKeys(getSport(s).formatFields);
        if (!keys.length) return null;
        return (
          <SportFormatEditor
            key={s}
            sport={s}
            heading="basics"
            onlyKeys={keys}
            value={tournamentDraft.get(s) as Record<string, FormatVal>}
            onChange={(k, v) => { tournamentDraft.setField(s, k, v); onChanged?.(); }}
          />
        );
      })}
    </>
  );
}

/** 7–8. Organiser contact (public only when filled in) and about & rules. */
export function TournamentContactFields({ value, onChange }: {
  value: DetailsValue;
  onChange: (patch: Partial<DetailsValue>) => void;
}) {
  return (
    <View style={st.section}>
      <FieldLabel>Organiser contact</FieldLabel>
      <TextField label="Phone" value={value.organiserPhone} onChange={(organiserPhone) => onChange({ organiserPhone })} placeholder="98765 43210" autoCapitalize="none" />
      <TextField label="Email (optional)" value={value.organiserEmail} onChange={(organiserEmail) => onChange({ organiserEmail })} placeholder="sports@school.edu" autoCapitalize="none" />
      <Text style={st.hint}>Shown on the tournament page. Clear it to hide.</Text>

      <TextField label="About & rules" value={value.about} multiline
        onChange={(about) => onChange({ about: about.slice(0, ABOUT_MAX) })}
        placeholder="Prizes, entry fee, eligibility, rules…" />
      {value.about.length > ABOUT_MAX * 0.9 && (
        <Text style={textStyles.muted}>{value.about.length}/{ABOUT_MAX}</Text>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  section: { gap: theme.spacing(3) },
  images: { gap: theme.spacing(2) },
  logoWrap: { alignSelf: 'flex-start', marginLeft: theme.spacing(3) },
  logoOverlap: { marginTop: -theme.spacing(10) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  flex: { flex: 1 },
  ground: {
    backgroundColor: theme.colors.primary + '22', borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1.5), paddingHorizontal: theme.spacing(3),
  },
  groundText: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
  hint: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
});
