/**
 * Shared engine for rally/handout racquet sports (pickleball & squash). Both have
 * the same shape — rally scoring or a serve-based side-out system, win-by-N, best
 * of games — so the scoring rules, server tracking and live UI live here once and
 * each sport supplies only its labels, defaults and format options.
 *
 * Tournament-grade doubles: in side-out scoring the engine tracks which server is
 * up (1 or 2) and the start-of-game "second server" exception. The serving team
 * scores while it wins rallies; a fault by the 1st server hands serve to the 2nd
 * server (same team), and a fault by the 2nd server is a side-out to the other
 * team. The controls resolve the actual serving player from the lineup so points
 * are credited per player and the server is shown by name.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip, textStyles } from '../components/ui';
import { LiveTimeline } from './LiveTimeline';
import { MatchBoxScore } from '../components/BoxScore';
import { rallyBox } from './boxSources';
import { RallyPointEditor } from './RallyPointEditor';
import { MatchStatsPanel } from './MatchStatsPanel';
import { PointDetailRow } from './PointDetailRow';
import { detailLiveSettings } from './pointDetailSettings';
import { PointButtons, SecondaryAction, ServeFirstPicker } from './PointButtons';
import { pointPressure, pressureText } from './pointStatus';
import type { LiveEvent } from './liveEvents';
import type { Player } from '../core/types';
import type { FormatField, ScoreAction, SportPlugin } from './types';
import { courtFormation, makeCourt } from './courts';
import { pointVoice } from './voiceParsers';
import { ttServer, ttServeHint } from './tabletennis/serve';
import { tableTennisCue } from './courtCues';
import { CueBanner, useCueTimeline } from './CueBanner';
import { rallyTotals } from './racketTotals';
import { SetLineBoard } from './SetLineBoard';
import { durationLine, stampDispatch, withDuration } from './conduct';
import { makeRacketQuickOptions } from './RacketQuickOptions';
import { ttDoublesTurn, ttGameStartOrder } from './doublesOrder';
import { DoublesOrderPicker } from './DoublesOrderPicker';
import { makeRallyEngine, rallySummary, rallyScoreLine, rallyLineScore, rallyServingSide, rallyRows, rallyInputs, serveSpot, serverId, startPair, type RallyState } from './rallyEngine';

export type { RallyState } from './rallyEngine';

export interface RallyOpts {
  id: 'pickleball' | 'squash' | 'tabletennis';
  name: string;
  icon: string;
  /** config value of `scoring` that means serve-based: 'sideout' | 'english' */
  sideOutValue: string;
  /** event-log label for a side-out / hand-out */
  sideOutLabel: string;
  /** controls header, e.g. 'Side-out scoring' / 'English scoring' */
  serveSystemLabel: string;
  /** short tag for the scoreboard status line, e.g. 'side-out' / 'English' */
  serveTag: string;
  defaults: { playersPerSide: number; target: number; winBy: number; gamesToWin: number };
  hasCourt: boolean;
  formatFields: FormatField[];
  /** rally-scoring serve order: 'winner' = the rally winner serves next
   *  (pickleball/squash); 'tt' = table tennis (2 serves each, 1 each from 10-10 — 21-point: 5 each, 1 each from 20-20 —
   *  opening server alternates by game). */
  serveRule?: 'winner' | 'tt';
  /** SD-06 (pickleball): name the server by court position. Doubles: one
   *  pre-serve "who starts on the right" pick per team, then the right-court
   *  player by score parity; singles: right on an even score. */
  courtPositions?: boolean;
  /** SD-104 — show "Who serves first?" on the scoring screen before the first
   *  rally (squash, table tennis); dispatches SET_FIRST_SERVER. */
  firstServePicker?: boolean;
}

