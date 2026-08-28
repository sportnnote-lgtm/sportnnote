/**
 * Badminton plugin — archetype: set-game-point. Best of 3 games to 21 (win by
 * 2, cap 30). Each rally is logged to the play-by-play with the point-winner,
 * and game wins are highlighted. Points are attributed to players for profiles.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip, textStyles } from '../../components/ui';
import { LiveTimeline } from '../LiveTimeline';
import type { LiveEvent } from '../liveEvents';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';
import { courtFormation, makeCourt } from '../courts';
import { pointVoice } from '../voiceParsers';
import { BadmintonBoxScore } from './BoxScore';
import { LineScoreboard } from '../../components/LineScoreboard';
import { RallyPointEditor } from '../RallyPointEditor';
import { replayPoints, type PointInput } from '../rallyEdit';

const TARGET = 21;
const CAP = 30;
const GAMES_TO_WIN = 2;

export interface BadmintonState {
  current: { home: number; away: number };
  games: Array<[number, number]>;
  gamesWon: { home: number; away: number };
  /** points to win a game, win by 2 (format: pointsPerGame) */
  target: number;
  /** hard ceiling that settles a long deuce */
  cap: number;
  /** at the cap the next point wins (golden point); off = pure win-by-2 */
  goldenPoint: boolean;
  /** games a side must win to take the match (format: gamesToWin) */
  gamesToWin: number;
  events: LiveEvent[];
  seq: number;
  ended: boolean;
}

const init = (config?: Record<string, unknown>): BadmintonState => {
  const target = Number(config?.pointsPerGame ?? TARGET);
  return {
    current: { home: 0, away: 0 },
    games: [],
    gamesWon: { home: 0, away: 0 },
    target,
    cap: Number(config?.cap ?? target + (CAP - TARGET)), // 21→30 by default; presets can override (5×11 caps at 15)
    goldenPoint: config?.goldenPoint !== false, // default on (BWF 29-29 golden point)
    gamesToWin: Number(config?.gamesToWin ?? GAMES_TO_WIN),
    events: [],
    seq: 0,
    ended: false,
  };
};

function gameWinner(h: number, a: number, target: number, cap: number, goldenPoint: boolean): 'home' | 'away' | null {
  // Golden point: at the cap the next point wins outright (skip when disabled).
  if (goldenPoint && h >= cap) return 'home';
  if (goldenPoint && a >= cap) return 'away';
  if (h >= target && h - a >= 2) return 'home';
  if (a >= target && a - h >= 2) return 'away';
  return null;
}

/** Reset the match to 0-0 keeping its format (target/cap/golden-point/games) —
 *  the clean slate an EDIT_LOG replay rebuilds the corrected point list onto. */
const clearMatch = (s: BadmintonState): BadmintonState => ({
  ...s, current: { home: 0, away: 0 }, games: [], gamesWon: { home: 0, away: 0 }, events: [], seq: 0, ended: false,
});

const reducer = (s: BadmintonState, a: ScoreAction): BadmintonState => {
  // Timeline correction: STAT_ADJUST only reconciles player profiles (no match
  // effect); EDIT_LOG replays a corrected point list so the games re-derive.
  if (a.type === 'STAT_ADJUST') return s;
  if (a.type === 'EDIT_LOG') return replayPoints(reducer, clearMatch(s), (a.payload?.points as PointInput[]) ?? []);
  if (a.type !== 'POINT' || !a.side || s.ended) return s;
  const who = a.attribution?.playerName;
  const current = { ...s.current, [a.side]: s.current[a.side] + 1 };
  const gameNo = s.games.length + 1;
  let seq = s.seq;
  const events = [...s.events];
  // Structured fields (kind/playerName/game/points) let the per-game box score
  // aggregate points per player, filtered by game — the timeline ignores them.
  events.push({ id: ++seq, stamp: `Game ${gameNo}`, icon: '🏸', label: 'Point', detail: `${current.home}-${current.away}${who ? ` · ${who}` : ''}`, side: a.side, kind: 'point', playerName: who, game: gameNo, points: 1 });

  const winner = gameWinner(current.home, current.away, s.target, s.cap, s.goldenPoint ?? true);
  if (!winner) return { ...s, current, events, seq };

  const games = [...s.games, [current.home, current.away] as [number, number]];
  const gamesWon = { ...s.gamesWon, [winner]: s.gamesWon[winner] + 1 };
  const ended = gamesWon[winner] >= s.gamesToWin;
  events.push({ id: ++seq, stamp: 'Game', icon: '🎉', label: `Game ${gameNo} won`, detail: `${current.home}-${current.away}`, side: winner });
  if (ended) events.push({ id: ++seq, stamp: 'Match', icon: '🏆', label: 'Match won', detail: `${gamesWon.home}-${gamesWon.away} games`, side: winner });
  return { ...s, current: { home: 0, away: 0 }, games, gamesWon, events, seq, ended };
};

