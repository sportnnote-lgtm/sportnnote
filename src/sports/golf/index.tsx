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
import { concededLine, holeWinner, type HoleWinner } from './engine';
import { initGolfMatch, golfMatchReducer, golfMatchStateOf, type GolfMatchState } from './match';
import { matchHole, holeNumber, scoreStatKey, strokesLine } from './matchStrokes';
import { MatchStrokesSetup } from './MatchStrokesSetup';

// The state + reducer live in ./match (pure, unit-tested); SD-87 adds the
// handicap strokes and per-hole gross strokes as optional keys.
export type { GolfMatchState };
const init = initGolfMatch;
const reducer = golfMatchReducer;
const stateOf = golfMatchStateOf;

const ScoringControls: SportPlugin<GolfMatchState>['ScoringControls'] = ({ state, dispatch, homeName, awayName, homeRoster = [], awayRoster = [] }) => {
  const s = state as GolfMatchState;
  const m = stateOf(s);
  const [conceding, setConceding] = useState(false);
  const [setup, setSetup] = useState(false);
  // SD-87 — this hole's gross strokes (null = start at par), reset per hole
  const [gross, setGross] = useState<{ hole: number; home: number | null; away: number | null }>({ hole: -1, home: null, away: null });
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
  // SD-87 — a back-nine match reads 10–18 (19 for the first extra hole)
  const holeNo = holeNumber(s.firstHole, m.played);
  const lastNo = holeNumber(s.firstHole, s.regulation - 1);
  const leaderName = m.leader ? nm(m.leader) : null;
  const ms = s.strokes;
  const here = ms ? matchHole(ms, m.played) : null;
  const hole = (winner: HoleWinner, strokes?: { home: number; away: number }) => {
    const side = winner === 'halved' ? undefined : winner;
    const p = side ? (side === 'home' ? homeRoster : awayRoster)[0] : undefined;
    if (!strokes || !here) {
      dispatch({ type: 'HOLE', side, payload: { winner }, attribution: p ? { playerId: p.id, playerName: p.fullName, stat: 'holesWon', by: 1, side } : undefined });
      return;
    }
    // SD-87 — strokes entered: each player's score on the hole (birdie, par …)
    // is credited too, beside the hole won
    const credit = (who: 'home' | 'away') => {
      const pl = (who === 'home' ? homeRoster : awayRoster)[0];
      if (!pl) return undefined;
      const key = scoreStatKey(strokes[who], here.hole.par);
      // SD-119: `side` — each player's line names the OTHER player
      return winner === who
        ? { playerId: pl.id, playerName: pl.fullName, stat: 'holesWon', by: 1, extra: { [key]: 1 }, side: who }
        : { playerId: pl.id, playerName: pl.fullName, stat: key, by: 1, side: who };
    };
    dispatch({ type: 'HOLE', side, payload: { winner, home: strokes.home, away: strokes.away }, attribution: credit('home'), attribution2: credit('away') });
  };
  const cur = gross.hole === m.played ? gross : { hole: m.played, home: null, away: null };
  const par = here?.hole.par ?? 4;
  const val = (side: 'home' | 'away') => cur[side] ?? par;
  const step = (side: 'home' | 'away', by: 1 | -1) => setGross({ ...cur, [side]: Math.max(1, Math.min(20, val(side) + by)) });
  const netWinner = here ? holeWinner(val('home'), val('away'), here.home, here.away) : null;
  const shots = (side: 'home' | 'away') => (here ? here[side] : 0);
  return (
    <View style={{ gap: theme.spacing(4) }}>
      <View style={st.box}>
        <Text style={st.big}>{m.status === 'AS' ? 'All square' : `${leaderName} ${m.status}`}</Text>
        <Text style={st.meta}>
          {m.played >= s.regulation ? `Extra hole · ${holeNo}` : `Hole ${holeNo}${s.firstHole ? ` (${m.played + 1} of ${s.regulation})` : ` of ${s.regulation}`}`}{m.remaining ? ` · ${m.remaining} to play` : ''}
        </Text>
        {here ? <Text style={st.meta}>Par {here.hole.par} · SI {here.hole.si}{shots('home') || shots('away') ? ` · ${(['home', 'away'] as const).filter((x) => shots(x)).map((x) => `${'●'.repeat(Math.abs(shots(x)))} ${nm(x)} ${shots(x) > 0 ? 'gets a shot' : 'gives a shot'}`).join(' · ')}` : ' · no shots'}</Text> : null}
      </View>
      {ms && here && netWinner ? (
        // SD-87 — gross strokes for both sides; the hole goes on NET strokes
        <View style={st.strokeBox}>
          {(['home', 'away'] as const).map((side) => (
            <View key={side} style={st.strokeRow}>
              <Text style={[textStyles.body, st.flex]} numberOfLines={1}>{nm(side)}{shots(side) > 0 ? `  ${'●'.repeat(shots(side))}` : ''}</Text>
              <Button label="−" variant="ghost" style={st.stepBtn} onPress={() => step(side, -1)} />
              <View style={st.strokeVal}>
                <Text style={st.strokeNum}>{val(side)}</Text>
                {shots(side) ? <Text style={st.meta}>net {val(side) - shots(side)}</Text> : null}
              </View>
              <Button label="+" variant="ghost" style={st.stepBtn} onPress={() => step(side, 1)} />
            </View>
          ))}
          <Button
            label={`Record hole ${holeNo}: ${netWinner === 'halved' ? 'halved' : `${nm(netWinner)} wins`}`}
            variant={netWinner === 'halved' ? 'ghost' : netWinner}
            onPress={() => hole(netWinner, { home: val('home'), away: val('away') })}
          />
          <Text style={st.meta}>Or tap the result without strokes:</Text>
        </View>
      ) : null}
      <Button label={`${nm('home')} wins hole ${holeNo}`} variant="home" onPress={() => hole('home')} />
      <Button label={`Hole ${holeNo} halved`} variant="ghost" onPress={() => hole('halved')} />
      <Button label={`${nm('away')} wins hole ${holeNo}`} variant="away" onPress={() => hole('away')} />
      {/* SD-87 — handicap strokes (WHS Appendix C: 100% of the difference) */}
      {setup ? (
        <MatchStrokesSetup
          regulation={s.regulation}
          firstHole={s.firstHole}
          homeName={nm('home')}
          awayName={nm('away')}
          homeIndex={s.strokes?.homeIndex ?? homeRoster[0]?.sportDetails?.golf?.handicapIndex}
          awayIndex={s.strokes?.awayIndex ?? awayRoster[0]?.sportDetails?.golf?.handicapIndex}
          onSave={(x) => { dispatch({ type: 'SET_STROKES', payload: x ? { strokes: x } : {} }); setSetup(false); }}
          onCancel={() => setSetup(false)}
          hasStrokes={!!ms}
        />
      ) : (
        <View style={{ gap: theme.spacing(1) }}>
          {ms ? <Text style={st.meta}>⛳ {strokesLine(ms, nm('home'), nm('away'))}{ms.course ? ` · ${ms.course}` : ''}</Text> : null}
          <Button label={ms ? '⚙ Change strokes / course' : '⛳ Enter strokes · handicap shots'} variant="ghost" onPress={() => setSetup(true)} />
        </View>
      )}
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
      {s.strokes ? <Text style={textStyles.muted}>{strokesLine(s.strokes, homeName, awayName)}</Text> : null}
      {s.holes.length === 0 ? <Text style={textStyles.muted}>No holes played yet.</Text> : s.holes.map((w, i) => {
        up += w === 'home' ? 1 : w === 'away' ? -1 : 0;
        const who = w === 'halved' ? 'Halved' : `${w === 'home' ? homeName : awayName} won`;
        const state = up === 0 ? 'AS' : `${up > 0 ? homeName : awayName} ${Math.abs(up)} UP`;
        // SD-87 — the gross strokes (● = a shot received there)
        const sc = s.scores?.[i];
        const mh = s.strokes ? matchHole(s.strokes, i) : null;
        const dot = (n: number) => (n > 0 ? '●'.repeat(n) : '');
        const strokes = sc ? ` (${sc.home}${mh ? dot(mh.home) : ''}–${sc.away}${mh ? dot(mh.away) : ''})` : '';
        return <Text key={i} style={textStyles.body}>Hole {holeNumber(s.firstHole, i)}: {who}{strokes} · {state}</Text>;
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
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small, textAlign: 'center' },
  strokeBox: { gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border },
  strokeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  stepBtn: { minWidth: 48, paddingHorizontal: 0 },
  strokeVal: { width: 56, alignItems: 'center' },
  strokeNum: { color: theme.colors.text, fontSize: 24, fontWeight: '800' },
});
