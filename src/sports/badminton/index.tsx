/**
 * Badminton plugin — archetype: set-game-point. Best of 3 games to 21 (win by
 * 2, cap 30). Each rally is logged to the play-by-play with the point-winner,
 * and game wins are highlighted. Points are attributed to players for profiles.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { textStyles } from '../../components/ui';
import { LiveTimeline } from '../LiveTimeline';
import type { Player } from '../../core/types';
import type { SportPlugin } from '../types';
import { courtFormation, makeCourt } from '../courts';
import { pointVoice } from '../voiceParsers';
import { MatchBoxScore } from '../../components/BoxScore';
import { badmintonBox } from '../boxSources';
import { SetLineBoard } from '../SetLineBoard';
import { RallyPointEditor } from '../RallyPointEditor';
import { MatchStatsPanel } from '../MatchStatsPanel';
import { PointDetailRow } from '../PointDetailRow';
import { detailLiveSettings } from '../pointDetailSettings';
import { PointButtons, ServeFirstPicker } from '../PointButtons';
import { pointPressure, pressureText } from '../pointStatus';
import { init, reducer, serve, summary, scoreLine, lineScore, standingsUnits, type BadmintonState } from './engine';
import { badmintonTotals } from '../racketTotals';
export { serve, type BadmintonState } from './engine';

const ScoringControls: SportPlugin<BadmintonState>['ScoringControls'] = ({ state, dispatch, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [] }) => {
  const s = state as BadmintonState;
  const point = (side: 'home' | 'away', p?: Player) =>
    dispatch({ type: 'POINT', side, attribution: p ? { playerId: p.id, stat: 'points', playerName: p.fullName } : undefined });
  // Serve: chosen first server before any point, then the rally winner serves.
  const sv = serve(s);
  const serverSideName = sv.side === 'home' ? homeName : awayName;
  const serverRoster = sv.side === 'home' ? homeRoster : awayRoster;
  // Doubles server depends on the service court + who's there, so name the side;
  // singles has one player, so name them.
  const serverName = s.doubles ? serverSideName : serverRoster[0]?.fullName ?? serverSideName;
  const noPlayYet = s.current.home === 0 && s.current.away === 0 && s.games.length === 0;
  // SD-115: no silent default — the point buttons wait for the toss.
  const needsServer = noPlayYet && !s.serverPicked;
  return (
    <View style={{ gap: theme.spacing(4) }}>
      {!noPlayYet && <Text style={ctrl.serveBanner}>🏸 Serving: {serverName}  ·  {sv.court} court</Text>}
      <ServeFirstPicker
        icon="🏸" homeName={homeName} awayName={awayName} started={!noPlayYet}
        picked={s.serverPicked || !noPlayYet ? s.firstServer : null}
        onPick={(side, fix) => dispatch({ type: 'SET_FIRST_SERVER', payload: fix ? { side, v: 2 } : { side } })}
      />
      {/* SD-115 (extends SD-61) — two big team-coloured buttons; singles
          auto-credits, doubles credit is optional (long-press / "credit a player") */}
      <PointButtons
        homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
        homeRoster={homeRoster} awayRoster={awayRoster} icon="🏸"
        serving={needsServer ? null : sv.side}
        disabled={needsServer} disabledHint="Pick who serves first to start scoring."
        onPoint={point}
      />
      {/* SD-107 — optional "how was it won?" for the last rally */}
      <PointDetailRow sport="badminton" state={s} dispatch={dispatch} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} />
      <RallyPointEditor
        events={s.events} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
        homeRoster={homeRoster} awayRoster={awayRoster} dispatch={dispatch} hasAce={false} pointIcon="🏸" detailSport="badminton"
        periodLabel={(e) => `Game ${e.game ?? 1}`}
      />
    </View>
  );
};

const LiveExtras: NonNullable<SportPlugin<BadmintonState>['LiveExtras']> = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }) => {
  const s = state as BadmintonState;
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
      {/* SD-22: serve / return figures replayed from the point log, per set */}
      <MatchStatsPanel sport="badminton" state={s} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} homeColor={homeColor} awayColor={awayColor} />
      <Text style={ctrl.label}>Player stats</Text>
      <MatchBoxScore sport="badminton" source={badmintonBox(s, { homeRoster, awayRoster })} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} />
      <Text style={ctrl.label}>Rally log</Text>
      <LiveTimeline events={s.events} homeColor={homeColor} awayColor={awayColor} emptyText="No rallies yet." homeRoster={homeRoster} awayRoster={awayRoster} onPlayer={onPlayer} />
    </View>
  );
};

/** Broadcast-style board: GAMES won + a column of points per game, the live game
 *  highlighted — the layout badminton TV graphics use. */
const BadmintonScoreboard: NonNullable<SportPlugin<BadmintonState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live, closed }) => {
  const s = state as BadmintonState;
  return (
    <SetLineBoard
      ls={lineScore(s)} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} live={live} closed={closed}
      status={`Game ${s.games.length + 1}`} bestOf={`best of ${s.gamesToWin * 2 - 1}`}
      // SD-104: serve dot on the serving side (the last rally winner / first server), while live.
      serving={s.ended || (!s.serverPicked && s.events.length === 0) ? null : serve(s).side} serveIcon="🏸"
      // SD-115 — GAME / MATCH POINT, derived by playing the next rally.
      alerts={pressureText(pointPressure(reducer, s, { unit: 'game' }), { home: homeName, away: awayName })}
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
  // SD-17: rally points over every game (BWF points difference).
  standingsUnits,
  // SD-19: absolute games / sets / points / deciders per player (and the
  // doubles partner), synced at completion and on correction. Partial: any other live key stays on increments.
  statTotals: badmintonTotals,
  statTotalsPartial: true,
  statTotalsNeedsPlayers: true,
  Scoreboard: BadmintonScoreboard,
  // SD-01: once ended → games won + "21-18, 19-21, 21-15" (never the reset 0–0).
  summary,
  scoreLine,
  // SD-20: the line score + BWF result marks ("21-15, 8-3 ret.").
  lineScore,
  retireTerms: true,
  ScoringControls,
  LiveExtras,
  // SD-107 — the optional point-detail setting (event mode: from the next point)
  liveSettings: detailLiveSettings('badminton'),
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
  serveBanner: {
    color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800',
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3), alignSelf: 'flex-start',
  },
  gamesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  gameChip: {
    color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700',
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3),
  },
});