const PointRow = ({ label, roster, side, name, onPoint }: { label: string; roster: Player[]; side: 'home' | 'away'; name: string; onPoint: (side: 'home' | 'away', p?: Player) => void }) => (
  <View style={{ gap: theme.spacing(2) }}>
    <Text style={ctrl.label}>{label}</Text>
    {roster.length > 0 ? (
      <View style={ctrl.chips}>
        {roster.map((p) => <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => onPoint(side, p)} />)}
      </View>
    ) : (
      <Button label={`+1 ${name}`} variant={side} onPress={() => onPoint(side)} />
    )}
  </View>
);

const ScoringControls: SportPlugin<BadmintonState>['ScoringControls'] = ({ state, dispatch, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [] }) => {
  const s = state as BadmintonState;
  const point = (side: 'home' | 'away', p?: Player) =>
    dispatch({ type: 'POINT', side, attribution: p ? { playerId: p.id, stat: 'points', playerName: p.fullName } : undefined });
  return (
    <View style={{ gap: theme.spacing(4) }}>
      <PointRow label={`🏸 Point — ${homeName}`} roster={homeRoster} side="home" name={homeName} onPoint={point} />
      <PointRow label={`🏸 Point — ${awayName}`} roster={awayRoster} side="away" name={awayName} onPoint={point} />
      <RallyPointEditor
        events={s.events} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
        homeRoster={homeRoster} awayRoster={awayRoster} dispatch={dispatch} hasAce={false} pointIcon="🏸"
        periodLabel={(e) => `Game ${e.game ?? 1}`}
      />
    </View>
  );
};

const LiveExtras: NonNullable<SportPlugin<BadmintonState>['LiveExtras']> = ({ state, homeName, awayName, homeColor, awayColor }) => {
  const s = state as BadmintonState;
  // Games played so far (completed + the one in progress) drive the box-score toggle.
  const currentGame = s.games.length + 1;
  const periods = Array.from({ length: s.ended ? s.games.length : currentGame }, (_, i) => ({ value: i + 1, label: `Game ${i + 1}` }));
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Text style={ctrl.label}>Games</Text>
      <View style={ctrl.gamesRow}>
        {s.games.length === 0 ? (
          <Text style={textStyles.muted}>Game 1 in progress…</Text>
        ) : (
          s.games.map((g, i) => <Text key={i} style={ctrl.gameChip}>G{i + 1}: {g[0]}-{g[1]}</Text>)
        )}
      </View>
      <Text style={ctrl.label}>Player stats</Text>
      <BadmintonBoxScore events={s.events} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} periods={periods} />
      <Text style={ctrl.label}>Rally log</Text>
      <LiveTimeline events={s.events} homeColor={homeColor} awayColor={awayColor} emptyText="No rallies yet." />
    </View>
  );
};

/** Broadcast-style board: GAMES won + a column of points per game, the live game
 *  highlighted — the layout badminton TV graphics use. */
