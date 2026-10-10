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
import { Button, SelectChip, textStyles } from '../components/ui';
import { LiveTimeline } from './LiveTimeline';
import { PointBoxScore } from './PointBoxScore';
import { RallyPointEditor } from './RallyPointEditor';
import type { LiveEvent } from './liveEvents';
import type { Player } from '../core/types';
import type { FormatField, ScoreAction, SportPlugin } from './types';
import { courtFormation, makeCourt } from './courts';
import { pointVoice } from './voiceParsers';
import { ttServer } from './tabletennis/serve';
import { makeRallyEngine, rallySummary, rallyScoreLine, rallyServingSide, rallyRows, rallyInputs, serveSpot, serverId, startPair, type RallyState } from './rallyEngine';

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
   *  (pickleball/squash); 'tt' = table tennis (2 serves each, 1 each from 10-10,
   *  opening server alternates by game). */
  serveRule?: 'winner' | 'tt';
  /** SD-06 (pickleball): name the server by court position. Doubles: one
   *  pre-serve "who starts on the right" pick per team, then the right-court
   *  player by score parity; singles: right on an even score. */
  courtPositions?: boolean;
}

export function makeRallyPlugin(opts: RallyOpts): SportPlugin<RallyState> {
  const { init, reducer } = makeRallyEngine(opts);

  const ScoringControls: SportPlugin<RallyState>['ScoringControls'] = ({ state, dispatch, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [] }) => {
    const s = state as RallyState;
    // SD-21 — "Correct the timeline": edit / delete / insert a past rally. The
    // corrected rally list replays through this engine (EDIT_LOG), so score,
    // games, server and side-outs re-derive; credits follow the replay.
    const editor = (
      <RallyPointEditor
        events={s.events} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
        homeRoster={homeRoster} awayRoster={awayRoster} dispatch={dispatch} hasAce={false} pointIcon={opts.icon}
        periodLabel={(e) => `Game ${e.game ?? 1}`}
        rowsOf={rallyRows}
        normalize={s.sideOut ? (pts) => rallyInputs(reducer(s, { type: 'EDIT_LOG', payload: { points: pts } }).events) : undefined}
      />
    );
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
    const startPicker = opts.courtPositions && s.doubles && !s.ended && s.current.home === 0 && s.current.away === 0
      ? (
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={ctrl.label}>Who starts on the right?</Text>
          <Text style={ctrl.meta}>Each team's player in the right-hand court at 0-0 of this game. The first server serves from the right.</Text>
          {(['home', 'away'] as const).map((t) => {
            const roster = rosterOf(t).slice(0, 2);
            if (roster.length < 2) return null;
            const cur = startPair(s, t, ids[t]).starter;
            return (
              <View key={t} style={ctrl.chips}>
                <Text style={[ctrl.meta, { alignSelf: 'center' }]}>{t === 'home' ? homeName : awayName}:</Text>
                {roster.map((p) => (
                  <SelectChip key={p.id} label={p.fullName} active={cur === p.id}
                    onPress={() => dispatch({ type: 'SET_START_RIGHT', payload: { side: t, playerId: p.id, playerName: p.fullName } })} />
                ))}
              </View>
            );
          })}
        </View>
      ) : null;

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
            {spot ? (
              <>
                <Text style={ctrl.headline}>
                  {opts.icon} Serving: {serverP?.fullName ?? servingTeam} ({spot.court}) · {spot.call}
                </Text>
                <Text style={ctrl.meta}>{servingTeam}{s.doubles ? ` · server ${s.serverNo}` : ''}</Text>
              </>
            ) : (
              <Text style={ctrl.serve}>
                🏓 Serving: {servingTeam}{serverP ? ` · ${serverP.fullName}` : ''}{s.doubles ? ` · server ${s.serverNo}` : ''}
              </Text>
            )}
            <Text style={ctrl.meta}>Tap who won each rally — points and the handout sequence are figured out for you.</Text>
          </View>
          {startPicker}
          <View style={ctrl.row}>
            <Button label={`Rally won — ${homeName}`} variant="home" style={ctrl.flex} onPress={() => rallyWon('home')} />
            <Button label={`Rally won — ${awayName}`} variant="away" style={ctrl.flex} onPress={() => rallyWon('away')} />
          </View>
          {editor}
        </View>
      );
    }

    // Rally scoring: every rally is a point — pick who won it. Serve still passes
    // to the rally winner, so show who's serving (the last rally winner, or the
    // opening server before the first point). Doubles names the side; singles the
    // player. No service-court shown here — that rule differs by sport.
    const serverSide: 'home' | 'away' = opts.serveRule === 'tt'
      ? ttServer(s.current.home, s.current.away, s.games.length, s.opening ?? 'home')
      : rallyServingSide(s);
    const serverSideName = serverSide === 'home' ? homeName : awayName;
    const serverName = spot
      ? `${positionedServer?.fullName ?? serverSideName} (${spot.court}) · ${spot.call}`
      : s.doubles ? serverSideName : rosterOf(serverSide)[0]?.fullName ?? serverSideName;
    const Row = ({ label, roster, side, name }: { label: string; roster: Player[]; side: 'home' | 'away'; name: string }) => (
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>{label}</Text>
        {roster.length > 0 ? (
          <View style={ctrl.chips}>
            {roster.map((p) => <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => point(side, p)} />)}
          </View>
        ) : (
          <Button label={`+1 ${name}`} variant={side} onPress={() => point(side)} />
        )}
      </View>
    );
    return (
      <View style={{ gap: theme.spacing(4) }}>
        <Text style={ctrl.serve}>{opts.icon} Serving: {serverName}{s.doubles && serverName !== serverSideName ? `  ·  ${serverSideName}` : ''}</Text>
        {startPicker}
        <Row label={`${opts.icon} Point — ${homeName}`} roster={homeRoster} side="home" name={homeName} />
        <Row label={`${opts.icon} Point — ${awayName}`} roster={awayRoster} side="away" name={awayName} />
        {editor}
      </View>
    );
  };

  const LiveExtras: NonNullable<SportPlugin<RallyState>['LiveExtras']> = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }) => {
    const s = state as RallyState;
    const periods = Array.from({ length: Math.max(1, s.games.length + 1) }, (_, i) => i + 1);
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
        <Text style={ctrl.label}>Box score</Text>
        <PointBoxScore events={s.events} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} homeColor={homeColor} awayColor={awayColor} periods={periods} periodLabel="Game" onPlayer={onPlayer} />
        <Text style={ctrl.label}>Rally log</Text>
        <LiveTimeline events={s.events} homeColor={homeColor} awayColor={awayColor} emptyText="No rallies yet." homeRoster={homeRoster} awayRoster={awayRoster} onPlayer={onPlayer} />
      </View>
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
    summary: (s) => rallySummary(s, opts.serveTag),
    scoreLine: rallyScoreLine,
    ScoringControls,
    LiveExtras,
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
