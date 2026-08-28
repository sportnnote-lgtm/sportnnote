/** A sport's competition structure, on its own — the shape (league / knockout /
 *  groups→knockout) and its specifics (group count, how many advance, single or
 *  double round-robin, a Super phase). Per sport, so a meet can run football as
 *  groups→knockout and badminton as a straight knockout. Persists on the sport's
 *  format; the tournament's coarse `structure` label is derived from these. */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { FieldLabel, SelectChip, textStyles } from './ui';
import { structureFromFormat, describeStructure, type StructureShape } from '../data/structureConfig';

type Val = number | string | boolean;
const DEFAULT = { groupCount: 4, advanceTopN: 2, advanceBest: 0, doubleRound: false, superPhase: false };

export function StructureEditor({ value, onChange }: {
  value: Record<string, Val>;
  onChange: (key: string, val: Val) => void;
}) {
  const cfg = structureFromFormat(value) ?? { shape: 'league' as StructureShape, ...DEFAULT };
  const shape = cfg.shape;
  const isGroups = shape === 'groups';

  return (
    <View style={st.wrap}>
      <FieldLabel>Structure</FieldLabel>
      <View style={st.chips}>
        <SelectChip label="🔁 League" active={shape === 'league'} onPress={() => onChange('structShape', 'league')} />
        <SelectChip label="🏆 Knockout" active={shape === 'knockout'} onPress={() => onChange('structShape', 'knockout')} />
        <SelectChip label="👥 Groups → knockout" active={isGroups} onPress={() => onChange('structShape', 'groups')} />
      </View>

      {shape !== 'knockout' && (
        <SelectChip
          label={cfg.doubleRound ? '✓ Home & away (double round-robin)' : 'Home & away (double round-robin)'}
          active={cfg.doubleRound}
          onPress={() => onChange('structDouble', !cfg.doubleRound)}
        />
      )}

      {isGroups && (
        <View style={st.block}>
          <View style={st.line}>
            <Text style={st.label}>Groups</Text>
            <Stepper value={cfg.groupCount} min={2} max={16} onChange={(v) => onChange('structGroups', v)} />
          </View>
          <View style={st.line}>
            <Text style={st.label}>Advance per group</Text>
            {[1, 2, 4].map((n) => <SelectChip key={n} label={`${n}`} active={cfg.advanceTopN === n} onPress={() => onChange('structTopN', n)} />)}
          </View>
          <View style={st.line}>
            <Text style={st.label}>+ best-placed</Text>
            <Stepper value={cfg.advanceBest} min={0} max={16} onChange={(v) => onChange('structBest', v)} />
          </View>
          <SelectChip
            label={cfg.superPhase ? '✓ Super round-robin before the knockout' : 'Super round-robin before the knockout'}
            active={cfg.superPhase}
            onPress={() => onChange('structSuper', !cfg.superPhase)}
          />
        </View>
      )}

      <Text style={textStyles.muted}>{describeStructure(cfg)}.</Text>
    </View>
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <View style={st.stepper}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fewer" style={st.stepBtn} onPress={() => onChange(clamp(value - 1))}><Text style={st.stepTxt}>−</Text></TouchableOpacity>
      <Text style={st.stepVal}>{value}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="More" style={st.stepBtn} onPress={() => onChange(clamp(value + 1))}><Text style={st.stepTxt}>+</Text></TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { gap: theme.spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  block: { gap: theme.spacing(2), paddingLeft: theme.spacing(2), borderLeftWidth: 2, borderLeftColor: theme.colors.border },
  line: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '600', minWidth: 120 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  stepBtn: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3) },
  stepTxt: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.body },
  stepVal: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.h3, minWidth: 22, textAlign: 'center' },
});
