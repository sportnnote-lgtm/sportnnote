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
import { SetLineBoard } from '../SetLineBoard';
import { MatchBoxScore } from '../../components/BoxScore';
import { carromBox } from '../boxSources';
import { init, reducer, result, boardPoints, creditPoints, creditedPoints, summary, scoreLine, lineScore, standingsUnits, type CarromState, type Side, type Slam } from './engine';
import { carromStatTotals, creditedPlayers } from './totals';

const ScoringControls: SportPlugin<CarromState>['ScoringControls'] = ({ state, dispatch, homeName, awayName, homeRoster = [], awayRoster = [] }) => {
  const s = state as CarromState;
  const perSide = s.perSide ?? 1;
  // Singles: a person's name reads better than a team code ("AM").
  const nameOf = (side: Side) => {
    const r = side === 'home' ? homeRoster : awayRoster;
    return r.length === 1 ? r[0].fullName : side === 'home' ? homeName : awayName;
  };
  const [winner, setWinner] = useState<Side | null>(null);
  const [coins, setCoins] = useState(0);
  const [queen, setQueen] = useState(false);
  const [slam, setSlam] = useState<Slam | null>(null);
  // "Played by" (a roster bigger than the side) — kept from board to board
  const [picked, setPicked] = useState<Record<Side, string[]>>({ home: [], away: [] });
  if (s.ended) return <Text style={textStyles.muted}>Match over.</Text>;

  const roster = winner ? (winner === 'home' ? homeRoster : awayRoster) : [];
  const players = winner ? creditedPlayers(roster, perSide, picked[winner]) : [];
  // SD-37: the game score counts at most to 25, and so do the players' points
  const value = winner ? boardPoints(coins, queen, s.current[winner], s) : 0;
  const credit = winner ? creditPoints(coins, queen, s.current[winner], s) : 0;
  const queenCounts = winner ? s.current[winner] < s.queenCutoff : true;
  const togglePick = (side: Side, id: string) => setPicked((cur) => {
    const now = creditedPlayers(roster, perSide, cur[side]).map((p) => p.id);
    const next = now.includes(id) ? now.filter((x) => x !== id) : [...now, id].slice(-perSide);
    return { ...cur, [side]: next.length ? next : now };
  });
  const record = () => {
    if (!winner) return;
    const attr = (p: Player) => ({ playerId: p.id, playerName: p.fullName, stat: 'points', by: credit, extra: { boards: 1, ...(queen ? { queens: 1 } : {}) } });
    dispatch({
      type: 'BOARD', side: winner, payload: { coins, queen, ...(slam ? { slam } : {}) },
      // SD-37: a board is the side's — both doubles partners are credited
      attribution: players[0] ? attr(players[0]) : undefined,
      attribution2: players[1] ? attr(players[1]) : undefined,
    });
    setWinner(null); setCoins(0); setQueen(false); setSlam(null);
  };

  return (
    <View style={{ gap: theme.spacing(4) }}>
      <Text style={ctrl.meta}>Game {s.games.length + 1} · board {s.boardsInGame + 1}{s.boardsInGame >= s.maxBoards ? ' (tie-break)' : ` of ${s.maxBoards}`} · to {s.target}</Text>
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>Board won by</Text>
        <View style={ctrl.row}>
          <Button label={nameOf('home')} variant={winner === 'home' ? 'home' : 'ghost'} style={ctrl.flex} onPress={() => setWinner('home')} />
          <Button label={nameOf('away')} variant={winner === 'away' ? 'away' : 'ghost'} style={ctrl.flex} onPress={() => setWinner('away')} />
        </View>
      </View>
      {winner && (
        <>
          {roster.length > perSide && (
            <View style={{ gap: theme.spacing(2) }}>
              <Text style={ctrl.label}>Played by</Text>
              <View style={ctrl.chips}>
                {roster.map((p) => <SelectChip key={p.id} label={p.fullName} active={players.some((x) => x.id === p.id)} onPress={() => togglePick(winner, p.id)} />)}
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
          <View style={{ gap: theme.spacing(2) }}>
            <Text style={ctrl.label}>Slam? <Text style={ctrl.meta}>(finished in the first turn · optional)</Text></Text>
            <View style={ctrl.chips}>
              <SelectChip label="⚪ White slam · broke" active={slam === 'white'} onPress={() => setSlam(slam === 'white' ? null : 'white')} />
              <SelectChip label="⚫ Black slam · didn't break" active={slam === 'black'} onPress={() => setSlam(slam === 'black' ? null : 'black')} />
            </View>
          </View>
          <Button label={`✓ Record board · +${credit}${credit < value ? ` (game at ${s.target})` : ''}`} variant={winner} onPress={record} />
        </>
      )}
    </View>
  );
};

const LiveExtras: NonNullable<SportPlugin<CarromState>['LiveExtras']> = ({ state, homeName, awayName, homeColor, awayColor }) => {
  const s = state as CarromState;
  // SD-37: a game-winning board shows what it added (the game is written at 25)
  const credited = creditedPoints(s);
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Text style={ctrl.label}>Games</Text>
      <View style={ctrl.chips}>
        {s.games.length === 0 ? <Text style={textStyles.muted}>Game 1 in progress…</Text>
          : s.games.map((g, i) => <Text key={i} style={ctrl.chip}>G{i + 1}: {g[0]}-{g[1]}</Text>)}
      </View>
      {/* SD-23: points / boards / queens per side, per game */}
      {s.boards.length > 0 && (
        <MatchBoxScore sport="carrom" source={carromBox(s)} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} />
      )}
      <Text style={ctrl.label}>Boards</Text>
      {s.boards.length === 0 ? <Text style={textStyles.muted}>No boards yet.</Text> : (
        s.boards.map((b, i) => ({ b, pts: credited[i] })).reverse().map(({ b, pts }, i) => (
          <Text key={i} style={textStyles.body}>
            G{b.game} · {b.winner === 'home' ? homeName : awayName} +{pts} ({b.coins} coin{b.coins === 1 ? '' : 's'}{b.queen ? ' + 👑' : ''}){b.slam ? ` · ${b.slam === 'white' ? '⚪ White' : '⚫ Black'} slam` : ''}
          </Text>
        ))
      )}
    </View>
  );
};

/** SD-20 — the LineScoreboard: GAMES won + a column of board points per game,
 *  the live game highlighted. */
const CarromScoreboard: NonNullable<SportPlugin<CarromState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live, closed }) => {
  const s = state as CarromState;
  return (
    <SetLineBoard
      ls={lineScore(s)} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} live={live} closed={closed}
      status={`Game ${s.games.length + 1} · board ${s.boardsInGame + 1}`}
      bestOf={s.gamesToWin === 1 ? `single game to ${s.target}` : `best of ${s.gamesToWin * 2 - 1} · to ${s.target}`}
    />
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
  // SD-17: board points over every game (points-difference tie-break).
  standingsUnits,
  // SD-01: once ended → games won + "25-18, 12-25, 25-20" (never the reset 0 : 0).
  summary,
  scoreLine,
  // SD-20: the line score (board grid, a game closed by hand).
  lineScore,
  // SD-37: absolute lines at completion — both partners, capped points, games,
  // boards played, slams, 25-0 games (src/sports/carrom/totals.ts)
  statTotals: carromStatTotals,
  statTotalsNeedsPlayers: true,
  statTotalsPartial: true,
  Scoreboard: CarromScoreboard,
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
