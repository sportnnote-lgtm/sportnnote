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
import type { LiveEvent } from './liveEvents';
import type { Player } from '../core/types';
import type { FormatField, ScoreAction, SportPlugin } from './types';
import { courtFormation, makeCourt } from './courts';
import { pointVoice } from './voiceParsers';
import { ttServer } from './tabletennis/serve';

export interface RallyState {
  current: { home: number; away: number };
  games: Array<[number, number]>;
  gamesWon: { home: number; away: number };
  /** points to win a game */
  target: number;
  /** margin needed: 2 (win by two) or 1 (hard cap) */
  winBy: number;
  /** games a side must win to take the match */
  gamesToWin: number;
  /** true = serve-based scoring (only the server scores) */
  sideOut: boolean;
  /** doubles → two servers per side-out (server 1 then 2); singles → one */
  doubles: boolean;
  /** which side currently holds serve (side-out only) */
  serving: 'home' | 'away';
  /** which server is up: 1 or 2 (doubles side-out only) */
  serverNo: 1 | 2;
  events: LiveEvent[];
  seq: number;
  ended: boolean;
}

const other = (side: 'home' | 'away') => (side === 'home' ? 'away' : 'home');

/** First to `target`, by the required margin (`winBy`). winBy 1 = first to target. */
function gameWinner(h: number, a: number, target: number, winBy: number): 'home' | 'away' | null {
  if (h >= target && h - a >= winBy) return 'home';
  if (a >= target && a - h >= winBy) return 'away';
  return null;
}

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
}

