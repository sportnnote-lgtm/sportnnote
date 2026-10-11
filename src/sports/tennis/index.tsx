/**
 * Tennis plugin (new) — archetype: set-game-point. Best of 3 sets; games to 6
 * (win by 2, a 7th game settles 6-6); points 0/15/30/40 with deuce & advantage.
 * Points and aces are attributed to players; games and sets hit the timeline.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { textStyles } from '../../components/ui';
import { LiveTimeline } from '../LiveTimeline';
import type { Player } from '../../core/types';
import type { SportPlugin } from '../types';
import { tennisVoice } from '../voiceParsers';
import { courtFormation, makeCourt } from '../courts';
import { MatchBoxScore } from '../../components/BoxScore';
import { tennisBox } from '../boxSources';
import { SetLineBoard } from '../SetLineBoard';
import { RallyPointEditor } from '../RallyPointEditor';
import { MatchStatsPanel } from '../MatchStatsPanel';
import { ServeOrderPicker } from '../ServeOrderPicker';
import { PointDetailRow } from '../PointDetailRow';
import { detailLiveSettings } from '../pointDetailSettings';
import { PointButtons, SecondaryAction, ServeFirstPicker } from '../PointButtons';
import { pointPressure, pressureText } from '../pointStatus';
import { init, reducer, disp, inTiebreak, other, serveInfo, gamesPlayed, summary, scoreLine, lineScore, standingsUnits, tennisCue, tiebreakBanner, type TennisState } from './engine';
import { CueBanner, useCueTimeline } from '../CueBanner';
import { pointInputs } from '../rallyEdit';
import { tennisTotals } from '../racketTotals';
import { cellText } from '../scoreline';
import { durationLine, stampDispatch, withDuration } from '../conduct';
import { makeRacketQuickOptions } from '../RacketQuickOptions';


const ScoringControls: SportPlugin<TennisState>['ScoringControls'] = ({ state, dispatch: rawDispatch, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [] }) => {
  const s = state as TennisState;
  // SD-54 — scoring steps carry the scorer's clock (match / set durations)
  const dispatch = stampDispatch(rawDispatch);
  const act = (type: string, side: 'home' | 'away', stat: string, p?: Player) =>
    dispatch({ type, side, attribution: p ? { playerId: p.id, stat, playerName: p.fullName } : undefined });
  // A double fault: the OPPONENT wins the point (a normal POINT, so the score &
  // replay stay correct); the faulting server is credited a doubleFault via the
  // 2nd-attribution channel (reversed on undo). SD-104: `payload.df` marks the
  // point in the log, so a later correction moves the doubleFaults with it.
  const doubleFault = (server: 'home' | 'away', p?: Player) =>
    dispatch({ type: 'POINT', side: other(server), payload: { df: true }, attribution2: p ? { playerId: p.id, stat: 'doubleFaults', playerName: p.fullName } : undefined });

  // Serve tracking. Who serves first is set before the first point; from there
  // serve alternates each game (and, in doubles, rotates through the pair in the
  // serving order picked at the start of the set — SD-104).
  const serve = serveInfo(s);
  const serverSideName = serve.side === 'home' ? homeName : awayName;
  const receiverSideName = serve.side === 'home' ? awayName : homeName;
  const serverRoster = serve.side === 'home' ? homeRoster : awayRoster;
  const serverP: Player | undefined = s.doubles ? serverRoster[serve.slot] : serverRoster[0];
  const serverName = serverP?.fullName ?? (s.doubles ? `Server ${serve.slot + 1}` : serverSideName);
  const noPlayYet = gamesPlayed(s) === 0 && s.pts.home === 0 && s.pts.away === 0;
  // SD-115: no silent default — the point buttons wait for the toss.
  const needsServer = noPlayYet && !s.serverPicked;
  // SD-104: only the server can hit an ace or double-fault — offer both for the
  // serving side only, credited to the serving player.
  const by = serverP ? serverP.fullName : serverSideName;
  const serverColor = serve.side === 'home' ? homeColor : awayColor;

  return (
    <View style={{ gap: theme.spacing(4) }}>
      {/* SD-117c — derived "Change ends" cue and the tiebreak rules */}
      <CueBanner cue={tennisCue(s)} />
      {!noPlayYet && <Text style={ctrl.serveBanner}>🎾 Serving: {serverName}{s.doubles ? `  ·  ${serverSideName}` : ''}</Text>}
      {tiebreakBanner(s) && <Text style={ctrl.tbBanner}>🎾 {tiebreakBanner(s)}</Text>}
      <ServeFirstPicker
        icon="🎾" homeName={homeName} awayName={awayName} started={!noPlayYet}
        picked={s.serverPicked || !noPlayYet ? s.firstServer : null}
        onPick={(side, fix) => dispatch({ type: 'SET_FIRST_SERVER', payload: fix ? { side, v: 2 } : { side } })}
      />
      {s.doubles && (
        <ServeOrderPicker state={s} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} dispatch={dispatch} icon="🎾" />
      )}
      {/* SD-115 — two big team-coloured point buttons; singles auto-credits */}
      <PointButtons
        homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
        homeRoster={homeRoster} awayRoster={awayRoster} icon="🎾"
        serving={noPlayYet && !s.serverPicked ? null : serve.side}
        disabled={needsServer} disabledHint="Pick who serves first to start scoring."
        onPoint={(side, p) => act('POINT', side, 'points', p)}
      />
      {/* Ace / Double fault: secondary (outline, smaller), below the point buttons */}
      {!needsServer && <View style={ctrl.row}>
        <SecondaryAction label={`🎯 Ace · ${by}`} color={serverColor} onPress={() => act('ACE', serve.side, 'aces', serverP)} />
        <SecondaryAction label={`⚠️ Double fault · ${by} → point ${receiverSideName}`} onPress={() => doubleFault(serve.side, serverP)} />
      </View>}
      {/* SD-107 — optional "how was it won?" for the last point */}
      <PointDetailRow sport="tennis" state={s} dispatch={dispatch} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} />
      <RallyPointEditor
        events={s.events} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
        homeRoster={homeRoster} awayRoster={awayRoster} dispatch={dispatch} hasAce pointIcon="🎾" doubleFault detailSport="tennis"
        periodLabel={(e) => `Set ${e.set ?? 1}`}
      />
    </View>
  );
};

