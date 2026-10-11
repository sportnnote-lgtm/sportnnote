/**
 * Padel plugin — archetype: set-game-point. Padel uses tennis scoring, with the
 * common club/tour variations all optional (defaults = classic tennis rules):
 *   • Deuce        — Advantage (classic, default), Golden point (sudden death
 *                    at 40-40, the World Padel Tour rule, great for fast games)
 *                    or Star Point (SD-64, FIP 2026: two advantages, then the
 *                    next point at the third deuce wins).
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
import { textStyles } from '../../components/ui';
import { LiveTimeline } from '../LiveTimeline';
import { MatchBoxScore } from '../../components/BoxScore';
import { padelBox } from '../boxSources';
import { RallyPointEditor } from '../RallyPointEditor';
import { MatchStatsPanel } from '../MatchStatsPanel';
import { ServeOrderPicker } from '../ServeOrderPicker';
import { PointDetailRow } from '../PointDetailRow';
import { detailLiveSettings } from '../pointDetailSettings';
import { PointButtons, SecondaryAction, ServeFirstPicker } from '../PointButtons';
import { CueBanner, useCueTimeline } from '../CueBanner';
import { pointInputs } from '../rallyEdit';
import { pointPressure, pressureText } from '../pointStatus';
import type { Player } from '../../core/types';
import type { SportPlugin } from '../types';
import { pointVoice } from '../voiceParsers';
import { courtFormation, makeCourt } from '../courts';
import { init, reducer, disp, inTiebreak, matchTbActive, serveInfo, gamesPlayed, summary, scoreLine, lineScore, standingsUnits, padelCue, other, decidingPoint, deuceNo, type PadelState } from './engine';
import { setSportGameLabels } from '../gameLabels';
import { padelTotals } from '../racketTotals';
import { cellText } from '../scoreline';
import { durationLine, stampDispatch, withDuration } from '../conduct';
import { makeRacketQuickOptions } from '../RacketQuickOptions';
import { SetLineBoard } from '../SetLineBoard';
export type { PadelState } from './engine';

const ScoringControls: SportPlugin<PadelState>['ScoringControls'] = ({ state, dispatch: rawDispatch, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [] }) => {
  const s = state as PadelState;
  // SD-54 — scoring steps carry the scorer's clock (match / set durations)
  const dispatch = stampDispatch(rawDispatch);
  const act = (side: 'home' | 'away', p?: Player) =>
    dispatch({ type: 'POINT', side, attribution: p ? { playerId: p.id, stat: 'points', playerName: p.fullName } : undefined });
  const deucePoint = s.goldenPoint && !inTiebreak(s) && s.pts.home >= 3 && s.pts.away >= 3;
  // SD-64 — Star Point: which deuce we're at, and the deciding point at the 3rd
  const starDeuce = s.starPoint && !s.ended ? deuceNo(s) : 0;
  const starNow = decidingPoint(s) === 'star';
  // Serve: who serves first is set before the first point, then alternates each
  // game (and, in doubles, rotates through the pair).
  const serve = serveInfo(s);
  const serverSideName = serve.side === 'home' ? homeName : awayName;
  const serverRoster = serve.side === 'home' ? homeRoster : awayRoster;
  const serverName = s.doubles
    ? serverRoster[serve.slot]?.fullName ?? `Server ${serve.slot + 1}`
    : serverRoster[0]?.fullName ?? serverSideName;
  const noPlayYet = gamesPlayed(s) === 0 && s.pts.home === 0 && s.pts.away === 0;
  // SD-115: no silent default — the point buttons wait for the toss.
  const needsServer = noPlayYet && !s.serverPicked;
  // SD-117c — one-tap Ace / Double fault for the CURRENT server (as tennis
  // SD-104): an ace is the server's point with the "Ace" detail; a double
  // fault is the receivers' point marked with the faulting server.
  const serverP: Player | undefined = s.doubles ? serverRoster[serve.slot] : serverRoster[0];
  const by = serverP ? serverP.fullName : serverSideName;
  const receiverSideName = serve.side === 'home' ? awayName : homeName;
  const ace = () => dispatch({ type: 'POINT', side: serve.side, payload: { pd: { how: 'ace' } }, attribution: serverP ? { playerId: serverP.id, stat: 'points', playerName: serverP.fullName } : undefined });
  const doubleFault = () => dispatch({ type: 'POINT', side: other(serve.side), payload: { df: true }, attribution2: serverP ? { playerId: serverP.id, stat: 'doubleFaults', playerName: serverP.fullName } : undefined });
  return (
    <View style={{ gap: theme.spacing(4) }}>
      {/* SD-117c — derived "Change ends" cue (FIP, as tennis) */}
      <CueBanner cue={padelCue(s)} />
      {!noPlayYet && <Text style={ctrl.serve}>🟡 Serving: {serverName}{s.doubles ? `  ·  ${serverSideName}` : ''}</Text>}
      <ServeFirstPicker
        icon="🟡" homeName={homeName} awayName={awayName} started={!noPlayYet}
        picked={s.serverPicked || !noPlayYet ? s.firstServer : null}
        onPick={(side, fix) => dispatch({ type: 'SET_FIRST_SERVER', payload: fix ? { side, v: 2 } : { side } })}
      />
      {s.doubles && (
        <ServeOrderPicker state={s} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} dispatch={dispatch} icon="🟡" />
      )}
      {matchTbActive(s) && <Text style={ctrl.serve}>🟡 Match tiebreak — first to 10 (win by 2).</Text>}
      {deucePoint && <Text style={ctrl.serve}>⚡ Golden point — next point wins the game.</Text>}
      {starNow ? <Text style={ctrl.serve}>⭐ Star point — 3rd deuce: the next point wins the game. The receiving pair chooses who receives.</Text>
        : starDeuce > 0 ? <Text style={ctrl.serve}>Deuce {starDeuce} of 3 · Star Point: {starDeuce === 1 ? 'two advantages' : 'one more advantage'} before the deciding point.</Text> : null}
      {/* SD-115 — two big team-coloured point buttons; doubles credit optional */}
      <PointButtons
        homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
        homeRoster={homeRoster} awayRoster={awayRoster} icon="🟡"
        serving={needsServer ? null : serve.side}
        disabled={needsServer} disabledHint="Pick who serves first to start scoring."
        onPoint={act}
      />
      {/* SD-117c — Ace / Double fault: secondary, below the point buttons, server only */}
      {!needsServer && <View style={ctrl.row}>
        <SecondaryAction label={`🎯 Ace · ${by}`} color={serve.side === 'home' ? homeColor : awayColor} onPress={ace} />
        <SecondaryAction label={`⚠️ Double fault · ${by} → point ${receiverSideName}`} onPress={doubleFault} />
      </View>}
      {/* SD-107 — optional "how was it won?" for the last point */}
      <PointDetailRow sport="padel" state={s} dispatch={dispatch} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} />
      {/* SD-21 — edit / delete / insert a past point; the engine replays it (EDIT_LOG). */}
      <RallyPointEditor
        events={s.events} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
        homeRoster={homeRoster} awayRoster={awayRoster} dispatch={dispatch} hasAce={false} pointIcon="🟡" detailSport="padel" doubleFault
        periodLabel={(e) => (e.stamp === 'Match TB' ? 'Match TB' : `Set ${e.set ?? 1}`)}
      />
    </View>
  );
};