export function makeRallyPlugin(opts: RallyOpts): SportPlugin<RallyState> {
  const init = (config?: Record<string, unknown>): RallyState => ({
    current: { home: 0, away: 0 },
    games: [],
    gamesWon: { home: 0, away: 0 },
    target: Number(config?.pointsPerGame ?? opts.defaults.target),
    winBy: Number(config?.winBy ?? opts.defaults.winBy),
    gamesToWin: Number(config?.gamesToWin ?? opts.defaults.gamesToWin),
    sideOut: (config?.scoring ?? 'rally') === opts.sideOutValue,
    doubles: Number(config?.playersPerSide ?? opts.defaults.playersPerSide) >= 2,
    serving: 'home',
    serverNo: 2, // start-of-game "second server" exception: the first team's fault is a side-out
    events: [],
    seq: 0,
    ended: false,
  });

  const reducer = (s: RallyState, a: ScoreAction): RallyState => {
    if (a.type !== 'POINT' || !a.side || s.ended) return s;
    const gameNo = s.games.length + 1;

    // Side-out scoring: the action says who WON the rally.
    if (s.sideOut && a.side !== s.serving) {
      // The serving side faulted.
      let seq = s.seq;
      const events = [...s.events];
      if (s.doubles && s.serverNo === 1) {
        // Hand serve to the 2nd server on the same team — not a side-out yet.
        events.push({ id: ++seq, stamp: `Game ${gameNo}`, icon: '🔁', label: '2nd server', detail: 'serve → partner', side: s.serving });
        return { ...s, serverNo: 2, events, seq };
      }
      events.push({ id: ++seq, stamp: `Game ${gameNo}`, icon: '🔁', label: opts.sideOutLabel, detail: `serve → ${a.side}`, side: a.side });
      return { ...s, serving: a.side, serverNo: 1, events, seq };
    }

    const scorer = s.sideOut ? s.serving : a.side; // side-out: only the server scores
    const who = a.attribution?.playerName;
    const current = { ...s.current, [scorer]: s.current[scorer] + 1 };
    let seq = s.seq;
    const events = [...s.events];
    events.push({ id: ++seq, stamp: `Game ${gameNo}`, icon: opts.icon, label: 'Point', detail: `${current.home}-${current.away}${who ? ` · ${who}` : ''}`, side: scorer, kind: 'point', playerName: who, game: gameNo, points: 1 });

    const winner = gameWinner(current.home, current.away, s.target, s.winBy);
    if (!winner) return { ...s, current, events, seq };

    const games = [...s.games, [current.home, current.away] as [number, number]];
    const gamesWon = { ...s.gamesWon, [winner]: s.gamesWon[winner] + 1 };
    const ended = gamesWon[winner] >= s.gamesToWin;
    events.push({ id: ++seq, stamp: 'Game', icon: '🎉', label: `Game ${gameNo} won`, detail: `${current.home}-${current.away}`, side: winner });
    if (ended) events.push({ id: ++seq, stamp: 'Match', icon: '🏆', label: 'Match won', detail: `${gamesWon.home}-${gamesWon.away} games`, side: winner });
    // New game: the winner serves first, again under the start-of-game exception.
    return { ...s, current: { home: 0, away: 0 }, games, gamesWon, serving: winner, serverNo: 2, events, seq, ended };
  };

  const ScoringControls: SportPlugin<RallyState>['ScoringControls'] = ({ state, dispatch, homeName, awayName, homeRoster = [], awayRoster = [] }) => {
    const s = state as RallyState;
    const rosterOf = (t: 'home' | 'away') => (t === 'home' ? homeRoster : awayRoster);
    const point = (side: 'home' | 'away', p?: Player) =>
      dispatch({ type: 'POINT', side, attribution: p ? { playerId: p.id, stat: 'points', playerName: p.fullName } : undefined });

    if (s.sideOut) {
      // The current server's player (for credit + display): server 1/2 maps to the
      // team's first two on-field players. Falls back to the team name if unknown.
      const serverIdx = s.doubles ? s.serverNo - 1 : 0;
      const serverOf = (t: 'home' | 'away') => rosterOf(t)[serverIdx];
      const servingTeam = s.serving === 'home' ? homeName : awayName;
      const serverP = serverOf(s.serving);
      const rallyWon = (team: 'home' | 'away') => point(team, team === s.serving ? serverOf(team) : undefined);
      return (
        <View style={{ gap: theme.spacing(4) }}>
          <View style={ctrl.serveBox}>
            <Text style={ctrl.label}>{opts.serveSystemLabel}</Text>
            <Text style={ctrl.serve}>
              🏓 Serving: {servingTeam}{serverP ? ` · ${serverP.fullName}` : ''}{s.doubles ? ` · server ${s.serverNo}` : ''}
            </Text>
            <Text style={ctrl.meta}>Tap who won each rally — points and the handout sequence are figured out for you.</Text>
          </View>
          <View style={ctrl.row}>
            <Button label={`Rally won — ${homeName}`} variant="home" style={ctrl.flex} onPress={() => rallyWon('home')} />
            <Button label={`Rally won — ${awayName}`} variant="away" style={ctrl.flex} onPress={() => rallyWon('away')} />
          </View>
        </View>
      );
    }

    // Rally scoring: every rally is a point — pick who won it. Serve still passes
    // to the rally winner, so show who's serving (the last rally winner, or the
    // opening server before the first point). Doubles names the side; singles the
    // player. No service-court shown here — that rule differs by sport.
    let serverSide: 'home' | 'away' = s.serving;
    if (opts.serveRule === 'tt') {
      serverSide = ttServer(s.current.home, s.current.away, s.games.length, 'home');
    } else {
      for (let i = s.events.length - 1; i >= 0; i--) {
        if (s.events[i].kind === 'point') { serverSide = s.events[i].side as 'home' | 'away'; break; }
      }
    }
    const serverSideName = serverSide === 'home' ? homeName : awayName;
    const serverName = s.doubles ? serverSideName : rosterOf(serverSide)[0]?.fullName ?? serverSideName;
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
        <Row label={`${opts.icon} Point — ${homeName}`} roster={homeRoster} side="home" name={homeName} />
        <Row label={`${opts.icon} Point — ${awayName}`} roster={awayRoster} side="away" name={awayName} />
      </View>
    );
  };

  const LiveExtras: NonNullable<SportPlugin<RallyState>['LiveExtras']> = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster }) => {
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
        <PointBoxScore events={s.events} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} homeColor={homeColor} awayColor={awayColor} periods={periods} periodLabel="Game" />
        <Text style={ctrl.label}>Rally log</Text>
        <LiveTimeline events={s.events} homeColor={homeColor} awayColor={awayColor} emptyText="No rallies yet." />
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
    summary: (s) => ({
      homeScore: String(s.current.home),
      awayScore: String(s.current.away),
      statusLine: s.ended ? 'Match Over' : `Game ${s.games.length + 1}${s.sideOut ? ` · ${opts.serveTag}` : ''}`,
      detailLine:
        `Games — ${s.gamesWon.home}:${s.gamesWon.away} · to ${s.target}${s.winBy === 2 ? ' (win by 2)' : ''} · ${s.gamesToWin === 1 ? 'single game' : `best of ${s.gamesToWin * 2 - 1}`}` +
        (s.sideOut && s.doubles ? ` · call ${s.current[s.serving]}-${s.current[other(s.serving)]}-${s.serverNo}` : ''),
    }),
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
  serveBox: { gap: theme.spacing(1), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  gamesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  gameChip: {
    color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700',
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3),
  },
});