const LiveExtras: NonNullable<SportPlugin<TennisState>['LiveExtras']> = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }) => {
  const s = state as TennisState;
  // SD-117c — change-ends markers on the point log (derived, display only)
  const timeline = useCueTimeline(reducer, s, pointInputs, tennisCue);
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Text style={ctrl.label}>Sets</Text>
      <View style={ctrl.setsRow}>
        {s.sets.length === 0 ? (
          <Text style={textStyles.muted}>Set 1 in progress · games {s.games.home}-{s.games.away}</Text>
        ) : (
          (lineScore(s)?.done ?? []).map((c, i) => <Text key={i} style={ctrl.setChip}>S{i + 1}: {cellText(c)}</Text>)
        )}
      </View>
      {/* SD-22: serve / return figures replayed from the point log, per set */}
      <MatchStatsPanel sport="tennis" state={s} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} homeColor={homeColor} awayColor={awayColor} />
      {/* SD-54 — match and set durations (from the scorer's tap times) */}
      {durationLine(s.events, 'S') ? <Text style={textStyles.muted}>{durationLine(s.events, 'S')}</Text> : null}
      <Text style={ctrl.label}>Player stats</Text>
      <MatchBoxScore sport="tennis" source={tennisBox(s, { homeRoster, awayRoster })} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} />
      <Text style={ctrl.label}>Point log</Text>
      <LiveTimeline events={timeline} homeColor={homeColor} awayColor={awayColor} emptyText="No points yet." homeRoster={homeRoster} awayRoster={awayRoster} onPlayer={onPlayer} />
    </View>
  );
};

/** Broadcast-style board: current-game POINTS + a column of games per set, the
 *  live set highlighted — the layout tennis TV graphics use. A set won in a
 *  tiebreak shows the loser's tiebreak points as a superscript (7 / 6⁴); a match
 *  tiebreak is its own "TB" column. SD-20: the shared SetLineBoard. */
