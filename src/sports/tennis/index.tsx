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
import type { LiveEvent } from '../liveEvents';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';
import { pointVoice } from '../voiceParsers';
import { courtFormation, makeCourt } from '../courts';
import { TennisBoxScore } from './BoxScore';

const SETS_TO_WIN = 2;

export interface TennisState {
  pts: { home: number; away: number };
  games: { home: number; away: number };
  sets: Array<[number, number]>;
  setsWon: { home: number; away: number };
  /** sets a side must win to take the match (format: setsToWin) */
  setsToWin: number;
  /** games needed to win a normal set (6 std · 4 Fast4 · 8 pro-set) */
  gamesPerSet: number;
  /** must a set be won by two clear games? (Fast4 = false: first to N) */
  setWinByTwo: boolean;
  /** game score that triggers a set tiebreak (usually = gamesPerSet; Fast4 = 3) */
  tiebreakAt: number;
  /** is a set tiebreak played at all? (false = advantage set, win by 2 forever) */
  setTiebreak: boolean;
  /** points to win the set tiebreak (7 std · 5 Fast4) */
  tiebreakPoints: number;
  /** no-advantage scoring — a single deciding point at deuce */
  noAd: boolean;
  /** if > 0, the deciding set is a first-to-N match tiebreak (Grand Slam = 10) */
  finalSetTiebreak: number;
  events: LiveEvent[];
  seq: number;
  ended: boolean;
}

const init = (config?: Record<string, unknown>): TennisState => {
  const gamesPerSet = Number(config?.gamesPerSet ?? 6);
  return {
    pts: { home: 0, away: 0 },
    games: { home: 0, away: 0 },
    sets: [],
    setsWon: { home: 0, away: 0 },
    setsToWin: Number(config?.setsToWin ?? SETS_TO_WIN),
    gamesPerSet,
    setWinByTwo: config?.setWinByTwo !== false, // default true
    tiebreakAt: Number(config?.tiebreakAt ?? gamesPerSet),
    setTiebreak: config?.setTiebreak !== false, // default true
    tiebreakPoints: Number(config?.tiebreakPoints ?? 7),
    noAd: Boolean(config?.noAd ?? false),
    finalSetTiebreak: Number(config?.finalSetTiebreak ?? 0),
    events: [],
    seq: 0,
    ended: false,
  };
};

const other = (side: 'home' | 'away') => (side === 'home' ? 'away' : 'home');
/** The deciding set = both sides one set from the match. */
const isDeciderSet = (s: TennisState) => s.setsWon.home === s.setsToWin - 1 && s.setsWon.away === s.setsToWin - 1;
/** The deciding set is played as a single match tiebreak (champions' tiebreak). */
const isMatchTB = (s: TennisState) => isDeciderSet(s) && s.finalSetTiebreak > 0;
/** In a tiebreak: either the whole deciding set, or a set-ending tiebreak at N-N. */
const inTiebreak = (s: TennisState) => isMatchTB(s) || (s.setTiebreak && s.games.home === s.tiebreakAt && s.games.away === s.tiebreakAt);
const tbTarget = (s: TennisState) => (isMatchTB(s) ? s.finalSetTiebreak : s.tiebreakPoints);

/** Tennis point display: 0/15/30/40 with Deuce/Ad, or raw points in a tiebreak. */
function disp(s: TennisState, side: 'home' | 'away'): string {
  if (inTiebreak(s)) return String(s.pts[side]); // tiebreak: 0,1,2,3…
  const me = s.pts[side];
  const them = s.pts[other(side)];
  if (me >= 3 && them >= 3) {
    if (me === them || s.noAd) return '40'; // no-ad has no advantage state
    return me > them ? 'Ad' : '40';
  }
  return ['0', '15', '30', '40'][Math.min(me, 3)];
}

/** Finish a set for `side` with the given game score; advance or end the match. */
function winSet(s: TennisState, side: 'home' | 'away', games: { home: number; away: number }, events: LiveEvent[], seq: number): TennisState {
  const sets = [...s.sets, [games.home, games.away] as [number, number]];
  const setsWon = { ...s.setsWon, [side]: s.setsWon[side] + 1 };
  const ended = setsWon[side] >= s.setsToWin;
  events.push({ id: ++seq, stamp: 'Set', icon: '🎉', label: `Set ${sets.length} won`, detail: `${games.home}-${games.away}`, side });
  if (ended) events.push({ id: ++seq, stamp: 'Match', icon: '🏆', label: 'Match won', detail: `${setsWon.home}-${setsWon.away} sets`, side });
  return { ...s, pts: { home: 0, away: 0 }, games: { home: 0, away: 0 }, sets, setsWon, events, seq, ended };
}

