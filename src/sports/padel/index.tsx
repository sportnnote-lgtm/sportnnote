/**
 * Padel plugin — archetype: set-game-point. Padel uses tennis scoring, with the
 * common club/tour variations all optional (defaults = classic tennis rules):
 *   • Deuce        — Advantage (classic, default) or Golden point (sudden death
 *                    at 40-40, the World Padel Tour rule, great for fast games).
 *   • Games/set    — 6 (standard, default) or 4 (short sets).
 *   • Match length — best of 3 (default) / best of 5 / single set.
 *   • Deciding set — full set (default) or a Match tiebreak to 10 instead.
 *   • Format       — doubles (default) or singles.
 *
 * Points are attributed to players; games, sets and tiebreaks hit the timeline.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { SelectChip, Button, textStyles } from '../../components/ui';
import { LiveTimeline } from '../LiveTimeline';
import { PointBoxScore } from '../PointBoxScore';
import type { LiveEvent } from '../liveEvents';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';
import { pointVoice } from '../voiceParsers';
import { courtFormation, makeCourt } from '../courts';

const SETS_TO_WIN = 2;

export interface PadelState {
  pts: { home: number; away: number };
  games: { home: number; away: number };
  sets: Array<[number, number]>;
  setsWon: { home: number; away: number };
  /** sets a side must win to take the match (format: setsToWin) */
  setsToWin: number;
  /** games to win a set, win by 2 (format: gamesPerSet) — 6 standard, 4 short */
  gamesPerSet: number;
  /** golden point: at 40-40 the next point wins the game (no advantage) */
  goldenPoint: boolean;
  /** decider: play the last set as a normal set, or a match tiebreak to 10 */
  matchTbDecider: boolean;
  events: LiveEvent[];
  seq: number;
  ended: boolean;
}

const init = (config?: Record<string, unknown>): PadelState => ({
  pts: { home: 0, away: 0 },
  games: { home: 0, away: 0 },
  sets: [],
  setsWon: { home: 0, away: 0 },
  setsToWin: Number(config?.setsToWin ?? SETS_TO_WIN),
  gamesPerSet: Number(config?.gamesPerSet ?? 6),
  goldenPoint: (config?.deuce ?? 'advantage') === 'golden',
  matchTbDecider: (config?.decider ?? 'set') === 'match10',
  events: [],
  seq: 0,
  ended: false,
});

const other = (side: 'home' | 'away') => (side === 'home' ? 'away' : 'home');
/** The deciding set = both sides one set short of the match. */
const isDecider = (s: PadelState) => s.setsWon.home === s.setsToWin - 1 && s.setsWon.away === s.setsToWin - 1;
/** A match tiebreak replaces the entire deciding set with one tiebreak to 10. */
const matchTbActive = (s: PadelState) => s.matchTbDecider && isDecider(s);
/** In a tiebreak: the deciding match-tiebreak, or a normal set's games-all tiebreak. */
const inTiebreak = (s: PadelState) => matchTbActive(s) || (s.games.home === s.gamesPerSet && s.games.away === s.gamesPerSet);
const tbTarget = (s: PadelState) => (matchTbActive(s) ? 10 : 7);

/** Point display: 0/15/30/40 with Ad, or raw points in a tiebreak. */
function disp(s: PadelState, side: 'home' | 'away'): string {
  if (inTiebreak(s)) return String(s.pts[side]);
  const me = s.pts[side];
  const them = s.pts[other(side)];
  if (me >= 3 && them >= 3) {
    if (me === them) return '40';
    return me > them ? 'Ad' : '40';
  }
  return ['0', '15', '30', '40'][Math.min(me, 3)];
}

function winSet(s: PadelState, side: 'home' | 'away', games: { home: number; away: number }, events: LiveEvent[], seq: number): PadelState {
  const sets = [...s.sets, [games.home, games.away] as [number, number]];
  const setsWon = { ...s.setsWon, [side]: s.setsWon[side] + 1 };
  const ended = setsWon[side] >= s.setsToWin;
  events.push({ id: ++seq, stamp: 'Set', icon: '🎉', label: `Set ${sets.length} won`, detail: `${games.home}-${games.away}`, side });
  if (ended) events.push({ id: ++seq, stamp: 'Match', icon: '🏆', label: 'Match won', detail: `${setsWon.home}-${setsWon.away} sets`, side });
  return { ...s, pts: { home: 0, away: 0 }, games: { home: 0, away: 0 }, sets, setsWon, events, seq, ended };
}

