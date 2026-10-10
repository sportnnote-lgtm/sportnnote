/**
 * SD-104 — doubles serving order (tennis / padel). At the start of every set
 * each pair chooses which of its two players serves its first service game
 * (ITF Rules 5–6, FIP). Shown before the set's first point; a pick dispatches
 * SET_SERVE_ORDER { side, slot } and serve.ts rotates from it. Without a pick
 * the roster order applies (the chip shown as chosen).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip } from '../components/ui';
import type { Player } from '../core/types';
import type { ScoreAction } from './types';
import { serveOrderOpen, setFirstSlot, type ServeState } from './serve';

export function ServeOrderPicker({
  state, homeName, awayName, homeRoster, awayRoster, dispatch, icon,
}: {
  state: ServeState & { ended?: boolean; doubles?: boolean };
  homeName: string;
  awayName: string;
  homeRoster: Player[];
  awayRoster: Player[];
  dispatch: (a: ScoreAction) => void;
  icon: string;
}) {
  if (!serveOrderOpen(state)) return null;
  const sides = (['home', 'away'] as const).filter((t) => (t === 'home' ? homeRoster : awayRoster).length >= 2);
  if (sides.length === 0) return null;
  const setNo = state.sets.length + 1;
  return (
    <View style={st.box}>
      <Text style={st.label}>{icon} Serving order — set {setNo}</Text>
      <Text style={st.meta}>Each pair picks who serves its first game of this set. Partners then take turns.</Text>
      {sides.map((t) => {
        const roster = (t === 'home' ? homeRoster : awayRoster).slice(0, 2);
        const cur = setFirstSlot(state, t);
        return (
          <View key={t} style={st.chips}>
            <Text style={[st.meta, st.team]}>{t === 'home' ? homeName : awayName}:</Text>
            {roster.map((p, slot) => (
              <SelectChip key={p.id} label={p.fullName} active={cur === slot}
                onPress={() => dispatch({ type: 'SET_SERVE_ORDER', payload: { side: t, slot, playerId: p.id, playerName: p.fullName } })} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  box: { gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  team: { alignSelf: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
