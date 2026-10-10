/** Points & tie-breakers for one sport's league table — the organizer's control
 *  over how the standings are scored and how ties are broken. Writes reserved
 *  keys (`winPoints` / `drawPoints` / `nrPoints` / `tieBreak` and the SD-17 rule
 *  keys) into the sport's `format`, so it needs no schema of its own.
 *
 *  SD-17: kept simple — a one-tap points system (the sport's international body,
 *  or "Simple 2-1-0"), the plain win / draw / loss rows, and the tie-break order
 *  behind an "advanced" toggle where it can be reordered. */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../core/theme';
import { FieldLabel, SelectChip, textStyles } from './ui';
import {
  activePreset, availableTieBreakers, byePointsFor, noResultPoints, standingsConfigFromFormat, standingsPresets, tieBreakerLabel,
  type StandingsConfig, type TieBreaker,
} from '../data/standings';
import { structureFromFormat } from '../data/structureConfig';
import type { SportId } from '../core/types';

type Val = number | string | boolean;

const half = (n: number) => (n === 0.5 ? '½' : `${n}`);

/** The margin-aware rules in words ("3-2 → 2 / 1", "+1 for a loss by 7 or fewer"). */
export function marginRulesText(cfg: StandingsConfig): string[] {
  const out: string[] = [];
  if (cfg.setPoints) {
    out.push(`By sets: ${Object.entries(cfg.setPoints).map(([k, [w, l]]) => `${k} → ${w}–${l}`).join(', ')}`);
  }
  if (cfg.lossBonus) out.push(`+${cfg.lossBonus.points} for a loss by ${cfg.lossBonus.margin} or fewer`);
  if (cfg.shootout) out.push(`Level, decided by a shoot-out: winner ${cfg.shootout.win}, loser ${cfg.shootout.loss}`);
  if (cfg.forfeitLoss !== undefined) out.push(`${cfg.forfeitLoss} for a forfeit / walkover loss`);
  if (cfg.rankBy === 'wins') out.push('Ranked by matches won first, then points');
  return out;
}

