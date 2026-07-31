/**
 * Volleyball plugin — archetype: running-points. Rally scoring, set to 25
 * (win by 2), best of 3 sets. Each point is logged; points & aces are
 * attributed to players for profiles.
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
import { VolleyballBoxScore } from './BoxScore';

const TARGET = 25;
const DECIDER_TARGET = 15; // the final set is a shorter race to 15 (real-world rule)
const SETS_TO_WIN = 2;

export interface VolleyballState {
  current: { home: number; away: number };
  setsWon: { home: number; away: number };
  sets: Array<[number, number]>;
  /** sets a side must win to take the match (format: setsToWin) */
  setsToWin: number;
  /** points to win a normal set, win by 2 (format: pointsPerSet — 25 indoor, 21 beach) */
  target: number;
  /** points to win the deciding set (shorter — 15) */
  deciderTarget: number;
  /** must a set be won by two clear points? off = first to target (casual) */
  winByTwo: boolean;
  events: LiveEvent[];
  seq: number;
  ended: boolean;
}

const init = (config?: Record<string, unknown>): VolleyballState => ({
  current: { home: 0, away: 0 },
  setsWon: { home: 0, away: 0 },
  sets: [],
  setsToWin: Number(config?.setsToWin ?? SETS_TO_WIN),
  target: Number(config?.pointsPerSet ?? TARGET),
  deciderTarget: Number(config?.deciderPoints ?? DECIDER_TARGET),
  winByTwo: config?.winByTwo !== false, // default on (rally to 25, win by 2)
  events: [],
  seq: 0,
  ended: false,
});

/** Are we in the deciding set? (both sides one set from the match — e.g. 2-2 in
 *  a best-of-5, 1-1 in a best-of-3). The decider is a shorter race to 15. */
export const isDecider = (s: VolleyballState) =>
  s.setsToWin > 1 && s.setsWon.home === s.setsToWin - 1 && s.setsWon.away === s.setsToWin - 1;
/** Points needed to win the current set (15 in the decider, else the set target). */
export const setTarget = (s: VolleyballState) => (isDecider(s) ? s.deciderTarget : s.target);

const reducer = (s: VolleyballState, a: ScoreAction): VolleyballState => {
  if (s.ended || !a.side || (a.type !== 'POINT' && a.type !== 'ACE')) return s;
  const ace = a.type === 'ACE';
  const who = a.attribution?.playerName;
  const current = { ...s.current, [a.side]: s.current[a.side] + 1 };
  const setNo = s.setsWon.home + s.setsWon.away + 1;
  const tgt = setTarget(s); // 15 in the decider, else the set target
  let seq = s.seq;
  const events = [...s.events];
  // Structured fields (kind/playerName/set/points) let the per-set box score
  // aggregate points & aces per player, filtered by set — the timeline ignores them.
  events.push({ id: ++seq, stamp: `Set ${setNo}`, icon: ace ? '🎯' : '🏐', label: ace ? 'Ace' : 'Point', detail: `${current.home}-${current.away}${who ? ` · ${who}` : ''}`, side: a.side, kind: ace ? 'ace' : 'point', playerName: who, set: setNo, points: 1 });

  const h = current.home;
  const v = current.away;
  const m = (s.winByTwo ?? true) ? 2 : 1; // win-by-2, or first-to-target (casual)
  const won = h >= tgt && h - v >= m ? 'home' : v >= tgt && v - h >= m ? 'away' : null;
  if (!won) return { ...s, current, events, seq };

  const sets = [...s.sets, [h, v] as [number, number]];
  const setsWon = { ...s.setsWon, [won]: s.setsWon[won] + 1 };
  const ended = setsWon[won] >= s.setsToWin;
  events.push({ id: ++seq, stamp: 'Set', icon: '🎉', label: `Set ${sets.length} won`, detail: `${h}-${v}`, side: won });
  if (ended) events.push({ id: ++seq, stamp: 'Match', icon: '🏆', label: 'Match won', detail: `${setsWon.home}-${setsWon.away} sets`, side: won });
  return { ...s, current: { home: 0, away: 0 }, setsWon, sets, events, seq, ended };
};

const Row = ({ label, roster, onPick, fallback }: { label: string; roster: Player[]; onPick: (p?: Player) => void; fallback: string }) => (
  <View style={{ gap: theme.spacing(2) }}>
    <Text style={ctrl.label}>{label}</Text>
    {roster.length > 0 ? (
      <View style={ctrl.chips}>{roster.map((p) => <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => onPick(p)} />)}</View>
    ) : (
      <Button label={fallback} variant="ghost" onPress={() => onPick()} />
    )}
  </View>
);

