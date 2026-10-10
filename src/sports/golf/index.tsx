/**
 * Golf plugin. Two competition shapes (docs/sports/GOLF_DESIGN.md):
 *   • Match play (head-to-head) — THIS plugin's scoring: each hole is won, lost
 *     or halved; state reads "2 UP", "AS", "Dormie 2", "3&2". Runs on the normal
 *     match / bracket engine, so knockout match-play championships just work.
 *   • Stroke play / Stableford (a field of N players, one leaderboard) — scored
 *     on the Golf round screens (field events), not through LiveScoring.
 * The format fields below cover both; `competition` decides which flow is used.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, textStyles } from '../../components/ui';
import { askConfirm } from '../../components/ConfirmSheet';
import { confirmCopy } from '../../core/matchSafety';
import type { SportPlugin } from '../types';
import { matchState, concededLine, type HoleWinner } from './engine';

export interface GolfMatchState {
  /** holes in the match (18 or 9) */
  regulation: number;
  /** knockout: an all-square match goes to extra holes */
  extraHoles: boolean;
  holes: HoleWinner[];
  /** a side conceded the match */
  conceded?: 'home' | 'away';
  ended: boolean;
  seq: number;
}

const init = (config?: Record<string, unknown>): GolfMatchState => ({
  regulation: String(config?.holes ?? '18') === '18' ? 18 : 9,
  extraHoles: config?.extraHoles === true,
  holes: [],
  ended: false,
  seq: 0,
});

const reducer = (s: GolfMatchState, a: { type: string; side?: 'home' | 'away'; payload?: Record<string, unknown> }): GolfMatchState => {
  if (s.ended) return s;
  if (a.type === 'HOLE') {
    const w = a.payload?.winner as HoleWinner | undefined;
    if (w !== 'home' && w !== 'away' && w !== 'halved') return s;
    const holes = [...s.holes, w];
    const m = matchState(holes, s.regulation, s.extraHoles);
    return { ...s, holes, ended: m.decided, seq: s.seq + 1 };
  }
  if (a.type === 'CONCEDE' && (a.side === 'home' || a.side === 'away')) {
    return { ...s, conceded: a.side, ended: true, seq: s.seq + 1 };
  }
  return s;
};

const stateOf = (s: GolfMatchState) => matchState(s.holes, s.regulation, s.extraHoles);

const ScoringControls: SportPlugin<GolfMatchState>['ScoringControls'] = ({ state, dispatch, homeName, awayName, homeRoster = [], awayRoster = [] }) => {
  const s = state as GolfMatchState;
  const m = stateOf(s);
  const [conceding, setConceding] = useState(false);
  const nm = (side: 'home' | 'away') => (side === 'home' ? homeRoster : awayRoster)[0]?.fullName ?? (side === 'home' ? homeName : awayName);
  // SD-117c — a conceded match keeps its hole state ("conceded, 3 down thru 12")
  if (s.ended) return <Text style={textStyles.muted}>Match over{s.conceded ? ` · ${nm(s.conceded)} ${concededLine(s.holes, s.conceded, s.regulation, s.extraHoles)}` : ''}.</Text>;
  const concede = async (side: 'home' | 'away') => {
    const other = side === 'home' ? 'away' : 'home';
    const where = m.played ? ` (${m.status === 'AS' ? 'all square' : `${leaderName} ${m.status}`} thru ${m.played})` : '';
    const ok = await askConfirm(confirmCopy('concede', { what: nm(side), winner: nm(other), detail: `${nm(other)} wins the match${where} and it closes.` }));
    setConceding(false);
    if (ok) dispatch({ type: 'CONCEDE', side });
  };
  const holeNo = m.played + 1;
  const leaderName = m.leader ? nm(m.leader) : null;
  const hole = (winner: HoleWinner) => {
    const side = winner === 'halved' ? undefined : winner;
    const p = side ? (side === 'home' ? homeRoster : awayRoster)[0] : undefined;
    dispatch({ type: 'HOLE', side, payload: { winner }, attribution: p ? { playerId: p.id, playerName: p.fullName, stat: 'holesWon', by: 1 } : undefined });
  };
  return (
    <View style={{ gap: theme.spacing(4) }}>
      <View style={st.box}>
        <Text style={st.big}>{m.status === 'AS' ? 'All square' : `${leaderName} ${m.status}`}</Text>
        <Text style={st.meta}>
          {holeNo > s.regulation ? `Extra hole · ${holeNo}` : `Hole ${holeNo} of ${s.regulation}`}{m.remaining ? ` · ${m.remaining} to play` : ''}
        </Text>
      </View>
      <Button label={`${nm('home')} wins hole ${holeNo}`} variant="home" onPress={() => hole('home')} />
      <Button label={`Hole ${holeNo} halved`} variant="ghost" onPress={() => hole('halved')} />
      <Button label={`${nm('away')} wins hole ${holeNo}`} variant="away" onPress={() => hole('away')} />
      {/* SD-116: conceding the MATCH (not a hole) — at the very end of the
          controls, behind a "who?" step and the confirm sheet. */}
      <View style={st.concede}>
        {!conceding ? (
          <Button label="🏳 Concede match…" variant="ghost" onPress={() => setConceding(true)} />
        ) : (
          <>
            <Text style={st.label}>Who concedes the match?</Text>
            <View style={st.row}>
              {(['home', 'away'] as const).map((side) => (
                <Button key={side} label={nm(side)} variant="ghost" style={st.flex} onPress={() => void concede(side)} />
              ))}
            </View>
            <Button label="Cancel" variant="ghost" onPress={() => setConceding(false)} />
          </>
        )}
      </View>
    </View>
  );
};