export function PointsEditor({ sport, value, onChange }: {
  sport: SportId;
  value: Record<string, Val>;
  onChange: (key: string, val: Val) => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const cfg = standingsConfigFromFormat(sport, value);
  const available = availableTieBreakers(sport);
  const uniq = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);
  // Chess scores a draw as half a point; PKL a tie 3 and a win 5.
  const winOptions = uniq([1, 2, 3, cfg.win]);
  const drawOptions = uniq([...(sport === 'chess' ? [0, 0.5, 1] : [0, 1, 2]), cfg.draw]);
  const lossOptions = uniq([0, 1, cfg.loss]);
  // No result / abandoned (parity #04): cricket shares 1 by default, others 0.
  const nr = noResultPoints(sport, cfg);
  // Swiss bye (SD-10, D7): chess Swiss only — 1 by default, or ½ / 0 by the
  // event's rules. Shown once the structure is Swiss (or a bye value is saved).
  const isSwiss = structureFromFormat(value)?.shape === 'swiss' || typeof value.byePoints === 'number';
  const bye = sport === 'chess' && isSwiss ? byePointsFor(sport, cfg) : undefined;
  const presets = standingsPresets(sport);
  const current = activePreset(sport, value);
  const rules = marginRulesText(cfg);
  const label = (t: TieBreaker) => tieBreakerLabel(t, sport);

  // Advanced: reorder / remove / add tie-breakers (writes `tieBreak`).
  const order = cfg.order;
  const saveOrder = (next: TieBreaker[]) => onChange('tieBreak', next.join(','));
  const move = (i: number, d: -1 | 1) => {
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    saveOrder(next);
  };
  // "lots" always stays last: adding before it.
  const add = (t: TieBreaker) => {
    const lots = order.indexOf('lots');
    saveOrder(lots >= 0 ? [...order.slice(0, lots), t, ...order.slice(lots)] : [...order, t]);
  };
  const unused = available.filter((t) => !order.includes(t));

  return (
    <View style={st.wrap}>
      <FieldLabel>Points &amp; tie-breakers</FieldLabel>
      {presets.length > 0 && (
        // One tap to the international system or the simple 2-1-0 (D1).
        <View style={st.row}>
          <Text style={st.label}>Points system</Text>
          {presets.map((p) => (
            <SelectChip key={p.id} label={p.label} active={current?.id === p.id}
              onPress={() => Object.entries(p.set).forEach(([k, v]) => {
                // A "clear" ('' / off / by points) only needs writing over a key that is set.
                const isClear = v === '' || (k === 'tieRestart' && v === false) || (k === 'rankBy' && v === 'points');
                if (isClear && (value[k] === undefined || value[k] === '')) return;
                onChange(k, v);
              })} />
          ))}
          {!current && <Text style={textStyles.muted}>Custom</Text>}
        </View>
      )}
      {current && <Text style={textStyles.muted}>{current.note}.</Text>}
      <View style={st.row}>
        <Text style={st.label}>Points per win</Text>
        {winOptions.map((n) => (
          <SelectChip key={n} label={`${n}`} active={cfg.win === n} onPress={() => onChange('winPoints', n)} />
        ))}
      </View>
      <View style={st.row}>
        <Text style={st.label}>Points per draw</Text>
        {drawOptions.map((n) => (
          <SelectChip key={n} label={half(n)} active={cfg.draw === n} onPress={() => onChange('drawPoints', n)} />
        ))}
      </View>
      <View style={st.row}>
        <Text style={st.label}>Points per loss</Text>
        {lossOptions.map((n) => (
          <SelectChip key={n} label={`${n}`} active={cfg.loss === n} onPress={() => onChange('lossPoints', n)} />
        ))}
      </View>
      <View style={st.row}>
        <Text style={st.label}>No result</Text>
        {[0, 1, 2, 3].map((n) => (
          <SelectChip key={n} label={`${n}`} active={nr === n} onPress={() => onChange('nrPoints', n)} />
        ))}
      </View>
      {bye !== undefined && (
        <View style={st.row}>
          <Text style={st.label}>Swiss bye</Text>
          {[1, 0.5, 0].map((n) => (
            <SelectChip key={n} label={half(n)} active={bye === n} onPress={() => onChange('byePoints', n)} />
          ))}
        </View>
      )}
      {rules.map((r) => <Text key={r} style={st.rule}>• {r}</Text>)}

      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: advanced }} onPress={() => setAdvanced((a) => !a)} hitSlop={6} activeOpacity={0.7}>
        <Text style={st.toggle}>{advanced ? '▾' : '▸'} Tie-break order (advanced)</Text>
      </TouchableOpacity>
      {advanced && (
        <View style={st.adv}>
          {order.map((t, i) => (
            <View key={t} style={st.tbRow}>
              <Text style={st.tbName} numberOfLines={2}>{i + 1}. {label(t)}</Text>
              <SmallBtn text="↑" label={`Move ${label(t)} up`} disabled={i === 0} onPress={() => move(i, -1)} />
              <SmallBtn text="↓" label={`Move ${label(t)} down`} disabled={i === order.length - 1} onPress={() => move(i, 1)} />
              <SmallBtn text="✕" label={`Remove ${label(t)}`} disabled={order.length <= 1} onPress={() => saveOrder(order.filter((x) => x !== t))} />
            </View>
          ))}
          {cfg.pairOrder && (
            <Text style={textStyles.muted}>When only two are level: {cfg.pairOrder.map(label).join(', then ')}.</Text>
          )}
          {unused.length > 0 && (
            <View style={st.row}>
              <Text style={st.label}>Add</Text>
              {unused.map((t) => <SelectChip key={t} label={label(t)} active={false} onPress={() => add(t)} />)}
            </View>
          )}
        </View>
      )}
      <Text style={textStyles.muted}>
        {cfg.win} for a win, {half(cfg.draw)} for a draw, {cfg.loss} for a loss, {nr} each for a no result{bye !== undefined ? `, ${half(bye)} for a Swiss bye (not a game played)` : ''}. Ties broken by {order.map(label).join(', then ')}{cfg.restart ? ' — restarting among any still level' : ''}.
      </Text>
    </View>
  );
}

function SmallBtn({ text, label, disabled, onPress }: { text: string; label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}
      disabled={disabled} onPress={onPress} style={[st.small, disabled && st.smallOff]} activeOpacity={0.7}>
      <Text style={st.smallText}>{text}</Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  wrap: { gap: theme.spacing(2) },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '600', minWidth: 120 },
  rule: { color: theme.colors.text, fontSize: theme.font.small },
  toggle: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700', paddingVertical: theme.spacing(1) },
  adv: { gap: theme.spacing(2), paddingLeft: theme.spacing(2), borderLeftWidth: 2, borderLeftColor: theme.colors.border },
  tbRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  tbName: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
  small: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  smallOff: { opacity: 0.35 },
  smallText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
});
