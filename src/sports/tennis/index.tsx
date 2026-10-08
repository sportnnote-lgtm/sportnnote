/**
 * Tennis plugin (new) — archetype: set-game-point. Best of 3 sets; games to 6
 * (win by 2, a 7th game settles 6-6); points 0/15/30/40 with deuce & advantage.
 * Points and aces are attributed to players; games and sets hit the timeline.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { SelectChip, Button, textStyles } from '../../components/ui';
import { LiveTimeline } from '../LiveTimeline';
import type { Player } from '../../core/types';
import type { SportPlugin } from '../types';
import { tennisVoice } from '../voiceParsers';
import { courtFormation, makeCourt } from '../courts';
import { TennisBoxScore } from './BoxScore';
import { LineScoreboard } from '../../components/LineScoreboard';
import { RallyPointEditor } from '../RallyPointEditor';
import { init, reducer, disp, inTiebreak, other, serveInfo, gamesPlayed, type TennisState } from './engine';


const Row = ({ label, roster, onPick, fallback }: { label: string; roster: Player[]; onPick: (p?: Player) => void; fallback?: string }) => (
  <View style={{ gap: theme.spacing(2) }}>
    <Text style={ctrl.label}>{label}</Text>
    {roster.length > 0 ? (
      <View style={ctrl.chips}>{roster.map((p) => <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => onPick(p)} />)}</View>
    ) : (
      <Button label={fallback ?? '+1'} variant="ghost" onPress={() => onPick()} />
    )}
  </View>
);

const ScoringControls: SportPlugin<TennisState>['ScoringControls'] = ({ state, dispatch, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [] }) => {
  const s = state as TennisState;
  const act = (type: string, side: 'home' | 'away', stat: string, p?: Player) =>
    dispatch({ type, side, attribution: p ? { playerId: p.id, stat, playerName: p.fullName } : undefined });
  // A double fault: the OPPONENT wins the point (a normal POINT, so the score &
  // replay stay correct); the faulting server is credited a doubleFault via the
  // 2nd-attribution channel (reversed on undo).
  const doubleFault = (side: 'home' | 'away', p?: Player) =>
    dispatch({ type: 'POINT', side: other(side), attribution2: p ? { playerId: p.id, stat: 'doubleFaults', playerName: p.fullName } : undefined });

  // Serve tracking. Who serves first is set before the first point; from there
  // serve alternates each game (and, in doubles, rotates through the pair).
  const serve = serveInfo(s);
  const serverSideName = serve.side === 'home' ? homeName : awayName;
  const serverRoster = serve.side === 'home' ? homeRoster : awayRoster;
  const serverName = s.doubles
    ? serverRoster[serve.slot]?.fullName ?? `Server ${serve.slot + 1}`
    : serverRoster[0]?.fullName ?? serverSideName;
  const noPlayYet = gamesPlayed(s) === 0 && s.pts.home === 0 && s.pts.away === 0;
  const setFirstServer = (side: 'home' | 'away') => dispatch({ type: 'SET_FIRST_SERVER', payload: { side } });

  return (
    <View style={{ gap: theme.spacing(4) }}>
      {noPlayYet ? (
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={ctrl.label}>🎾 Who serves first?</Text>
          <View style={ctrl.chips}>
            <SelectChip label={homeName} active={s.firstServer === 'home'} onPress={() => setFirstServer('home')} />
            <SelectChip label={awayName} active={s.firstServer === 'away'} onPress={() => setFirstServer('away')} />
          </View>
        </View>
      ) : (
        <Text style={ctrl.serveBanner}>🎾 Serving: {serverName}{s.doubles ? `  ·  ${serverSideName}` : ''}</Text>
      )}
      <Row label={`🎾 Point — ${homeName}`} roster={homeRoster} onPick={(p) => act('POINT', 'home', 'points', p)} fallback={`Point ${homeName}`} />
      <Row label={`🎾 Point — ${awayName}`} roster={awayRoster} onPick={(p) => act('POINT', 'away', 'points', p)} fallback={`Point ${awayName}`} />
      <Row label={`🎯 Ace — ${homeName}`} roster={homeRoster} onPick={(p) => act('ACE', 'home', 'aces', p)} fallback={`Ace ${homeName}`} />
      <Row label={`🎯 Ace — ${awayName}`} roster={awayRoster} onPick={(p) => act('ACE', 'away', 'aces', p)} fallback={`Ace ${awayName}`} />
      <Row label={`⚠️ Double fault — ${homeName}`} roster={homeRoster} onPick={(p) => doubleFault('home', p)} fallback={`Double fault ${homeName}`} />
      <Row label={`⚠️ Double fault — ${awayName}`} roster={awayRoster} onPick={(p) => doubleFault('away', p)} fallback={`Double fault ${awayName}`} />
      <RallyPointEditor
        events={s.events} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
        homeRoster={homeRoster} awayRoster={awayRoster} dispatch={dispatch} hasAce pointIcon="🎾"
        periodLabel={(e) => `Set ${e.set ?? 1}`}
      />
    </View>
  );
};

const LiveExtras: NonNullable<SportPlugin<TennisState>['LiveExtras']> = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }) => {
  const s = state as TennisState;
  // Sets played so far (completed + the one in progress) drive the box-score toggle.
  const currentSet = s.setsWon.home + s.setsWon.away + 1;
  const periods = Array.from({ length: s.ended ? s.sets.length : currentSet }, (_, i) => ({ value: i + 1, label: `Set ${i + 1}` }));
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Text style={ctrl.label}>Sets</Text>
      <View style={ctrl.setsRow}>
        {s.sets.length === 0 ? (
          <Text style={textStyles.muted}>Set 1 in progress · games {s.games.home}-{s.games.away}</Text>
        ) : (
          s.sets.map((g, i) => <Text key={i} style={ctrl.setChip}>S{i + 1}: {g[0]}-{g[1]}</Text>)
        )}
      </View>
      <Text style={ctrl.label}>Player stats</Text>
      <TennisBoxScore events={s.events} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} periods={periods} homeRoster={homeRoster} awayRoster={awayRoster} onPlayer={onPlayer} />
      <Text style={ctrl.label}>Point log</Text>
      <LiveTimeline events={s.events} homeColor={homeColor} awayColor={awayColor} emptyText="No points yet." homeRoster={homeRoster} awayRoster={awayRoster} onPlayer={onPlayer} />
    </View>
  );
};

/** Broadcast-style board: current-game POINTS + a column of games per set, the
 *  live set highlighted — the layout tennis TV graphics use. */