const LiveExtras: NonNullable<SportPlugin<GolfMatchState>['LiveExtras']> = ({ state, homeName, awayName }) => {
  const s = state as GolfMatchState;
  let up = 0;
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={st.label}>Hole by hole</Text>
      {s.holes.length === 0 ? <Text style={textStyles.muted}>No holes played yet.</Text> : s.holes.map((w, i) => {
        up += w === 'home' ? 1 : w === 'away' ? -1 : 0;
        const who = w === 'halved' ? 'Halved' : `${w === 'home' ? homeName : awayName} won`;
        const state = up === 0 ? 'AS' : `${up > 0 ? homeName : awayName} ${Math.abs(up)} UP`;
        return <Text key={i} style={textStyles.body}>Hole {i + 1}: {who} · {state}</Text>;
      })}
      {s.conceded ? <Text style={textStyles.body}>🏳 {s.conceded === 'home' ? homeName : awayName} {concededLine(s.holes, s.conceded, s.regulation, s.extraHoles)}</Text> : null}
    </View>
  );
};

export const golfPlugin: SportPlugin<GolfMatchState> = {
  id: 'golf',
  name: 'Golf',
  icon: '⛳',
  archetype: 'measured',
  participantKind: 'individual',
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  result: (s) => {
    if (!s.ended) return null;
    if (s.conceded) return { winner: s.conceded === 'home' ? 'away' : 'home', home: s.conceded === 'home' ? 0 : 1, away: s.conceded === 'away' ? 0 : 1 };
    const m = stateOf(s);
    if (!m.decided) return null;
    if (m.winner === 'halved') return { winner: 'draw', home: 0.5, away: 0.5 };
    return { winner: m.winner as 'home' | 'away', home: m.winner === 'home' ? 1 : 0, away: m.winner === 'away' ? 1 : 0 };
  },
  summary: (s) => {
    const m = stateOf(s);
    const lead = Math.abs(m.up);
    return {
      homeScore: m.up > 0 ? `${lead} UP` : m.up === 0 ? 'AS' : '',
      awayScore: m.up < 0 ? `${lead} UP` : m.up === 0 ? 'AS' : '',
      // SD-117c — the hole state at the concession, from the conceder's side
      statusLine: s.conceded ? `Final · ${concededLine(s.holes, s.conceded, s.regulation, s.extraHoles)}` : m.decided ? `Final · ${m.result}` : `Match play · thru ${m.played}`,
      detailLine: m.dormie ? 'Dormie' : `${s.regulation} holes${s.extraHoles ? ' · extra holes if level' : ''}`,
    };
  },
  ScoringControls,
  LiveExtras,
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'stroke',
      options: [
        { value: 'stroke', label: 'Stroke play (medal)', set: { competition: 'stroke', allowance: 95, holes: '18' } },
        { value: 'stableford', label: 'Stableford', set: { competition: 'stableford', allowance: 95, holes: '18' } },
        { value: 'match', label: 'Match play', set: { competition: 'match', allowance: 100, holes: '18' } },
        { value: 'nine', label: '9-hole stroke play', set: { competition: 'stroke', allowance: 95, holes: 'front9' } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    {
      key: 'competition', label: 'Competition', type: 'choice', default: 'stroke',
      options: [
        { value: 'stroke', label: 'Stroke play' },
        { value: 'stableford', label: 'Stableford' },
        { value: 'match', label: 'Match play' },
      ],
    },
    {
      key: 'holes', label: 'Holes', type: 'choice', default: '18',
      options: [
        { value: '18', label: '18 holes' },
        { value: 'front9', label: 'Front 9' },
        { value: 'back9', label: 'Back 9' },
      ],
    },
    {
      key: 'netScoring', label: 'Scores', type: 'choice', default: 'gross', advanced: true,
      hint: 'stroke play: rank on gross or net (handicap) scores',
      options: [
        { value: 'gross', label: 'Gross' },
        { value: 'net', label: 'Net (handicap)' },
      ],
    },
    { key: 'allowance', label: 'Handicap allowance %', type: 'number', default: 95, min: 0, max: 100, advanced: true, hint: 'WHS: 95% stroke/Stableford, 100% match play' },
    {
      key: 'tieBreak', label: 'Ties', type: 'choice', default: 'countback', advanced: true,
      options: [
        { value: 'countback', label: 'Countback (last 9/6/3/1)' },
        { value: 'shared', label: 'Shared' },
        // SD-89 — a tie for first is "Playoff pending" until the host records the winner
        { value: 'playoff', label: 'Playoff for 1st' },
      ],
    },
    {
      // SD-66 — Best Gross / Best Net boards side by side (stroke play with handicaps)
      key: 'prizes', label: 'Gross + net prizes', type: 'choice', default: 'both', advanced: true,
      hint: 'stroke play: can one player win both the gross and the net prize?',
      options: [
        { value: 'both', label: 'Can win both' },
        { value: 'one', label: 'One prize each (gross first)' },
      ],
    },
    {
      key: 'extraHoles', label: 'Match play if level', type: 'choice', default: false, advanced: true,
      options: [
        { value: false, label: 'Halved' },
        { value: true, label: 'Extra holes (knockout)' },
      ],
    },
  ],
};

const st = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  flex: { flex: 1 },
  concede: { gap: theme.spacing(2), marginTop: theme.spacing(4), paddingTop: theme.spacing(3), borderTopWidth: 1, borderTopColor: theme.colors.border },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  box: { gap: theme.spacing(1), alignItems: 'center', padding: theme.spacing(4), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md },
  big: { color: theme.colors.text, fontSize: 24, fontWeight: '800' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
});
