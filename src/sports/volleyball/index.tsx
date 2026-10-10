/**
 * Volleyball plugin — archetype: running-points. Rally scoring, set to 25
 * (win by 2), best of 3 sets. Each point is logged with HOW it was won (attack,
 * block, ace, opponent error) — see ./engine.ts for who that credits.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { SelectChip, Button, textStyles } from '../../components/ui';
import { LiveTimeline } from '../LiveTimeline';
import { scoreLine, finalSummary } from '../scoreline';
import type { LiveEvent } from '../liveEvents';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';
import { volleyballVoice } from '../voiceParsers';
import { courtFormation, makeCourt } from '../courts';
import { VolleyballBoxScore } from './BoxScore';
import { volleyballTotals } from './fieldTime';
import { mergeTotals, volleyballSetRecord } from '../racketTotals';
import { LineScoreboard } from '../../components/LineScoreboard';
import { RallyPointEditor } from '../RallyPointEditor';
import { init, reducer, isDecider, setTarget, VB_OUTCOMES, volleyballCredits, outcomeAction, standingsUnits, type VolleyballState, type VbOutcome } from './engine';

export { isDecider, setTarget } from './engine';
export type { VolleyballState } from './engine';

/** One side's point panel. Pick HOW the point was won, then (for a credited
 *  outcome) WHO — the outcome defaults to Attack and resets after every point, so
 *  a kill is one tap on the attacker, an opponent's error is one tap, and a
 *  block/ace is two. Without a roster every outcome is a single button. */
function SidePoints({ side, name, color, roster, icon, blocks, dispatch }: {
  side: 'home' | 'away'; name: string; color?: string; roster: Player[]; icon: string; blocks: boolean;
  dispatch: (a: ScoreAction) => void;
}) {
  const [how, setHow] = useState<VbOutcome>('attack');
  const outcomes = VB_OUTCOMES.filter((o) => blocks || o.kind !== 'block');
  const credited = outcomes.filter((o) => o.credited);
  const errors = outcomes.filter((o) => !o.credited);
  const score = (kind: VbOutcome, p?: Player) => { dispatch(outcomeAction(kind, side, p)); setHow('attack'); };
  return (
    <View style={[ctrl.sideBox, { borderLeftColor: color ?? (side === 'home' ? theme.colors.home : theme.colors.away) }]}>
      <Text style={ctrl.label}>{icon} Point — {name}</Text>
      {roster.length > 0 ? (
        <>
          <View style={ctrl.chips}>
            {credited.map((o) => <SelectChip key={o.kind} label={`${o.icon} ${o.label}`} active={how === o.kind} onPress={() => setHow(o.kind)} />)}
          </View>
          <Text style={ctrl.hint}>{VB_OUTCOMES.find((o) => o.kind === how)!.label} by…</Text>
          <View style={ctrl.chips}>
            {roster.map((p) => <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => score(how, p)} />)}
            <SelectChip label="No player" active={false} onPress={() => score(how)} />
          </View>
          <View style={ctrl.chips}>
            {errors.map((o) => <SelectChip key={o.kind} label={`${o.icon} ${o.label}`} active={false} onPress={() => score(o.kind)} />)}
          </View>
        </>
      ) : (
        <View style={ctrl.chips}>
          {outcomes.map((o) => <SelectChip key={o.kind} label={`${o.icon} ${o.label}`} active={false} onPress={() => score(o.kind)} />)}
        </View>
      )}
    </View>
  );
}

/** Point / timeout controls — volleyball's, parameterised so a future set-based
 *  net sport without blocks can reuse them. */