const LiveExtras: NonNullable<SportPlugin<PadelState>['LiveExtras']> = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }) => {
  const s = state as PadelState;
  // SD-117c — change-ends markers on the point log (derived, display only)
  const cued = useCueTimeline(reducer, s, pointInputs, padelCue);
  // SD-75 — "Hold · Lions" / "Break · Tigers", sets and match with team names (display only)
  const timeline = React.useMemo(() => setSportGameLabels(cued, s, { home: homeName, away: awayName }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cued, s.firstServer, homeName, awayName]);
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Text style={ctrl.label}>Sets</Text>
      <View style={ctrl.setsRow}>
        {s.sets.length === 0 ? (
          <Text style={textStyles.muted}>{matchTbActive(s) ? 'Match tiebreak in progress' : `Set 1 in progress · games ${s.games.home}-${s.games.away}`}</Text>
        ) : (
          (lineScore(s)?.done ?? []).map((c, i) => <Text key={i} style={ctrl.setChip}>S{i + 1}: {cellText(c)}</Text>)
        )}
      </View>
      {/* SD-22: serve / return figures replayed from the point log, per set */}
      <MatchStatsPanel sport="padel" state={s} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} homeColor={homeColor} awayColor={awayColor} />
      {/* SD-54 — match and set durations (from the scorer's tap times) */}
      {durationLine(s.events, 'S') ? <Text style={textStyles.muted}>{durationLine(s.events, 'S')}</Text> : null}
      <Text style={ctrl.label}>Box score</Text>
      <MatchBoxScore sport="padel" source={padelBox(s, { homeRoster, awayRoster })} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} />
      <Text style={ctrl.label}>Point log</Text>
      <LiveTimeline events={timeline} homeColor={homeColor} awayColor={awayColor} emptyText="No points yet." homeRoster={homeRoster} awayRoster={awayRoster} onPlayer={onPlayer} />
    </View>
  );
};