function scorePoint(s: PadelState, side: 'home' | 'away', who: string | undefined): PadelState {
  let seq = s.seq;
  const events = [...s.events];
  const o = other(side);
  const tb = inTiebreak(s);
  const matchTb = matchTbActive(s);
  const pts = { ...s.pts, [side]: s.pts[side] + 1 };
  const setNo = s.setsWon.home + s.setsWon.away + 1;
  events.push({
    id: ++seq,
    stamp: matchTb ? 'Match TB' : `Set ${setNo}${tb ? ' · TB' : ''}`,
    icon: '🟡',
    label: tb ? `${matchTb ? 'Match tiebreak' : 'Tiebreak'} ${pts.home}-${pts.away}` : 'Point',
    detail: who,
    side,
    kind: 'point', playerName: who, set: setNo, points: 1,
  });

  if (tb) {
    const target = tbTarget(s);
    const tbWon = pts[side] >= target && pts[side] - pts[o] >= 2;
    if (!tbWon) return { ...s, pts, events, seq };
    // A normal set's tiebreak makes the set 7-6; a match tiebreak ends the match
    // without games on the board.
    const games = matchTb ? { ...s.games } : { ...s.games, [side]: s.gamesPerSet + 1 };
    return winSet(s, side, games, events, seq);
  }

  // Game won: win by 2, OR — under golden point — the sudden-death point at 40-40.
  const gameWon = pts[side] >= 4 && (pts[side] - pts[o] >= 2 || (s.goldenPoint && pts[o] >= 3));
  if (!gameWon) return { ...s, pts, events, seq };

  const games = { ...s.games, [side]: s.games[side] + 1 };
  events.push({ id: ++seq, stamp: 'Game', icon: '✅', label: `Game ${side === 'home' ? 'home' : 'away'}`, detail: `${games.home}-${games.away}`, side });

  const setDone = games[side] >= s.gamesPerSet && games[side] - games[o] >= 2;
  if (!setDone) return { ...s, pts: { home: 0, away: 0 }, games, events, seq };
  return winSet(s, side, games, events, seq);
}

const reducer = (s: PadelState, a: ScoreAction): PadelState => {
  if (s.ended || !a.side) return s;
  if (a.type === 'POINT') return scorePoint(s, a.side, a.attribution?.playerName);
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

const ScoringControls: SportPlugin<PadelState>['ScoringControls'] = ({ state, dispatch, homeName, awayName, homeRoster = [], awayRoster = [] }) => {
  const s = state as PadelState;
  const act = (side: 'home' | 'away', p?: Player) =>
    dispatch({ type: 'POINT', side, attribution: p ? { playerId: p.id, stat: 'points', playerName: p.fullName } : undefined });
  const deucePoint = s.goldenPoint && !inTiebreak(s) && s.pts.home >= 3 && s.pts.away >= 3;
  return (
    <View style={{ gap: theme.spacing(4) }}>
      {matchTbActive(s) && <Text style={ctrl.serve}>🟡 Match tiebreak — first to 10 (win by 2).</Text>}
      {deucePoint && <Text style={ctrl.serve}>⚡ Golden point — next point wins the game.</Text>}
      <Row label={`🟡 Point — ${homeName}`} roster={homeRoster} onPick={(p) => act('home', p)} fallback={`Point ${homeName}`} />
      <Row label={`🟡 Point — ${awayName}`} roster={awayRoster} onPick={(p) => act('away', p)} fallback={`Point ${awayName}`} />
    </View>
  );
};

const LiveExtras: NonNullable<SportPlugin<PadelState>['LiveExtras']> = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster }) => {
  const s = state as PadelState;
  const periods = Array.from({ length: Math.max(1, s.sets.length + 1) }, (_, i) => i + 1);
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Text style={ctrl.label}>Sets</Text>
      <View style={ctrl.setsRow}>
        {s.sets.length === 0 ? (
          <Text style={textStyles.muted}>{matchTbActive(s) ? 'Match tiebreak in progress' : `Set 1 in progress · games ${s.games.home}-${s.games.away}`}</Text>
        ) : (
          s.sets.map((g, i) => <Text key={i} style={ctrl.setChip}>S{i + 1}: {g[0]}-{g[1]}</Text>)
        )}
      </View>
      <Text style={ctrl.label}>Box score</Text>
      <PointBoxScore events={s.events} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} homeColor={homeColor} awayColor={awayColor} periods={periods} periodLabel="Set" />
      <Text style={ctrl.label}>Point log</Text>
      <LiveTimeline events={s.events} homeColor={homeColor} awayColor={awayColor} emptyText="No points yet." />
    </View>
  );
};