export function makeRallyPlugin(opts: RallyOpts): SportPlugin<RallyState> {
  const { init, reducer } = makeRallyEngine(opts);

  const ScoringControls: SportPlugin<RallyState>['ScoringControls'] = ({ state, dispatch: rawDispatch, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [] }) => {
    const s = state as RallyState;
    // SD-54 — scoring steps carry the scorer's clock (match / game durations)
    const dispatch = stampDispatch(rawDispatch);
    // SD-21 — "Correct the timeline": edit / delete / insert a past rally. The
    // corrected rally list replays through this engine (EDIT_LOG), so score,
    // games, server and side-outs re-derive; credits follow the replay.
    const editor = (
      <RallyPointEditor
        events={s.events} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
        homeRoster={homeRoster} awayRoster={awayRoster} dispatch={dispatch} hasAce={false} pointIcon={opts.icon}
        periodLabel={(e) => `Game ${e.game ?? 1}`}
        rowsOf={rallyRows} detailSport={opts.id}
        normalize={s.sideOut ? (pts) => rallyInputs(reducer(s, { type: 'EDIT_LOG', payload: { points: pts } }).events) : undefined}
      />
    );
    // SD-107 — optional "how was it won?" for the last rally (side-out rallies too)
    const detailRow = (
      <PointDetailRow sport={opts.id} state={s} dispatch={dispatch} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} rowsOf={rallyRows} />
    );
    // SD-63 — squash: a plain Let (WSF Rule 8) — the rally is replayed, no point;
    // sits with the Stroke / No let decisions of the point detail below.
    const letRow = opts.id === 'squash' && !s.ended && (s.serverPicked || s.events.length > 0) ? (
      <SecondaryAction label="🔁 Let — replay the rally (no point)" onPress={() => dispatch({ type: 'LET' })} />
    ) : null;
    const rosterOf = (t: 'home' | 'away') => (t === 'home' ? homeRoster : awayRoster);
    const point = (side: 'home' | 'away', p?: Player) =>
      dispatch({ type: 'POINT', side, attribution: p ? { playerId: p.id, stat: 'points', playerName: p.fullName } : undefined });

    // SD-06 — court positions (pickleball): the server is the player in the
    // right-hand court, derived from one pre-serve pick + the score.
    const ids = { home: homeRoster.map((p) => p.id), away: awayRoster.map((p) => p.id) };
    const byId = (id?: string) => (id ? [...homeRoster, ...awayRoster].find((p) => p.id === id) : undefined);
    const spot = opts.courtPositions ? serveSpot(s) : null;
    const positionedServer = spot ? byId(serverId(s, ids)) : undefined;
    // "Who starts on the right?" — doubles, before the first point of a game.
    // SD-115: nothing selected until picked (no silent roster-order default),
    // the point buttons wait for both picks at 0-0 of game 1, and a wrong pick
    // can be fixed mid-game (`v:2`) — the server is only derived, the score stays.
    const atGameStart = s.current.home === 0 && s.current.away === 0;
    const startTeams = (['home', 'away'] as const).filter((t) => rosterOf(t).length >= 2);
    const needsStart = !!opts.courtPositions && s.doubles && !s.ended && atGameStart && s.games.length === 0
      && startTeams.some((t) => !s.startRight?.[t]);
    const [fixStart, setFixStart] = React.useState(false);
    const startChips = (fix: boolean) => startTeams.map((t) => {
      const roster = rosterOf(t).slice(0, 2);
      const cur = s.startRight?.[t] && roster.some((p) => p.id === s.startRight?.[t]) ? s.startRight[t]
        : !needsStart ? startPair(s, t, ids[t]).starter : undefined;
      return (
        <View key={t} style={ctrl.chips}>
          <Text style={[ctrl.meta, { alignSelf: 'center' }]}>{t === 'home' ? homeName : awayName}:</Text>
          {roster.map((p) => (
            <SelectChip key={p.id} label={p.fullName} active={cur === p.id}
              onPress={() => dispatch({ type: 'SET_START_RIGHT', payload: { side: t, playerId: p.id, playerName: p.fullName, ...(fix ? { v: 2 } : {}) } })} />
          ))}
        </View>
      );
    });
    const startPicker = !opts.courtPositions || !s.doubles || s.ended || startTeams.length === 0 ? null
      : atGameStart ? (
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={ctrl.label}>Who starts on the right?</Text>
          <Text style={ctrl.meta}>Each team's player in the right-hand court at 0-0 of this game. The first server serves from the right.</Text>
          {startChips(false)}
        </View>
      ) : fixStart ? (
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={ctrl.label}>Who started this game on the right?</Text>
          <Text style={ctrl.meta}>Only who serves changes — the score stays. Serve stats re-derive.</Text>
          {startChips(true)}
          <Text style={ctrl.link} onPress={() => setFixStart(false)} accessibilityRole="button">Done</Text>
        </View>
      ) : (
        <Text style={ctrl.link} onPress={() => setFixStart(true)} accessibilityRole="button">Fix who started on the right</Text>
      );

    // SD-104 / SD-115 — "Who serves first?" (the toss): nothing selected until
    // picked, then a "Fix who served first" link (rally scoring only — in
    // side-out scoring the server decides who can score).
    const noPlayYet = s.events.length === 0 && s.games.length === 0;
    const needsServer = !!opts.firstServePicker && noPlayYet && !s.serverPicked && !s.ended;
    const firstPicker = opts.firstServePicker && !s.ended ? (
      <ServeFirstPicker
        icon={opts.icon} homeName={homeName} awayName={awayName} started={!noPlayYet} canFix={!s.sideOut}
        picked={s.serverPicked || !noPlayYet ? s.opening ?? 'home' : null}
        // SD-65 — pickleball: new matches alternate the first serve by game
        // (USA Pickleball 5.B.1); the flag rides on the toss pick (`alt`).
        onPick={(side, fix) => dispatch({ type: 'SET_FIRST_SERVER', payload: fix ? { side, v: 2 } : { side, ...(opts.id === 'pickleball' ? { alt: true } : {}) } })}
      />
    ) : null;
    const blocked = needsServer || needsStart;
    const blockedHint = needsServer && needsStart ? 'Pick who serves first and who starts on the right to start scoring.'
      : needsServer ? 'Pick who serves first to start scoring.' : 'Pick who starts on the right to start scoring.';

    if (s.sideOut) {
      // The current server's player (for credit + display). With court positions
      // (pickleball) it's the right-court player at the start of the service
      // turn; otherwise server 1/2 maps to the team's first two players.
      const serverIdx = s.doubles ? s.serverNo - 1 : 0;
      const serverOf = (t: 'home' | 'away') => (spot ? positionedServer : rosterOf(t)[serverIdx]);
      const servingTeam = s.serving === 'home' ? homeName : awayName;
      const serverP = serverOf(s.serving);
      const rallyWon = (team: 'home' | 'away') => point(team, team === s.serving ? serverOf(team) : undefined);
      return (
        <View style={{ gap: theme.spacing(4) }}>
          <View style={ctrl.serveBox}>
            <Text style={ctrl.label}>{opts.serveSystemLabel}</Text>
            {blocked ? null : spot ? (
              <>
                <Text style={ctrl.headline}>
                  {opts.icon} Serving: {serverP?.fullName ?? servingTeam} ({spot.court}) · {spot.call}
                </Text>
                <Text style={ctrl.meta}>{servingTeam}{s.doubles ? ` · server ${s.serverNo}` : ''}</Text>
              </>
            ) : (
              <Text style={ctrl.serve}>
                {opts.icon} Serving: {servingTeam}{serverP ? ` · ${serverP.fullName}` : ''}{s.doubles ? ` · server ${s.serverNo}` : ''}
              </Text>
            )}
            <Text style={ctrl.meta}>Tap who won each rally — points and the handout sequence are figured out for you.</Text>
          </View>
          {firstPicker}
          {startPicker}
          {/* SD-115 — the same two big team-coloured buttons as rally scoring; the
              serving player is credited automatically when the server wins. */}
          <PointButtons
            homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
            homeRoster={homeRoster} awayRoster={awayRoster} icon={opts.icon} verb="Rally won" credit={false}
            serving={blocked ? null : s.serving} disabled={blocked} disabledHint={blockedHint}
            onPoint={(t) => rallyWon(t)}
          />
          {letRow}
          {detailRow}
          {editor}
        </View>
      );
    }

    // Rally scoring: every rally is a point — pick who won it. Serve still passes
    // to the rally winner, so show who's serving (the last rally winner, or the
    // opening server before the first point). Doubles names the side; singles the
    // player. No service-court shown here — that rule differs by sport.
    const serverSide: 'home' | 'away' = opts.serveRule === 'tt'
      ? ttServer(s.current.home, s.current.away, s.games.length, s.opening ?? 'home', s.target)
      : rallyServingSide(s);
    const serverSideName = serverSide === 'home' ? homeName : awayName;
    const serverName = spot
      ? `${positionedServer?.fullName ?? serverSideName} (${spot.court}) · ${spot.call}`
      : s.doubles ? serverSideName : rosterOf(serverSide)[0]?.fullName ?? serverSideName;
    // SD-117c (table tennis) — the change-ends cue and where the server is in
    // their turn ("2nd serve of 2"), flagging the switch to 1 each at deuce.
    const isTT = opts.serveRule === 'tt';
    // SD-62 — table tennis doubles (ITTF 2.13): "A serves to X" by name, from
    // the per-game serving / receiving order (roster order until picked).
    const nameOfId = (id?: string) => byId(id)?.fullName ?? '';
    const ttDbl = isTT && s.doubles && !blocked ? ttDoublesTurn(s, ids) : null;
    const ttStart = isTT && s.doubles ? ttGameStartOrder(s, ids) : null;
    const gameNo = s.games.length + 1;
    const ttPicker = ttStart && !blocked && !s.ended ? (
      <DoublesOrderPicker
        icon={opts.icon} gameNo={gameNo} atGameStart={atGameStart}
        servingSide={ttServer(0, 0, s.games.length, s.opening ?? 'home', s.target)}
        homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster}
        server={ttStart.server} receiver={ttStart.receiver} receiverPick={s.games.length === 0}
        receiverNote={`Receives first: ${nameOfId(ttStart.receiver)} — who served to ${nameOfId(ttStart.server)} in the last game (ITTF 2.13.3).`}
        dispatch={dispatch}
      />
    ) : null;
    return (
      <View style={{ gap: theme.spacing(4) }}>
        {isTT && <CueBanner cue={tableTennisCue(s)} />}
        {firstPicker}
        {ttDbl ? (
          <View style={{ gap: theme.spacing(1) }}>
            <Text style={ctrl.headline}>{opts.icon} {nameOfId(ttDbl.server)} serves to {nameOfId(ttDbl.receiver)}</Text>
            {ttDbl.switched ? <Text style={ctrl.meta}>Deciding game: the receivers switched order at {Math.floor(s.target / 2)}.</Text> : null}
          </View>
        ) : !blocked && <Text style={ctrl.serve}>{opts.icon} Serving: {serverName}{s.doubles && serverName !== serverSideName ? `  ·  ${serverSideName}` : ''}</Text>}
        {!blocked && isTT && !s.ended && <Text style={ctrl.meta}>{ttServeHint(s.current.home, s.current.away, s.target)}</Text>}
        {startPicker}
        {ttPicker}
        {/* SD-115 — two big team-coloured point buttons, one layout for every
            scoring system; singles auto-credits, doubles credit is optional. */}
        <PointButtons
          homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
          homeRoster={homeRoster} awayRoster={awayRoster} icon={opts.icon}
          serving={blocked ? null : serverSide} disabled={blocked} disabledHint={blockedHint}
          onPoint={point}
        />
        {letRow}
        {detailRow}
        {editor}
      </View>
    );
  };

  const LiveExtras: NonNullable<SportPlugin<RallyState>['LiveExtras']> = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }) => {
    const s = state as RallyState;
    // SD-117c (table tennis) — change-ends markers on the rally log (display only)
    const timeline = useCueTimeline(reducer, s, rallyInputs, opts.serveRule === 'tt' ? tableTennisCue : null);
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
        <MatchStatsPanel sport={opts.id} state={s} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} homeColor={homeColor} awayColor={awayColor} />
        {/* SD-54 — match and game durations (from the scorer's tap times) */}
        {durationLine(s.events, 'G') ? <Text style={textStyles.muted}>{durationLine(s.events, 'G')}</Text> : null}
        <Text style={ctrl.label}>Box score</Text>
        <MatchBoxScore sport={opts.id} source={rallyBox(s, { homeRoster, awayRoster }, opts.id)} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} />
        <Text style={ctrl.label}>Rally log</Text>
        <LiveTimeline events={timeline} homeColor={homeColor} awayColor={awayColor} emptyText="No rallies yet." homeRoster={homeRoster} awayRoster={awayRoster} onPlayer={onPlayer} />
      </View>
    );
  };

  /** SD-20 (TT-02) — the LineScoreboard: GAMES won + a column of points per game,
   *  the live game highlighted, a serve dot on the serving side (table tennis by
   *  ITTF rotation, side-out by who holds serve, else the last rally winner). */
  const Scoreboard: SportPlugin<RallyState>['Scoreboard'] = ({ state, homeName, awayName, homeColor, awayColor, live, closed }) => {
    const s = state as RallyState;
    const serving: 'home' | 'away' = s.sideOut ? s.serving : opts.serveRule === 'tt'
      ? ttServer(s.current.home, s.current.away, s.games.length, s.opening ?? 'home', s.target)
      : rallyServingSide(s);
    return (
      <SetLineBoard
        ls={rallyLineScore(s)} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} live={live} closed={closed}
        status={rallySummary(s, opts.serveTag, { rallyCall: opts.courtPositions }).statusLine ?? `Game ${s.games.length + 1}`}
        bestOf={s.gamesToWin === 1 ? 'single game' : `best of ${s.gamesToWin * 2 - 1}`}
        serving={s.ended || (!s.serverPicked && s.events.length === 0) ? null : serving} serveIcon={opts.icon}
        // SD-115 — GAME / MATCH POINT, derived by playing the next rally (side-out:
        // only the server can score, so only the server can have one).
        alerts={pressureText(pointPressure(reducer, s, { unit: 'game' }), { home: homeName, away: awayName })}
        cue={opts.serveRule === 'tt' ? tableTennisCue(s)?.text : undefined}
      />
    );
  };

  return {
    id: opts.id,
    name: opts.name,
    icon: opts.icon,
    archetype: 'set-game-point',
    participantKind: 'both', // Singles = individual, Doubles = a pair
    createInitialState: init,
    reducer,
    isComplete: (s) => s.ended,
    result: (s) => (s.ended ? { winner: s.gamesWon.home > s.gamesWon.away ? 'home' : s.gamesWon.away > s.gamesWon.home ? 'away' : 'draw', home: s.gamesWon.home, away: s.gamesWon.away } : null),
    // Every game's rally points (+ any unfinished game) — ITTF points-ratio tie-break.
    standingsPoints: (s) => s.games.reduce(
      (t, [h, a]) => ({ home: t.home + h, away: t.away + a }),
      { home: s.current.home, away: s.current.away },
    ),
    // SD-01: once ended → games won + "11-7, 9-11, 11-5" (never the reset 0–0).
    // SD-117c — pickleball rally scoring shows the "Serving 4-2" call too
    // SD-54 — + the match duration once it's over (stamped matches only)
    summary: (s) => withDuration(rallySummary(s, opts.serveTag, { rallyCall: opts.courtPositions }), s.events, s.ended),
    // SD-53 / SD-54 — conduct / cards / technicals, timeouts (Quick options)
    QuickOptions: makeRacketQuickOptions(opts.id, { gameOf: (st) => { const x = st as RallyState; return { game: x.games.length + 1, target: x.target }; } }),
    scoreLine: rallyScoreLine,
    // SD-20: the line score (LineScoreboard, "11-7, 5-3 ret.") + ITTF/WSF result marks.
    lineScore: rallyLineScore,
    retireTerms: true,
    Scoreboard,
    // SD-19: absolute games / points / deciders per player (and the doubles
    // partner), synced at completion and on correction. SD-22: + the replayed
    // serve / return keys (the sport names the serve rule).
    statTotals: (s, ctx) => rallyTotals(s, ctx, opts.id),
    statTotalsPartial: true,
    statTotalsNeedsPlayers: true,
    ScoringControls,
    LiveExtras,
    // SD-107 — the optional point-detail setting (event mode: from the next rally)
    liveSettings: detailLiveSettings(opts.id) as SportPlugin<RallyState>['liveSettings'],
    voice: { hints: ['rally home', 'rally away', 'point home'], parse: pointVoice },
    formation: opts.hasCourt ? () => courtFormation(opts.id) : undefined,
    Court: opts.hasCourt ? makeCourt(opts.id) : undefined,
    formatFields: opts.formatFields,
  };
}

const ctrl = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  serve: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  headline: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  serveBox: { gap: theme.spacing(1), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  gamesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  gameChip: {
    color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700',
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3),
  },
});
