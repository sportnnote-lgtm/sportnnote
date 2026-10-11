/**
 * SD-62 / SD-74 — table tennis and badminton DOUBLES: who serves first and who
 * receives first in this game, by name. Shown before each game's first point
 * (the current choice — roster order until picked — is highlighted; scoring is
 * never blocked), then a "Fix serving order" link mid-game (`v:2`: the score
 * never moves, only who serves to whom re-derives). Dispatches
 * SET_SERVE_ORDER { server?, receiver? } (player ids) — see doublesOrder.ts.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip } from '../components/ui';
import type { Player } from '../core/types';
import type { ScoreAction } from './types';

type Side = 'home' | 'away';

export function DoublesOrderPicker({
  icon, gameNo, atGameStart, servingSide, homeName, awayName, homeRoster, awayRoster,
  server, receiver, receiverPick = true, receiverNote, dispatch,
}: {
  icon: string;
  gameNo: number;
  /** the current game is still 0-0 */
  atGameStart: boolean;
  /** the pair serving first in this game */
  servingSide: Side;
  homeName: string;
  awayName: string;
  homeRoster: Player[];
  awayRoster: Player[];
  /** the game's first server / receiver as derived now (ids) */
  server?: string;
  receiver?: string;
  /** false → the receiver follows from the rules (table tennis game 2+) */
  receiverPick?: boolean;
  /** shown instead of the receiver chips */
  receiverNote?: string;
  dispatch: (a: ScoreAction) => void;
}) {
  const [fix, setFix] = useState(false);
  const H = homeRoster.slice(0, 2), A = awayRoster.slice(0, 2);
  if (H.length < 2 || A.length < 2) return null;
  if (!atGameStart && !fix) {
    return <Text style={st.link} onPress={() => setFix(true)} accessibilityRole="button">Fix serving order (game {gameNo})</Text>;
  }
  const v2 = atGameStart ? {} : { v: 2 };
  const recvSide: Side = servingSide === 'home' ? 'away' : 'home';
  const rosterOf = (s: Side) => (s === 'home' ? H : A);
  const nameOf = (s: Side) => (s === 'home' ? homeName : awayName);
  const row = (side: Side, verb: string, cur: string | undefined, key: 'server' | 'receiver') => (
    <View style={st.chips}>
      <Text style={[st.meta, st.team]}>{nameOf(side)} {verb}:</Text>
      {rosterOf(side).map((p) => (
        <SelectChip key={p.id} label={p.fullName} active={cur === p.id}
          onPress={() => { if (cur !== p.id) dispatch({ type: 'SET_SERVE_ORDER', payload: { [key]: p.id, playerName: p.fullName, ...v2 } }); }} />
      ))}
    </View>
  );
  return (
    <View style={st.box}>
      <Text style={st.label}>{icon} {atGameStart ? `Serving order — game ${gameNo}` : `Who served and received first in game ${gameNo}?`}</Text>
      <Text style={st.meta}>{atGameStart ? 'Pick who serves first and who receives first. Then the app names every server and receiver.' : 'Only who serves to whom changes — the score stays. Serve stats re-derive.'}</Text>
      {row(servingSide, 'serves first', server, 'server')}
      {receiverPick ? row(recvSide, 'receives first', receiver, 'receiver') : receiverNote ? <Text style={st.meta}>{receiverNote}</Text> : null}
      {!atGameStart && <Text style={st.link} onPress={() => setFix(false)} accessibilityRole="button">Done</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  box: { gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  team: { alignSelf: 'center' },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
