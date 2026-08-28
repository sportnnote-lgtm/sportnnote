/** Multi-sport scoring for a meet — how the OVERALL table is decided across the
 *  sports. Either the usual sum of league points, or medal/position points: each
 *  sport's finishing position awards points (1st = most … down the field),
 *  optionally weighted per sport, summed into one overall ranking. Only shown for
 *  a multi-sport tournament. Edits `Tournament.scoring`. */
import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { FieldLabel, SelectChip, textStyles } from './ui';
import { getSport } from '../sports/registry';
import type { SportId, TournamentScoring } from '../core/types';

const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
};

/** A default N-position table: N points for 1st down to 1 for last. */
const defaultPoints = (positions: number): number[] => Array.from({ length: positions }, (_, i) => positions - i);

export function MedalScoringEditor({ sports, value, onChange }: {
  sports: SportId[];
  value: TournamentScoring | undefined;
  onChange: (scoring: TournamentScoring) => void;
}) {
  const mode = value?.mode ?? 'match';
  const points = value?.positionPoints ?? [];
  const weights = value?.sportWeights ?? {};

  const setMode = (m: 'match' | 'position') => {
    if (m === 'match') { onChange({ ...value, mode: 'match' }); return; }
    onChange({ mode: 'position', positionPoints: points.length ? points : defaultPoints(sports.length >= 2 ? 8 : 8), sportWeights: weights });
  };
  const setPoints = (next: number[]) => onChange({ mode: 'position', positionPoints: next, sportWeights: weights });
  const setPosCount = (n: number) => {
    const next = Array.from({ length: n }, (_, i) => points[i] ?? (n - i));
    setPoints(next);
  };
  const setWeight = (sport: SportId, w: number) => onChange({ mode: 'position', positionPoints: points, sportWeights: { ...weights, [sport]: w } });

  return (
    <View style={st.wrap}>
      <FieldLabel>Overall scoring (multi-sport)</FieldLabel>
      <View style={st.chips}>
        <SelectChip label="➕ Sum of match points" active={mode === 'match'} onPress={() => setMode('match')} />
        <SelectChip label="🏅 Medal / position points" active={mode === 'position'} onPress={() => setMode('position')} />
      </View>
      <Text style={textStyles.muted}>
        {mode === 'match'
          ? 'Overall = each team’s league points added up across every sport.'
          : 'Overall = points for each team’s finishing position in every sport, added up (Olympics / sports-day style).'}
      </Text>

      {mode === 'position' && (
        <View style={st.block}>
          <View style={st.line}>
            <Text style={st.label}>Ranked positions</Text>
            <Counter value={points.length} min={2} max={32} onChange={setPosCount} />
          </View>
          <Text style={textStyles.muted}>Points awarded for each finishing position, in every sport:</Text>
          <View style={st.grid}>
            {points.map((p, i) => (
              <View key={i} style={st.cell}>
                <Text style={st.pos}>{ordinal(i + 1)}</Text>
                <TextInput
                  style={st.input}
                  keyboardType="number-pad"
                  value={String(p)}
                  onChangeText={(t) => { const v = parseInt(t.replace(/[^0-9]/g, ''), 10); const next = [...points]; next[i] = Number.isNaN(v) ? 0 : v; setPoints(next); }}
                  accessibilityLabel={`Points for ${ordinal(i + 1)} place`}
                />
              </View>
            ))}
          </View>

          {sports.length > 1 && (
            <>
              <FieldLabel>Per-sport weight (optional)</FieldLabel>
              <Text style={textStyles.muted}>Multiply a sport’s position points — e.g. a marquee sport worth 2×.</Text>
              {sports.map((s) => (
                <View key={s} style={st.line}>
                  <Text style={st.label}>{getSport(s).icon} {getSport(s).name}</Text>
                  <Counter value={weights[s] ?? 1} min={1} max={5} onChange={(w) => setWeight(s, w)} suffix="×" />
                </View>
              ))}
            </>
          )}
        </View>
      )}
    </View>
  );
}

function Counter({ value, min, max, onChange, suffix }: { value: number; min: number; max: number; onChange: (v: number) => void; suffix?: string }) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <View style={st.counter}>
      <Text style={st.cbtn} onPress={() => onChange(clamp(value - 1))} accessibilityRole="button" accessibilityLabel="Fewer">−</Text>
      <Text style={st.cval}>{value}{suffix ?? ''}</Text>
      <Text style={st.cbtn} onPress={() => onChange(clamp(value + 1))} accessibilityRole="button" accessibilityLabel="More">+</Text>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { gap: theme.spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  block: { gap: theme.spacing(3), paddingLeft: theme.spacing(2), borderLeftWidth: 2, borderLeftColor: theme.colors.border },
  line: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '600', minWidth: 140 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  cell: { alignItems: 'center', gap: 2, width: 56 },
  pos: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  input: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, color: theme.colors.text, fontWeight: '800', fontSize: theme.font.body, textAlign: 'center', paddingVertical: theme.spacing(1.5), width: 52 },
  counter: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  cbtn: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.h3, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingVertical: theme.spacing(0.5), paddingHorizontal: theme.spacing(2.5), overflow: 'hidden' },
  cval: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.body, minWidth: 32, textAlign: 'center' },
});