const BadmintonScoreboard: NonNullable<SportPlugin<BadmintonState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live }) => {
  const s = state as BadmintonState;
  const gameNo = s.games.length + 1;
  const nGames = Math.max(1, s.ended ? s.games.length : gameNo);
  const columns = Array.from({ length: nGames }, (_, i) => ({ label: String(i + 1), highlight: !s.ended && i + 1 === gameNo }));
  const cell = (side: 'home' | 'away', i: number) =>
    i < s.games.length ? String(s.games[i][side === 'home' ? 0 : 1]) : String(s.current[side]);
  return (
    <LineScoreboard
      status={`${s.ended ? 'Match Over' : `Game ${gameNo}`} · best of ${s.gamesToWin * 2 - 1}`}
      live={live}
      leadLabel="GAMES"
      columns={columns}
      winner={s.ended ? (s.gamesWon.home > s.gamesWon.away ? 'home' : 'away') : undefined}
      home={{ name: homeName, color: homeColor ?? theme.colors.home, lead: String(s.gamesWon.home), cells: columns.map((_, i) => cell('home', i)) }}
      away={{ name: awayName, color: awayColor ?? theme.colors.away, lead: String(s.gamesWon.away), cells: columns.map((_, i) => cell('away', i)) }}
    />
  );
};

export const badmintonPlugin: SportPlugin<BadmintonState> = {
  id: 'badminton',
  name: 'Badminton',
  icon: '🏸',
  archetype: 'set-game-point',
  participantKind: 'both', // Singles = individual, Doubles = a pair
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  result: (s) => (s.ended ? { winner: s.gamesWon.home > s.gamesWon.away ? 'home' : s.gamesWon.away > s.gamesWon.home ? 'away' : 'draw', home: s.gamesWon.home, away: s.gamesWon.away } : null),
  Scoreboard: BadmintonScoreboard,
  summary: (s) => ({
    homeScore: String(s.current.home),
    awayScore: String(s.current.away),
    statusLine: s.ended ? 'Match Over' : `Game ${s.games.length + 1}`,
    detailLine: `Games — ${s.gamesWon.home}:${s.gamesWon.away} · to ${s.target} · ${s.gamesToWin === 1 ? 'single game' : `best of ${s.gamesToWin * 2 - 1}`}`,
  }),
  ScoringControls,
  LiveExtras,
  formation: () => courtFormation('badminton'),
  Court: makeCourt('badminton'),
  voice: { hints: ['point home', 'point away', '{name} scores'], parse: pointVoice },
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'bwf21',
      options: [
        { value: 'bwf21', label: 'BWF · 21 rally', set: { pointsPerGame: 21, cap: 30, gamesToWin: 2, goldenPoint: true } },
        { value: 'g5x11', label: '5×11 (rally, cap 15)', set: { pointsPerGame: 11, cap: 15, gamesToWin: 3, goldenPoint: true } },
        { value: 'g15', label: '15-point', set: { pointsPerGame: 15, cap: 21, gamesToWin: 2, goldenPoint: true } },
        { value: 'single', label: 'Single game to 21', set: { pointsPerGame: 21, cap: 30, gamesToWin: 1, goldenPoint: true } },
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
    { key: 'pointsPerGame', label: 'Points per game', type: 'number', default: 21, min: 5, max: 30, advanced: true },
    { key: 'cap', label: 'Deuce cap', type: 'number', default: 30, min: 5, max: 40, advanced: true, hint: 'hard ceiling that settles a long deuce' },
    {
      key: 'goldenPoint', label: 'At the cap', type: 'choice', default: true, advanced: true,
      options: [
        { value: true, label: 'Golden point (next wins)' },
        { value: false, label: 'Win by 2 (no golden point)' },
      ],
    },
    {
      key: 'gamesToWin', label: 'Match length', type: 'choice', default: 2,
      options: [
        { value: 2, label: 'Best of 3' },
        { value: 3, label: 'Best of 5' },
        { value: 1, label: 'Single game' },
      ],
    },
  ],
};

const ctrl = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  gamesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  gameChip: {
    color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700',
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3),
  },
});