export function makeSetScoringControls(opts: { icon: string; blocks: boolean; timeoutsPerSet: number }): SportPlugin<VolleyballState>['ScoringControls'] {
  const Controls: SportPlugin<VolleyballState>['ScoringControls'] = ({ state, dispatch: rawDispatch, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [], homeLineup = [], awayLineup = [] }) => {
    const s = state as VolleyballState;
    // SD-29: before the first point, stamp who is on court (the lineup's court
    // players, else the matchday squad) — the base for sets played.
    const dispatch = (a: ScoreAction) => {
      if (!s.lineup && !s.events.length && a.type !== 'TIMEOUT') {
        for (const [side, roster, lineup] of [['home', homeRoster, homeLineup], ['away', awayRoster, awayLineup]] as const) {
          const players = courtPlayers(roster, lineup);
          if (players.length) rawDispatch({ type: 'LINEUP', payload: { team: side, players } });
        }
      }
      rawDispatch(a);
    };
    const editorKinds = VB_OUTCOMES
      .filter((o) => opts.blocks || o.kind !== 'block')
      .map((o) => ({ kind: o.kind, label: `${o.icon} ${o.label}`, credited: o.credited }));
    return (
      <View style={{ gap: theme.spacing(4) }}>
        <SidePoints side="home" name={homeName} color={homeColor} roster={homeRoster} icon={opts.icon} blocks={opts.blocks} dispatch={dispatch} />
        <SidePoints side="away" name={awayName} color={awayColor} roster={awayRoster} icon={opts.icon} blocks={opts.blocks} dispatch={dispatch} />
        {opts.timeoutsPerSet > 0 && (() => {
          const setNo = s.setsWon.home + s.setsWon.away + 1;
          const used = (side: 'home' | 'away') => s.events.filter((e) => e.kind === 'timeout' && e.side === side && e.set === setNo).length;
          const left = (side: 'home' | 'away') => Math.max(0, opts.timeoutsPerSet - used(side));
          const label = (side: 'home' | 'away', nm: string) => `⏱️ Timeout — ${nm} (${left(side)} left)`;
          return (
            <View style={{ flexDirection: 'row', gap: theme.spacing(2) }}>
              <Button label={label('home', homeName)} variant="ghost" style={{ flex: 1 }} disabled={left('home') === 0} onPress={() => dispatch({ type: 'TIMEOUT', side: 'home' })} />
              <Button label={label('away', awayName)} variant="ghost" style={{ flex: 1 }} disabled={left('away') === 0} onPress={() => dispatch({ type: 'TIMEOUT', side: 'away' })} />
            </View>
          );
        })()}
        <RallyPointEditor
          events={s.events} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
          homeRoster={homeRoster} awayRoster={awayRoster} dispatch={dispatch} hasAce pointIcon={opts.icon}
          periodLabel={(e) => `Set ${e.set ?? 1}`}
          kinds={editorKinds} defaultKind="attack" creditsOf={volleyballCredits}
        />
      </View>
    );
  };
  return Controls;
}

/** SD-29: the court at the start — lineup slots with a player, else the squad. */
function courtPlayers(roster: Player[], lineup: { playerId?: string; playerName?: string }[]): { id: string; name: string }[] {
  const byId = new Map(roster.map((p) => [p.id, p]));
  const slots = lineup.filter((sl) => sl.playerId);
  if (slots.length) return slots.map((sl) => ({ id: sl.playerId!, name: byId.get(sl.playerId!)?.fullName ?? sl.playerName ?? '' }));
  return roster.map((p) => ({ id: p.id, name: p.fullName }));
}

// Timeouts this set: 2 per set in indoor volleyball.
const ScoringControls = makeSetScoringControls({ icon: '🏐', blocks: true, timeoutsPerSet: 2 });

const LiveExtras: NonNullable<SportPlugin<VolleyballState>['LiveExtras']> = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }) => {
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
      <VolleyballBoxScore events={s.events} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} periods={periods} homeRoster={homeRoster} awayRoster={awayRoster} onPlayer={onPlayer} />
      <Text style={ctrl.label}>Point log</Text>
      <LiveTimeline events={s.events} homeColor={homeColor} awayColor={awayColor} emptyText="No points yet." homeRoster={homeRoster} awayRoster={awayRoster} onPlayer={onPlayer} />
    </View>
  );
};

/** Broadcast-style board: SETS won + a column of points per set, the live set
 *  highlighted — the layout volleyball TV graphics use. */