const TennisScoreboard: NonNullable<SportPlugin<TennisState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live }) => {
  const s = state as TennisState;
  const setNo = s.setsWon.home + s.setsWon.away + 1;
  const nSets = Math.max(1, s.ended ? s.sets.length : setNo); // sets played + the one in progress
  const columns = Array.from({ length: nSets }, (_, i) => ({ label: String(i + 1), highlight: !s.ended && i + 1 === setNo }));
  const cell = (side: 'home' | 'away', i: number) =>
    i < s.sets.length ? String(s.sets[i][side === 'home' ? 0 : 1]) : String(s.games[side]);
  // After the match the current-game POINTS are meaningless (0-0), so the headline
  // becomes SETS won — the result a fan reads off a final board.
  const winner = s.ended ? (s.setsWon.home > s.setsWon.away ? 'home' : 'away') : undefined;
  const lead = (side: 'home' | 'away') => (s.ended ? String(s.setsWon[side]) : disp(s, side));
  // Serve dot next to the serving side's name (broadcast standard), while live.
  const serving = s.ended ? undefined : serveInfo(s).side;
  const withServe = (side: 'home' | 'away', name: string) => (serving === side ? `${name} 🎾` : name);
  return (
    <LineScoreboard
      status={`${s.ended ? 'Match Over' : `Set ${setNo}${inTiebreak(s) ? ' · Tiebreak' : ''}`} · best of ${s.setsToWin * 2 - 1}`}
      live={live}
      leadLabel={s.ended ? 'SETS' : 'POINTS'}
      columns={columns}
      winner={winner}
      home={{ name: withServe('home', homeName), color: homeColor ?? theme.colors.home, lead: lead('home'), cells: columns.map((_, i) => cell('home', i)) }}
      away={{ name: withServe('away', awayName), color: awayColor ?? theme.colors.away, lead: lead('away'), cells: columns.map((_, i) => cell('away', i)) }}
    />
  );
};