/** SD-20 — broadcast board (as tennis): current-game POINTS + a column of games
 *  per set, the live set highlighted, 7 / 6⁴ for a set tiebreak and the match
 *  tiebreak as its own "TB" column (10 / 7). */
const PadelScoreboard: NonNullable<SportPlugin<PadelState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live, closed }) => {
  const s = state as PadelState;
  const setNo = s.setsWon.home + s.setsWon.away + 1;
  return (
    <SetLineBoard
      ls={lineScore(s)} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} live={live} closed={closed}
      status={matchTbActive(s) ? 'Match tiebreak' : `Set ${setNo}${inTiebreak(s) ? ' · Tiebreak' : ''}${s.goldenPoint ? ' · golden pt' : decidingPoint(s) === 'star' ? ' · ⭐ STAR POINT' : s.starPoint ? ' · star pt' : ''}`}
      bestOf={s.setsToWin === 1 ? 'single set' : `best of ${s.setsToWin * 2 - 1}`}
      leadLabel="POINTS" lead={{ home: disp(s, 'home'), away: disp(s, 'away') }}
      serving={s.ended || (!s.serverPicked && s.events.length === 0) ? null : serveInfo(s).side} serveIcon="🟡"
      // SD-115 — MATCH / SET / BREAK POINT, derived by playing the next point.
      alerts={pressureText(pointPressure(reducer, s, { unit: 'set', server: serveInfo(s).side }), { home: homeName, away: awayName })}
      cue={padelCue(s)?.text}
    />
  );
};

export const padelPlugin: SportPlugin<PadelState> = {
  id: 'padel',
  name: 'Padel',
  icon: '🟡',
  archetype: 'set-game-point',
  participantKind: 'both', // doubles-primary, but singles is possible
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  result: (s) => (s.ended ? { winner: s.setsWon.home > s.setsWon.away ? 'home' : s.setsWon.away > s.setsWon.home ? 'away' : 'draw', home: s.setsWon.home, away: s.setsWon.away } : null),
  // SD-17: games won (FIP games difference) — a match tiebreak counts as one game.
  standingsUnits,
  // SD-19: absolute games / sets / points / deciders / tiebreaks per player (and the
  // doubles partner), synced at completion and on correction. Partial: any other live key stays on increments.
  statTotals: padelTotals,
  statTotalsPartial: true,
  statTotalsNeedsPlayers: true,
  // SD-01: once ended → sets won + "6-4, 3-6, [10-7]" (never the reset 0–0).
  // SD-54: + the match duration once it's over (stamped matches only)
  summary: (s) => withDuration(summary(s), s.events, s.ended),
  scoreLine,
  // SD-53 — FIP code violations (Quick options)
  QuickOptions: makeRacketQuickOptions('padel'),
  // SD-20: the line score (board grid, "6-4, 3-2 ret.", [10-7]) + FIP/ITF result marks.
  lineScore,
  retireTerms: true,
  Scoreboard: PadelScoreboard,
  ScoringControls,
  LiveExtras,
  // SD-107 — the optional point-detail setting (event mode: from the next point)
  liveSettings: detailLiveSettings('padel'),
  formation: () => courtFormation('padel'),
  Court: makeCourt('padel'),
  voice: { hints: ['point home', 'point away', '{name} scores'], parse: pointVoice },
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'premier',
      options: [
        { value: 'premier', label: 'Golden point (WPT style)', set: { deuce: 'golden', gamesPerSet: 6, setsToWin: 2, decider: 'set' } },
        // SD-64 — FIP / Premier Padel from 2026 (Rules of Padel, Rule 1 option 2)
        { value: 'star', label: 'Star Point (FIP / Premier Padel 2026)', set: { deuce: 'star', gamesPerSet: 6, setsToWin: 2, decider: 'set' } },
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
      key: 'deuce', label: 'At deuce', type: 'choice', default: 'advantage',
      hint: 'how 40-40 is decided',
      options: [
        { value: 'advantage', label: 'Advantage (classic)' },
        { value: 'golden', label: 'Golden point' },
        { value: 'star', label: 'Star Point (2 advantages, then deciding point)' },
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
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  serve: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  setsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  setChip: {
    color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700',
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3),
  },
});
