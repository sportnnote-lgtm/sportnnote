/**
 * Carrom plugin — archetype: set-game-point (boards → games → match). ICF rules:
 * the board winner scores the opponent's coins left (+3 for a covered Queen while
 * under 22); game to 25 or after 8 boards; best of 3 games (or a single game).
 * Scoring a board = pick the winner, tap coins left, toggle the Queen.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip, textStyles } from '../../components/ui';
import type { Player } from '../../core/types';
import type { SportPlugin } from '../types';
import { init, reducer, result, boardPoints, type CarromState, type Side } from './engine';

const ScoringControls: SportPlugin<CarromState>['ScoringControls'] = ({ state, dispatch, homeName, awayName, homeRoster = [], awayRoster = [] }) => {
  const s = state as CarromState;
  // Singles: a person's name reads better than a team code ("AM").
  const nameOf = (side: Side) => {
    const r = side === 'home' ? homeRoster : awayRoster;
    return r.length === 1 ? r[0].fullName : side === 'home' ? homeName : awayName;
  };
  const [winner, setWinner] = useState<Side | null>(null);
  const [coins, setCoins] = useState(0);
  const [queen, setQueen] = useState(false);
  const [who, setWho] = useState<Player | null>(null);
  if (s.ended) return <Text style={textStyles.muted}>Match over.</Text>;

  const roster = winner ? (winner === 'home' ? homeRoster : awayRoster) : [];
  const preview = winner ? boardPoints(coins, queen, s.current[winner], s) : 0;
  const queenCounts = winner ? s.current[winner] < s.queenCutoff : true;
  const record = () => {
    if (!winner) return;
    const p = who ?? roster[0];
    dispatch({
      type: 'BOARD', side: winner, payload: { coins, queen },
      attribution: p ? { playerId: p.id, playerName: p.fullName, stat: 'points', by: preview, extra: { boards: 1, ...(queen ? { queens: 1 } : {}) } } : undefined,
    });
    setWinner(null); setCoins(0); setQueen(false); setWho(null);
  };

  return (
    <View style={{ gap: theme.spacing(4) }}>
      <Text style={ctrl.meta}>Game {s.games.length + 1} · board {s.boardsInGame + 1}{s.boardsInGame >= s.maxBoards ? ' (tie-break)' : ` of ${s.maxBoards}`} · to {s.target}</Text>
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>Board won by</Text>
        <View style={ctrl.row}>
          <Button label={nameOf('home')} variant={winner === 'home' ? 'home' : 'ghost'} style={ctrl.flex} onPress={() => { setWinner('home'); setWho(null); }} />
          <Button label={nameOf('away')} variant={winner === 'away' ? 'away' : 'ghost'} style={ctrl.flex} onPress={() => { setWinner('away'); setWho(null); }} />
        </View>
      </View>
      {winner && (
        <>
          {roster.length > 1 && (
            <View style={{ gap: theme.spacing(2) }}>
              <Text style={ctrl.label}>Finished by</Text>
              <View style={ctrl.chips}>
                {roster.map((p) => <SelectChip key={p.id} label={p.fullName} active={(who ?? roster[0]).id === p.id} onPress={() => setWho(p)} />)}
              </View>
            </View>
          )}
          <View style={{ gap: theme.spacing(2) }}>
            <Text style={ctrl.label}>Opponent's coins left</Text>
            <View style={ctrl.chips}>
              {Array.from({ length: 10 }, (_, n) => <SelectChip key={n} label={String(n)} active={coins === n} onPress={() => setCoins(n)} />)}
            </View>
          </View>
          <SelectChip label={`👑 Winner covered the Queen${queenCounts ? ' (+3)' : ' (no points at 22+)'}`} active={queen} onPress={() => setQueen(!queen)} />
          <Button label={`✓ Record board · +${preview}`} variant={winner} onPress={record} />
        </>
      )}
    </View>
  );
};

const LiveExtras: NonNullable<SportPlugin<CarromState>['LiveExtras']> = ({ state, homeName, awayName }) => {
  const s = state as CarromState;
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Text style={ctrl.label}>Games</Text>
      <View style={ctrl.chips}>
        {s.games.length === 0 ? <Text style={textStyles.muted}>Game 1 in progress…</Text>
          : s.games.map((g, i) => <Text key={i} style={ctrl.chip}>G{i + 1}: {g[0]}-{g[1]}</Text>)}
      </View>
      <Text style={ctrl.label}>Boards</Text>
      {s.boards.length === 0 ? <Text style={textStyles.muted}>No boards yet.</Text> : (
        [...s.boards].reverse().map((b, i) => (
          <Text key={i} style={textStyles.body}>
            G{b.game} · {b.winner === 'home' ? homeName : awayName} +{b.points} ({b.coins} coin{b.coins === 1 ? '' : 's'}{b.queen ? ' + 👑' : ''})
          </Text>
        ))
      )}
    </View>
  );
};

export const carromPlugin: SportPlugin<CarromState> = {
  id: 'carrom',
  name: 'Carrom',
  icon: '🎱',
  archetype: 'set-game-point',
  participantKind: 'both',
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  result: (s) => result(s),
  summary: (s) => ({
    homeScore: String(s.current.home),
    awayScore: String(s.current.away),
    statusLine: s.ended ? 'Match Over' : `Game ${s.games.length + 1} · board ${s.boardsInGame + 1}`,
    detailLine: `Games — ${s.gamesWon.home}:${s.gamesWon.away} · to ${s.target} · ${s.gamesToWin === 1 ? 'single game' : `best of ${s.gamesToWin * 2 - 1}`}`,
  }),
  ScoringControls,
  LiveExtras,
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'icf',
      options: [
        { value: 'icf', label: 'ICF (to 25 · 8 boards · best of 3)', set: { target: 25, maxBoards: 8, gamesToWin: 2 } },
        { value: 'single', label: 'Single game to 25', set: { target: 25, maxBoards: 8, gamesToWin: 1 } },
        { value: 'casual29', label: 'Casual (to 29 · best of 3)', set: { target: 29, maxBoards: 12, gamesToWin: 2 } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    {
      key: 'playersPerSide', label: 'Players', type: 'choice', default: 1,
      options: [
        { value: 1, label: 'Singles' },
        { value: 2, label: 'Doubles' },
      ],
    },
    { key: 'target', label: 'Points to win a game', type: 'number', default: 25, min: 10, max: 50, advanced: true },
    { key: 'maxBoards', label: 'Boards per game', type: 'number', default: 8, min: 1, max: 20, advanced: true, hint: 'leader after this many boards wins; level → tie-break board' },
    {
      key: 'gamesToWin', label: 'Match length', type: 'choice', default: 2,
      options: [
        { value: 2, label: 'Best of 3' },
        { value: 1, label: 'Single game' },
      ],
    },
  ],
};

const ctrl = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  chip: {
    color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700',
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3),
  },
});