function scorePoint(s: TennisState, side: 'home' | 'away', who: string | undefined, ace: boolean): TennisState {
  let seq = s.seq;
  const events = [...s.events];
  const o = other(side);
  const tb = inTiebreak(s);
  const pts = { ...s.pts, [side]: s.pts[side] + 1 };
  const setNo = s.setsWon.home + s.setsWon.away + 1;
  // Structured fields (kind/playerName/set/points) let the per-set box score tally
  // points & aces per player, filtered by set — the timeline ignores them.
  events.push({ id: ++seq, stamp: `Set ${setNo}${tb ? ' · TB' : ''}`, icon: ace ? '🎯' : '🎾', label: ace ? 'Ace' : tb ? `Tiebreak ${pts.home}-${pts.away}` : 'Point', detail: who, side, kind: ace ? 'ace' : 'point', playerName: who, set: setNo, points: 1 });

  if (tb) {
    // First to the tiebreak target, win by 2. A match tiebreak records its own
    // score as the set (e.g. 10-8); a set tiebreak makes the games tiebreakAt+1.
    const tbWon = pts[side] >= tbTarget(s) && pts[side] - pts[o] >= 2;
    if (!tbWon) return { ...s, pts, events, seq };
    const games = isMatchTB(s) ? { home: pts.home, away: pts.away } : { ...s.games, [side]: s.tiebreakAt + 1 };
    return winSet(s, side, games, events, seq);
  }

  const gameWon = pts[side] >= 4 && pts[side] - pts[o] >= (s.noAd ? 1 : 2);
  if (!gameWon) return { ...s, pts, events, seq };

  const games = { ...s.games, [side]: s.games[side] + 1 };
  events.push({ id: ++seq, stamp: 'Game', icon: '✅', label: `Game ${side === 'home' ? 'home' : 'away'}`, detail: `${games.home}-${games.away}`, side });

  // Set won at gamesPerSet games — by two clear games if setWinByTwo (e.g. 6-4,
  // 7-5), else first-to-N (Fast4 4-2). At tiebreakAt-tiebreakAt the set goes to a
  // tiebreak instead (handled above on the next point) unless tiebreaks are off.
  const setDone = games[side] >= s.gamesPerSet && (!s.setWinByTwo || games[side] - games[o] >= 2);
  if (!setDone) return { ...s, pts: { home: 0, away: 0 }, games, events, seq };
  return winSet(s, side, games, events, seq);
}

const reducer = (s: TennisState, a: ScoreAction): TennisState => {
  if (s.ended || !a.side) return s;
  if (a.type === 'POINT') return scorePoint(s, a.side, a.attribution?.playerName, false);
  if (a.type === 'ACE') return scorePoint(s, a.side, a.attribution?.playerName, true);
  return s;
};

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

const ScoringControls: SportPlugin<TennisState>['ScoringControls'] = ({ dispatch, homeName, awayName, homeRoster = [], awayRoster = [] }) => {
  const act = (type: string, side: 'home' | 'away', stat: string, p?: Player) =>
    dispatch({ type, side, attribution: p ? { playerId: p.id, stat, playerName: p.fullName } : undefined });
  return (
    <View style={{ gap: theme.spacing(4) }}>
      <Row label={`🎾 Point — ${homeName}`} roster={homeRoster} onPick={(p) => act('POINT', 'home', 'points', p)} fallback={`Point ${homeName}`} />
      <Row label={`🎾 Point — ${awayName}`} roster={awayRoster} onPick={(p) => act('POINT', 'away', 'points', p)} fallback={`Point ${awayName}`} />
      <Row label={`🎯 Ace — ${homeName}`} roster={homeRoster} onPick={(p) => act('ACE', 'home', 'aces', p)} fallback={`Ace ${homeName}`} />
      <Row label={`🎯 Ace — ${awayName}`} roster={awayRoster} onPick={(p) => act('ACE', 'away', 'aces', p)} fallback={`Ace ${awayName}`} />
    </View>
  );
};

const LiveExtras: NonNullable<SportPlugin<TennisState>['LiveExtras']> = ({ state, homeName, awayName, homeColor, awayColor }) => {
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
      <TennisBoxScore events={s.events} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} periods={periods} />
      <Text style={ctrl.label}>Point log</Text>
      <LiveTimeline events={s.events} homeColor={homeColor} awayColor={awayColor} emptyText="No points yet." />
    </View>
  );
};

export const tennisPlugin: SportPlugin<TennisState> = {
  id: 'tennis',
  name: 'Tennis',
  icon: '🎾',
  archetype: 'set-game-point',
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
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
  voice: { hints: ['point home', 'point away', '{name} scores'], parse: pointVoice },
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
      key: 'noAd', label: 'At deuce', type: 'choice', default: false, advanced: true,
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
  setsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  setChip: {
    color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700',
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3),
  },
});
