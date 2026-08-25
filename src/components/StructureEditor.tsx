/** The details of a sport's competition structure — how many groups, how many
 *  advance, single/double round-robin, and whether a Super phase precedes the
 *  knockout. The overall shape (league / knockout / groups→knockout) comes from
 *  the tournament's Structure picker; this fills in the specifics and persists
 *  them on the sport's format, so the auto-generate tool and the tournament page
 *  read one source of truth. Renders only what the shape needs. */
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { FieldLabel, SelectChip, textStyles } from './ui';
import { structureFromFormat, describeStructure, type StructureShape } from '../data/structureConfig';

type Val = number | string | boolean;
const DEFAULT = { groupCount: 4, advanceTopN: 2, advanceBest: 0, doubleRound: false, superPhase: false };

export function StructureEditor({ shape, value, onChange }: {
  shape: StructureShape;
  value: Record<string, Val>;
  onChange: (key: string, val: Val) => void;
}) {
  // Keep the persisted shape in step with the tournament's Structure picker, so
  // the saved config is always complete (drives the tournament-page summary).
  useEffect(() => {
    if (value.structShape !== shape) onChange('structShape', shape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape]);

  const cfg = structureFromFormat({ ...value, structShape: shape }) ?? { shape, ...DEFAULT };
  const isGroups = shape === 'groups';

  // A straight knockout has nothing extra to configure here.
  if (shape === 'knockout') {
    return <Text style={textStyles.muted}>{describeStructure(cfg)}.</Text>;
  }

  return (
    <View style={st.wrap}>
      <FieldLabel>{isGroups ? 'Group stage' : 'League details'}</FieldLabel>
      <SelectChip
        label={cfg.doubleRound ? '✓ Home & away (double round-robin)' : 'Home & away (double round-robin)'}
        active={cfg.doubleRound}
        onPress={() => onChange('structDouble', !cfg.doubleRound)}
      />

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
  block: { gap: theme.spacing(2), paddingLeft: theme.spacing(2), borderLeftWidth: 2, borderLeftColor: theme.colors.border },
  line: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '600', minWidth: 120 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  stepBtn: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3) },
  stepTxt: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.body },
  stepVal: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.h3, minWidth: 22, textAlign: 'center' },
});