const ScoringControls: SportPlugin<VolleyballState>['ScoringControls'] = ({ dispatch, homeName, awayName, homeRoster = [], awayRoster = [] }) => {
  const act = (type: string, side: 'home' | 'away', stat: string, p?: Player) =>
    dispatch({ type, side, attribution: p ? { playerId: p.id, stat, playerName: p.fullName } : undefined });
  return (
    <View style={{ gap: theme.spacing(4) }}>
      <Row label={`🏐 Point — ${homeName}`} roster={homeRoster} onPick={(p) => act('POINT', 'home', 'points', p)} fallback={`Point ${homeName}`} />
      <Row label={`🏐 Point — ${awayName}`} roster={awayRoster} onPick={(p) => act('POINT', 'away', 'points', p)} fallback={`Point ${awayName}`} />
      <Row label={`🎯 Ace — ${homeName}`} roster={homeRoster} onPick={(p) => act('ACE', 'home', 'aces', p)} fallback={`Ace ${homeName}`} />
      <Row label={`🎯 Ace — ${awayName}`} roster={awayRoster} onPick={(p) => act('ACE', 'away', 'aces', p)} fallback={`Ace ${awayName}`} />
    </View>
  );
};

const LiveExtras: NonNullable<SportPlugin<VolleyballState>['LiveExtras']> = ({ state, homeName, awayName, homeColor, awayColor }) => {
  const s = state as VolleyballState;
  // Sets played so far (completed + the one in progress) drive the box-score toggle.
  const currentSet = s.setsWon.home + s.setsWon.away + 1;
  const periods = Array.from({ length: s.ended ? s.sets.length : currentSet }, (_, i) => ({ value: i + 1, label: `Set ${i + 1}` }));
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Text style={ctrl.label}>Sets</Text>
      <View style={ctrl.setsRow}>
        {s.sets.length === 0 ? (
          <Text style={textStyles.muted}>Set 1 in progress…</Text>
        ) : (
          s.sets.map((g, i) => <Text key={i} style={ctrl.setChip}>S{i + 1}: {g[0]}-{g[1]}</Text>)
        )}
      </View>
      <Text style={ctrl.label}>Player stats</Text>
      <VolleyballBoxScore events={s.events} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} periods={periods} />
      <Text style={ctrl.label}>Point log</Text>
      <LiveTimeline events={s.events} homeColor={homeColor} awayColor={awayColor} emptyText="No points yet." />
    </View>
  );
};

export const volleyballPlugin: SportPlugin<VolleyballState> = {
  id: 'volleyball',
  name: 'Volleyball',
  icon: '🏐',
  archetype: 'running-points',
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  summary: (s) => ({
    homeScore: String(s.current.home),
    awayScore: String(s.current.away),
    statusLine: s.ended ? 'Match Over' : `Set ${s.setsWon.home + s.setsWon.away + 1}${isDecider(s) ? ' · decider' : ''}`,
    detailLine: `Sets — ${s.setsWon.home}:${s.setsWon.away} · ${s.setsToWin === 1 ? 'single set' : `best of ${s.setsToWin * 2 - 1}`} · to ${setTarget(s)}${isDecider(s) ? ' (decider)' : ''}`,
  }),
  ScoringControls,
  LiveExtras,
  formation: () => courtFormation('volleyball'),
  Court: makeCourt('volleyball'),
  voice: { hints: ['point home', 'point away', 'ace {name}'], parse: pointVoice },
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'indoor',
      options: [
        { value: 'indoor', label: 'Indoor (25 · dec 15)', set: { playersPerSide: 6, substitutes: 6, setsToWin: 3, pointsPerSet: 25, deciderPoints: 15, winByTwo: true } },
        { value: 'beach', label: 'Beach (21 · dec 15)', set: { playersPerSide: 2, substitutes: 0, setsToWin: 2, pointsPerSet: 21, deciderPoints: 15, winByTwo: true } },
        { value: 'nineaside', label: '9-a-side (21 · best of 3)', set: { playersPerSide: 9, substitutes: 3, setsToWin: 2, pointsPerSet: 21, deciderPoints: 15, winByTwo: true } },
        { value: 'single', label: 'Single set to 25', set: { playersPerSide: 6, substitutes: 6, setsToWin: 1, pointsPerSet: 25, deciderPoints: 25, winByTwo: true } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'playersPerSide', label: 'Players per side', type: 'count', default: 6, min: 1, max: 11, hint: '6 indoor · 2 beach' },
    { key: 'substitutes', label: 'Substitutes per side', type: 'count', default: 6, min: 0, max: 11, advanced: true },
    {
      key: 'setsToWin', label: 'Match length', type: 'choice', default: 3, advanced: true,
      options: [
        { value: 3, label: 'Best of 5' },
        { value: 2, label: 'Best of 3' },
        { value: 1, label: 'Single set' },
      ],
    },
    { key: 'pointsPerSet', label: 'Points per set', type: 'number', default: 25, min: 10, max: 30, advanced: true },
    { key: 'deciderPoints', label: 'Deciding-set points', type: 'number', default: 15, min: 10, max: 25, advanced: true, hint: 'the final set is a shorter race' },
    {
      key: 'winByTwo', label: 'Set ending', type: 'choice', default: true, advanced: true,
      options: [
        { value: true, label: 'Win by 2 (standard)' },
        { value: false, label: 'First to target (win by 1)' },
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