export const tennisPlugin: SportPlugin<TennisState> = {
  id: 'tennis',
  name: 'Tennis',
  icon: '🎾',
  archetype: 'set-game-point',
  participantKind: 'both', // Singles = individual, Doubles = a pair
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  result: (s) => (s.ended ? { winner: s.setsWon.home > s.setsWon.away ? 'home' : s.setsWon.away > s.setsWon.home ? 'away' : 'draw', home: s.setsWon.home, away: s.setsWon.away } : null),
  Scoreboard: TennisScoreboard,
  summary: (s) => ({
    homeScore: disp(s, 'home'),
    awayScore: disp(s, 'away'),
    statusLine: s.ended
      ? 'Match Over'
      : `Set ${s.setsWon.home + s.setsWon.away + 1}${inTiebreak(s) ? ' · TIEBREAK' : ''} · ${s.setsToWin === 1 ? 'single set' : `best of ${s.setsToWin * 2 - 1}`}`,
    detailLine: `Games ${s.games.home}-${s.games.away}${s.sets.length ? ' · ' + s.sets.map((g) => `${g[0]}-${g[1]}`).join(', ') : ''}`,
  }),
  ScoringControls,
  LiveExtras,
  formation: () => courtFormation('tennis'),
  Court: makeCourt('tennis'),
  voice: { hints: ['point home', 'ace {name}', 'double fault {name}'], parse: tennisVoice },
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'bo3',
      options: [
        { value: 'bo3', label: 'Best of 3 sets', set: { setsToWin: 2, gamesPerSet: 6, setWinByTwo: true, tiebreakAt: 6, setTiebreak: true, tiebreakPoints: 7, noAd: false, finalSetTiebreak: 0 } },
        { value: 'bo5', label: 'Best of 5 sets', set: { setsToWin: 3, gamesPerSet: 6, setWinByTwo: true, tiebreakAt: 6, setTiebreak: true, tiebreakPoints: 7, noAd: false, finalSetTiebreak: 0 } },
        { value: 'gs5', label: 'Grand Slam (Bo5, final-set TB)', set: { setsToWin: 3, gamesPerSet: 6, setWinByTwo: true, tiebreakAt: 6, setTiebreak: true, tiebreakPoints: 7, noAd: false, finalSetTiebreak: 10 } },
        { value: 'fast4', label: 'Fast4', set: { setsToWin: 2, gamesPerSet: 4, setWinByTwo: false, tiebreakAt: 3, setTiebreak: true, tiebreakPoints: 5, noAd: true, finalSetTiebreak: 0 } },
        { value: 'proset', label: 'Pro set (to 8)', set: { setsToWin: 1, gamesPerSet: 8, setWinByTwo: true, tiebreakAt: 8, setTiebreak: true, tiebreakPoints: 7, noAd: false, finalSetTiebreak: 0 } },
        { value: 'match_tb', label: 'Match tiebreak (to 10)', set: { setsToWin: 1, gamesPerSet: 6, setWinByTwo: true, tiebreakAt: 6, setTiebreak: true, tiebreakPoints: 7, noAd: true, finalSetTiebreak: 10 } },
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
    {
      key: 'setsToWin', label: 'Match length', type: 'choice', default: 2, advanced: true,
      options: [
        { value: 2, label: 'Best of 3' },
        { value: 3, label: 'Best of 5' },
        { value: 1, label: 'Single set' },
      ],
    },
    {
      key: 'gamesPerSet', label: 'Games per set', type: 'choice', default: 6, advanced: true,
      options: [
        { value: 6, label: '6 (standard)' },
        { value: 4, label: '4 (short)' },
        { value: 8, label: '8 (pro set)' },
      ],
    },
    {
      key: 'noAd', label: 'At deuce', type: 'choice', default: false,
      options: [
        { value: false, label: 'Advantage (classic)' },
        { value: true, label: 'No-ad (deciding point)' },
      ],
    },
    { key: 'setTiebreak', label: 'Set tiebreak at N-N', type: 'toggle', default: true, advanced: true, hint: 'off = advantage set (win by 2)' },
    {
      key: 'finalSetTiebreak', label: 'Deciding set', type: 'choice', default: 0, advanced: true,
      options: [
        { value: 0, label: 'Full set' },
        { value: 10, label: '10-point match tiebreak' },
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
  setsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  setChip: {
    color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700',
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3),
  },
});