const VolleyballScoreboard: NonNullable<SportPlugin<VolleyballState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live }) => {
  const s = state as VolleyballState;
  const setNo = s.setsWon.home + s.setsWon.away + 1;
  const nSets = Math.max(1, s.ended ? s.sets.length : setNo);
  const columns = Array.from({ length: nSets }, (_, i) => ({ label: String(i + 1), highlight: !s.ended && i + 1 === setNo }));
  const cell = (side: 'home' | 'away', i: number) =>
    i < s.sets.length ? String(s.sets[i][side === 'home' ? 0 : 1]) : String(s.current[side]);
  return (
    <LineScoreboard
      status={`${s.ended ? 'Match Over' : `Set ${setNo}${isDecider(s) ? ' · Decider' : ''}`} · best of ${s.setsToWin * 2 - 1}`}
      live={live}
      leadLabel="SETS"
      columns={columns}
      winner={s.ended ? (s.setsWon.home > s.setsWon.away ? 'home' : 'away') : undefined}
      home={{ name: homeName, color: homeColor ?? theme.colors.home, lead: String(s.setsWon.home), cells: columns.map((_, i) => cell('home', i)) }}
      away={{ name: awayName, color: awayColor ?? theme.colors.away, lead: String(s.setsWon.away), cells: columns.map((_, i) => cell('away', i)) }}
    />
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
  // SD-29: sets played per player (court stamp + credited points), set
  // absolutely at completion — the per-set denominator (FIVB). Other stats
  // stay incremental.
  // SD-19: + the team's setsWon / setsLost on every player's line.
  statTotals: (s, ctx) => mergeTotals(volleyballTotals(s), volleyballSetRecord(s, ctx)),
  statTotalsPartial: true,
  statTotalsNeedsPlayers: true,
  result: (s) => (s.ended ? { winner: s.setsWon.home > s.setsWon.away ? 'home' : s.setsWon.away > s.setsWon.home ? 'away' : 'draw', home: s.setsWon.home, away: s.setsWon.away } : null),
  // SD-17: rally points over every set (FIVB point ratio).
  standingsUnits,
  Scoreboard: VolleyballScoreboard,
  // SD-01: once ended → sets won + "25-21, 23-25, 15-12" (never the reset 0–0).
  scoreLine: (s, perspective) => scoreLine(s?.sets, { perspective }),
  summary: (s) => s.ended ? finalSummary(s.setsWon, scoreLine(s.sets)) : ({
    homeScore: String(s.current.home),
    awayScore: String(s.current.away),
    statusLine: s.ended ? 'Match Over' : `Set ${s.setsWon.home + s.setsWon.away + 1}${isDecider(s) ? ' · decider' : ''}`,
    detailLine: `Sets — ${s.setsWon.home}:${s.setsWon.away} · ${s.setsToWin === 1 ? 'single set' : `best of ${s.setsToWin * 2 - 1}`} · to ${setTarget(s)}${isDecider(s) ? ' (decider)' : ''}`,
  }),
  ScoringControls,
  LiveExtras,
  formation: () => courtFormation('volleyball'),
  Court: makeCourt('volleyball'),
  voice: { hints: ['attack {name}', 'ace {name}', 'block {name}', 'point home'], parse: volleyballVoice },
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
      key: 'setsToWin', label: 'Match length', type: 'choice', default: 3,
      options: [
        { value: 3, label: 'Best of 5' },
        { value: 2, label: 'Best of 3' },
        { value: 1, label: 'Single set' },
      ],
    },
    { key: 'pointsPerSet', label: 'Points per set', type: 'number', default: 25, min: 10, max: 30 },
    { key: 'deciderPoints', label: 'Deciding-set points', type: 'number', default: 15, min: 10, max: 25, hint: 'the final set is a shorter race' },
    {
      key: 'winByTwo', label: 'Set ending', type: 'choice', default: true,
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
  hint: { color: theme.colors.textMuted, fontSize: theme.font.small },
  sideBox: { gap: theme.spacing(2), borderLeftWidth: 3, paddingLeft: theme.spacing(3) },
  setsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  setChip: {
    color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700',
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3),
  },
});
