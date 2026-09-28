/** Points & tie-breakers for one sport's league table — the organizer's control
 *  over how the standings are scored and how ties are broken. Writes reserved
 *  keys (`winPoints` / `drawPoints` / `tieBreak`) into the sport's `format`, so
 *  it needs no schema of its own. Football defaults to the modern 3-1-0; cricket
 *  ranks ties by net run rate. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { FieldLabel, SelectChip, textStyles } from './ui';
import { standingsConfigFromFormat, type TieBreaker } from '../data/standings';
import type { SportId } from '../core/types';

const TB_LABEL: Record<TieBreaker, string> = {
  h2h: 'head-to-head',
  nrr: 'net run rate',
  diff: 'points difference',
  for: 'points scored',
};

type Val = number | string | boolean;

export function PointsEditor({ sport, value, onChange }: {
  sport: SportId;
  value: Record<string, Val>;
  onChange: (key: string, val: Val) => void;
}) {
  const cfg = standingsConfigFromFormat(sport, value);
  // The tie-breakers that apply to this sport (cricket ranks ties by NRR, others by
  // points/goal difference). The organizer picks which one applies FIRST; the rest
  // keep their default order behind it.
  const available: TieBreaker[] = sport === 'cricket' ? ['h2h', 'nrr', 'for'] : ['h2h', 'diff', 'for'];
  const primary = cfg.order[0] ?? available[0];
  const setPrimary = (p: TieBreaker) => onChange('tieBreak', [p, ...available.filter((x) => x !== p)].join(','));

  return (
    <View style={st.wrap}>
      <FieldLabel>Points &amp; tie-breakers</FieldLabel>
      <View style={st.row}>
        <Text style={st.label}>Points per win</Text>
        {[1, 2, 3].map((n) => (
          <SelectChip key={n} label={`${n}`} active={cfg.win === n} onPress={() => onChange('winPoints', n)} />
        ))}
      </View>
      <View style={st.row}>
        <Text style={st.label}>Points per draw</Text>
        {[0, 1, 2].map((n) => (
          <SelectChip key={n} label={`${n}`} active={cfg.draw === n} onPress={() => onChange('drawPoints', n)} />
        ))}
      </View>
      <View style={st.row}>
        <Text style={st.label}>Points per loss</Text>
        {[0, 1].map((n) => (
          <SelectChip key={n} label={`${n}`} active={cfg.loss === n} onPress={() => onChange('lossPoints', n)} />
        ))}
      </View>
      <View style={st.row}>
        <Text style={st.label}>Break ties first by</Text>
        {available.map((t) => (
          <SelectChip key={t} label={TB_LABEL[t]} active={primary === t} onPress={() => setPrimary(t)} />
        ))}
      </View>
      <Text style={textStyles.muted}>
        {cfg.win} for a win, {cfg.draw} for a draw, {cfg.loss} for a loss. Ties broken by {cfg.order.map((t) => TB_LABEL[t]).join(', then ')}.
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { gap: theme.spacing(2) },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '600', minWidth: 120 },
});
