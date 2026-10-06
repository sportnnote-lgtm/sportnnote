/**
 * Chess plugin — archetype: result. One recorded result per game: who won (or a
 * draw) and how. Scoring is 1 / ½ / 0, so league tables read like a crosstable
 * and the Swiss pairing engine fits open tournaments directly. Each player is
 * credited a game (+ win/draw/loss) on their profile when the result is recorded.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip, textStyles } from '../../components/ui';
import type { Attribution, SportPlugin } from '../types';
import {
  init, reducer, points, resultString, DECISIVE, DRAWN, METHOD_LABEL,
  type ChessMethod, type ChessState, type Side,
} from './engine';

const half = (n: number) => (n === 0.5 ? '½' : String(n));

const TIME_CONTROL_LABEL: Record<string, string> = {
  classical: 'Classical', rapid: 'Rapid', blitz: 'Blitz', bullet: 'Bullet', untimed: 'Untimed',
};

const ScoringControls: SportPlugin<ChessState>['ScoringControls'] = ({ state, dispatch, homeName, awayName, homeRoster = [], awayRoster = [] }) => {
  const s = state as ChessState;
  const [winner, setWinner] = useState<Side | 'draw' | null>(null);
  const [method, setMethod] = useState<ChessMethod | null>(null);
  const [moves, setMoves] = useState('');
  // A person's full name reads better than a team code ("AM") in a 1-v-1 game.
  const nameOf = (side: Side) => (side === 'home' ? homeRoster : awayRoster)[0]?.fullName ?? (side === 'home' ? homeName : awayName);

  if (s.ended) {
    return (
      <View style={ctrl.box}>
        <Text style={ctrl.big}>{resultString(s)}</Text>
        <Text style={textStyles.body}>
          {s.winner === 'draw' ? 'Draw' : `${nameOf(s.winner as Side)} won`}{s.method ? ` · ${METHOD_LABEL[s.method]}` : ''}{s.moves ? ` · ${s.moves} moves` : ''}
        </Text>
      </View>
    );
  }

  const methods = winner === 'draw' ? DRAWN : winner ? DECISIVE : [];
  const record = () => {
    if (!winner) return;
    // Credit both players a game (+ the outcome) so it shows on their profiles.
    const credit = (side: Side): Attribution | undefined => {
      const p = (side === 'home' ? homeRoster : awayRoster)[0];
      if (!p) return undefined;
      const outcome = winner === 'draw' ? 'draws' : winner === side ? 'wins' : 'losses';
      return { playerId: p.id, playerName: p.fullName, stat: 'games', by: 1, extra: { [outcome]: 1 } };
    };
    dispatch({
      type: 'RESULT',
      side: winner === 'draw' ? undefined : winner,
      payload: { winner, method: method ?? undefined, moves: Number(moves) || undefined },
      attribution: credit('home'),
      attribution2: credit('away'),
    });
  };

  return (
    <View style={{ gap: theme.spacing(4) }}>
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>♔ White pieces</Text>
        <View style={ctrl.chips}>
          <SelectChip label={nameOf('home')} active={s.white === 'home'} onPress={() => dispatch({ type: 'SET_WHITE', payload: { side: 'home' } })} />
          <SelectChip label={nameOf('away')} active={s.white === 'away'} onPress={() => dispatch({ type: 'SET_WHITE', payload: { side: 'away' } })} />
        </View>
      </View>
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>Result</Text>
        <View style={ctrl.chips}>
          <SelectChip label={`${nameOf('home')} won`} active={winner === 'home'} onPress={() => { setWinner('home'); setMethod(null); }} />
          <SelectChip label="Draw" active={winner === 'draw'} onPress={() => { setWinner('draw'); setMethod(null); }} />
          <SelectChip label={`${nameOf('away')} won`} active={winner === 'away'} onPress={() => { setWinner('away'); setMethod(null); }} />
        </View>
      </View>
      {methods.length > 0 && (
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={ctrl.label}>How (optional)</Text>
          <View style={ctrl.chips}>
            {methods.map((m) => <SelectChip key={m} label={METHOD_LABEL[m]} active={method === m} onPress={() => setMethod(method === m ? null : m)} />)}
          </View>
          <TextInput
            style={ctrl.input}
            value={moves}
            onChangeText={(v) => setMoves(v.replace(/[^0-9]/g, ''))}
            placeholder="Moves (optional)"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="number-pad"
            accessibilityLabel="Number of moves"
          />
        </View>
      )}
      <Button label="✓ Record result" onPress={record} disabled={!winner} />
    </View>
  );
};

export const chessPlugin: SportPlugin<ChessState> = {
  id: 'chess',
  name: 'Chess',
  icon: '♟️',
  archetype: 'result',
  participantKind: 'individual',
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  result: (s) => {
    if (!s.ended || !s.winner) return null;
    const p = points(s);
    return { winner: s.winner, home: p.home, away: p.away };
  },
  summary: (s) => {
    const p = points(s);
    return {
      homeScore: s.ended ? half(p.home) : '',
      awayScore: s.ended ? half(p.away) : '',
      statusLine: s.ended
        ? `${resultString(s)}${s.method ? ` · ${METHOD_LABEL[s.method]}` : ''}`
        : `${TIME_CONTROL_LABEL[s.timeControl] ?? s.timeControl} · in play`,
      detailLine: `${s.white === 'home' ? 'Home' : 'Away'} has White`,
    };
  },
  ScoringControls,
  formatFields: [
    {
      key: 'timeControl', label: 'Time control', type: 'choice', default: 'rapid',
      hint: 'for the record — the clock is on the board',
      options: [
        { value: 'classical', label: 'Classical (60+ min)' },
        { value: 'rapid', label: 'Rapid (10–60 min)' },
        { value: 'blitz', label: 'Blitz (3–10 min)' },
        { value: 'bullet', label: 'Bullet (< 3 min)' },
        { value: 'untimed', label: 'Untimed' },
      ],
    },
  ],
};

const ctrl = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  box: { gap: theme.spacing(1), alignItems: 'center', padding: theme.spacing(4), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md },
  big: { color: theme.colors.text, fontSize: 32, fontWeight: '800' },
  input: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, color: theme.colors.text,
    borderRadius: theme.radius.md, paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), fontSize: theme.font.body,
  },
});
