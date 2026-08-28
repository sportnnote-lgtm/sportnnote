/** The per-sport setup entry on the Create / Edit tournament forms: one button
 *  per chosen sport that opens that sport's own settings page. Also the helpers
 *  that (a) derive the tournament's coarse `structure` label from the per-sport
 *  shapes, and (b) migrate an existing tournament's tournament-wide structure /
 *  knockout decider onto the per-sport formats so old tournaments open correctly
 *  in the new per-sport screens. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, FieldLabel, textStyles } from './ui';
import { getSport } from '../sports/registry';
import { structureFromFormat, structureFieldFor, shapeForStructure, type StructureShape } from '../data/structureConfig';
import type { SportId, Tournament, TournamentStructure } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Format = Record<string, number | string | boolean>;
type FormatMap = Partial<Record<SportId, Format>>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const rank = (sh: StructureShape) => (sh === 'groups' ? 2 : sh === 'knockout' ? 1 : 0);

/** The coarse tournament-wide structure implied by the per-sport shapes (the
 *  richest one wins, so the profile label + bracket entry stay representative). */
export function coarseStructureFrom(formats: FormatMap, sports: SportId[]): TournamentStructure {
  let top: StructureShape = 'league';
  for (const s of sports) {
    const sh = structureFromFormat(formats[s])?.shape;
    if (sh && rank(sh) > rank(top)) top = sh;
  }
  return structureFieldFor(top);
}

/** Seed per-sport formats from an existing tournament, folding its old
 *  tournament-wide structure + (football) knockout decider into each sport so the
 *  new per-sport screens show the right current values. */
export function migrateFormatsForSettings(t: Pick<Tournament, 'formats' | 'sports' | 'structure' | 'knockoutFormat'>): FormatMap {
  const out: FormatMap = { ...(t.formats ?? {}) };
  const coarseShape = shapeForStructure(t.structure);
  for (const s of t.sports ?? []) {
    const f: Format = { ...(out[s] ?? {}) };
    if (f.structShape === undefined) f.structShape = coarseShape;
    if (s === 'football' && f.decider === undefined && t.knockoutFormat) {
      f.decider = t.knockoutFormat.decider;
      if (t.knockoutFormat.extraTimeMinutes != null) f.extraTimeMinutes = t.knockoutFormat.extraTimeMinutes;
      if (t.knockoutFormat.extraTimeSubs != null) f.extraTimeSubs = t.knockoutFormat.extraTimeSubs;
    }
    out[s] = f;
  }
  return out;
}

export function SportSettingsButtons({ sports }: { sports: SportId[] }) {
  const nav = useNavigation<Nav>();
  if (sports.length === 0) return null;
  return (
    <View style={st.wrap}>
      <FieldLabel>Set up each sport</FieldLabel>
      {sports.map((s) => (
        <Button key={s} label={`⚙️ ${getSport(s).icon} ${getSport(s).name} settings ›`} variant="ghost" onPress={() => nav.navigate('SportSettings', { sport: s })} />
      ))}
      <Text style={textStyles.muted}>Structure, format and tie rules per sport — only what applies to each one.</Text>
    </View>
  );
}

const st = StyleSheet.create({ wrap: { gap: theme.spacing(2) } });