const TennisScoreboard: NonNullable<SportPlugin<TennisState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live, closed }) => {
  const s = state as TennisState;
  const setNo = s.setsWon.home + s.setsWon.away + 1;
  return (
    <SetLineBoard
      ls={lineScore(s)} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} live={live} closed={closed}
      status={`Set ${setNo}${inTiebreak(s) ? ' · Tiebreak' : ''}`} bestOf={`best of ${s.setsToWin * 2 - 1}`}
      // After the match the current-game POINTS are meaningless (0-0), so the
      // headline becomes SETS won — the result a fan reads off a final board.
      leadLabel="POINTS" lead={{ home: disp(s, 'home'), away: disp(s, 'away') }}
      // Serve dot next to the serving side's name (broadcast standard), while live.
      serving={s.ended || (!s.serverPicked && s.events.length === 0) ? null : serveInfo(s).side} serveIcon="🎾"
      // SD-115 — MATCH / SET / BREAK POINT, derived by playing the next point.
      alerts={pressureText(pointPressure(reducer, s, { unit: 'set', server: serveInfo(s).side }), { home: homeName, away: awayName })}
      cue={tennisCue(s)?.text}
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
  // SD-17: games won (ATP % games) — a match tiebreak counts as one game.
  standingsUnits,
  // SD-19: absolute games / sets / points / deciders / tiebreaks per player (and the
  // doubles partner), synced at completion and on correction. Partial: double faults stay on increments.
  statTotals: tennisTotals,
  statTotalsPartial: true,
  statTotalsNeedsPlayers: true,
  Scoreboard: TennisScoreboard,
  // SD-01: once ended → sets won + "6-4, 3-6, 7-6(4)" (never the reset 0–0).
  // SD-54: + the match duration once it's over (stamped matches only)
  summary: (s) => withDuration(summary(s), s.events, s.ended),
  scoreLine,
  // SD-53 / SD-54 — code & time violations, medical / toilet (Quick options)
  QuickOptions: makeRacketQuickOptions('tennis', { serverOf: (st) => serveInfo(st as TennisState).side }),
  // SD-20: the line score (board grid, "6-4, 3-2 ret.") + ITF result marks.
  lineScore,
  retireTerms: true,
  ScoringControls,
  LiveExtras,
  // SD-107 — Point detail / 1st & 2nd serve (event mode: from the next point)
  liveSettings: detailLiveSettings('tennis'),
  formation: () => courtFormation('tennis'),
  Court: makeCourt('tennis'),
  voice: { hints: ['point home', 'ace {name}', 'double fault {name}'], parse: tennisVoice },
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'bo3',
      options: [
        { value: 'bo3', label: 'Best of 3 sets', set: { setsToWin: 2, gamesPerSet: 6, setWinByTwo: true, tiebreakAt: 6, setTiebreak: true, tiebreakPoints: 7, noAd: false, finalSetTiebreak: 0, finalSetTBAt: 0, tbSuddenDeathAt: 0 } },
        { value: 'bo5', label: 'Best of 5 sets', set: { setsToWin: 3, gamesPerSet: 6, setWinByTwo: true, tiebreakAt: 6, setTiebreak: true, tiebreakPoints: 7, noAd: false, finalSetTiebreak: 0, finalSetTBAt: 0, tbSuddenDeathAt: 0 } },
        // SD-02: a Slam plays the 5th set in games and a 10-point tiebreak at 6-6
        // (since 2022). Matches already created with the old gs5 stored
        // finalSetTiebreak: 10 in their own format, so they keep their rules.
        { value: 'gs5', label: 'Grand Slam (Bo5, 10-pt TB at 6-6 in set 5)', set: { setsToWin: 3, gamesPerSet: 6, setWinByTwo: true, tiebreakAt: 6, setTiebreak: true, tiebreakPoints: 7, noAd: false, finalSetTiebreak: 0, finalSetTBAt: 6, tbSuddenDeathAt: 0 } },
        { value: 'fast4', label: 'Fast4', set: { setsToWin: 2, gamesPerSet: 4, setWinByTwo: false, tiebreakAt: 3, setTiebreak: true, tiebreakPoints: 5, noAd: true, finalSetTiebreak: 0, finalSetTBAt: 0, tbSuddenDeathAt: 4 } },
        { value: 'proset', label: 'Pro set (to 8)', set: { setsToWin: 1, gamesPerSet: 8, setWinByTwo: true, tiebreakAt: 8, setTiebreak: true, tiebreakPoints: 7, noAd: false, finalSetTiebreak: 0, finalSetTBAt: 0, tbSuddenDeathAt: 0 } },
        { value: 'match_tb', label: 'Match tiebreak (to 10)', set: { setsToWin: 1, gamesPerSet: 6, setWinByTwo: true, tiebreakAt: 6, setTiebreak: true, tiebreakPoints: 7, noAd: true, finalSetTiebreak: 10, finalSetTBAt: 0, tbSuddenDeathAt: 0 } },
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
      // SD-115 — ITF Fast4: the tiebreak (to 5) is sudden death at 4-4.
      key: 'tbSuddenDeathAt', label: 'Set tiebreak at the end', type: 'choice', default: 0, advanced: true,
      options: [
        { value: 0, label: 'Win by 2' },
        { value: 4, label: 'Sudden death at 4-4 (Fast4)' },
      ],
    },
    {
      key: 'finalSetTiebreak', label: 'Deciding set', type: 'choice', default: 0, advanced: true,
      options: [
        { value: 0, label: 'Full set' },
        { value: 10, label: '10-point match tiebreak' },
      ],
    },
    {
      key: 'finalSetTBAt', label: 'Deciding-set tiebreak', type: 'choice', default: 0, advanced: true,
      hint: 'when the deciding set is a full set',
      options: [
        { value: 0, label: 'Same as other sets' },
        { value: 6, label: '10-point at 6-6 (Grand Slam)' },
      ],
    },
  ],
};

const ctrl = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  flex: { flexGrow: 1, flexBasis: 140 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  serveBanner: {
    color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800',
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3), alignSelf: 'flex-start',
  },
  tbBanner: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  setsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  setChip: {
    color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700',
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3),
  },
});