export const padelPlugin: SportPlugin<PadelState> = {
  id: 'padel',
  name: 'Padel',
  icon: '🟡',
  archetype: 'set-game-point',
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  result: (s) => (s.ended ? { winner: s.setsWon.home > s.setsWon.away ? 'home' : s.setsWon.away > s.setsWon.home ? 'away' : 'draw', home: s.setsWon.home, away: s.setsWon.away } : null),
  summary: (s) => ({
    homeScore: disp(s, 'home'),
    awayScore: disp(s, 'away'),
    statusLine: s.ended
      ? 'Match Over'
      : matchTbActive(s)
      ? 'Match tiebreak'
      : `Set ${s.setsWon.home + s.setsWon.away + 1}${inTiebreak(s) ? ' · TIEBREAK' : ''} · ${s.setsToWin === 1 ? 'single set' : `best of ${s.setsToWin * 2 - 1}`}`,
    detailLine: `Games ${s.games.home}-${s.games.away}${s.goldenPoint ? ' · golden pt' : ''}${s.sets.length ? ' · ' + s.sets.map((g) => `${g[0]}-${g[1]}`).join(', ') : ''}`,
  }),
  ScoringControls,
  LiveExtras,
  formation: () => courtFormation('padel'),
  Court: makeCourt('padel'),
  voice: { hints: ['point home', 'point away', '{name} scores'], parse: pointVoice },
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'premier',
      options: [
        { value: 'premier', label: 'Premier Padel / WPT (golden pt)', set: { deuce: 'golden', gamesPerSet: 6, setsToWin: 2, decider: 'set' } },
        { value: 'classic', label: 'Classic (advantage)', set: { deuce: 'advantage', gamesPerSet: 6, setsToWin: 2, decider: 'set' } },
        { value: 'short', label: 'Short (to 4, match TB)', set: { deuce: 'golden', gamesPerSet: 4, setsToWin: 2, decider: 'match10' } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    {
      key: 'playersPerSide', label: 'Players', type: 'choice', default: 2,
      options: [
        { value: 2, label: 'Doubles' },
        { value: 1, label: 'Singles' },
      ],
    },
    {
      key: 'deuce', label: 'At deuce', type: 'choice', default: 'advantage', advanced: true,
      hint: 'how 40-40 is decided',
      options: [
        { value: 'advantage', label: 'Advantage (classic)' },
        { value: 'golden', label: 'Golden point' },
      ],
    },
    {
      key: 'gamesPerSet', label: 'Games per set', type: 'choice', default: 6, advanced: true,
      options: [
        { value: 6, label: 'Standard (to 6)' },
        { value: 4, label: 'Short (to 4)' },
      ],
    },
    {
      key: 'setsToWin', label: 'Match length', type: 'choice', default: 2, advanced: true,
      options: [
        { value: 2, label: 'Best of 3 sets' },
        { value: 3, label: 'Best of 5 sets' },
        { value: 1, label: 'Single set' },
      ],
    },
    {
      key: 'decider', label: 'Deciding set', type: 'choice', default: 'set', advanced: true,
      hint: 'how the final set is played',
      options: [
        { value: 'set', label: 'Full set' },
        { value: 'match10', label: 'Match tiebreak (to 10)' },
      ],
    },
  ],
};

const ctrl = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  serve: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  setsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  setChip: {
    color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700',
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3),
  },
});
