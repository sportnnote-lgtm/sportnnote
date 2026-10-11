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
import { MatchBoxScore } from '../../components/BoxScore';
import { volleyballBox } from '../boxSources';
import { volleyballStatTotals } from './totals';
import { SetLineBoard } from '../SetLineBoard';
import { RallyPointEditor } from '../RallyPointEditor';
import {
  init, reducer, isDecider, setTarget, VB_OUTCOMES, VB_ERROR_TYPES, volleyballCredits, outcomeAction, outcomeChip, standingsUnits, lineScore,
  servingSide, switchSidesDue, technicalTimeoutDue, timeoutsPerSet, type VolleyballState, type VbOutcome,
} from './engine';
import { pointPressure, pressureText } from '../pointStatus';
import { trackCourt, liberoCue, setNoOf, type VbTrack } from './rotation';
import { ServePanel, asPlayer } from './ServePanel';
import { MatchStatsPanel } from '../MatchStatsPanel';

export { isDecider, setTarget } from './engine';
export type { VolleyballState } from './engine';

/** One side's point panel. Pick HOW the point was won, then (for a credited
 *  outcome) WHO — the outcome defaults to Attack and resets after every point, so
 *  a kill is one tap on the attacker, a missed serve is one tap, and a
 *  block/ace/fault is two. Without a roster every outcome is a single button.
 *
 *  SD-117b: the court six come first (the bench folds away), chips carry the
 *  team colour, Ace is offered only to the serving side (🏐) and a missed serve
 *  only to the receiving side, and an "Opp. fault" can say what went wrong and
 *  which opponent erred (both optional — "Not named" still scores it). */
function SidePoints({ side, name, color, court, bench, opponents, oppColor, serving, server, oppServer, icon, blocks, dispatch }: {
  side: 'home' | 'away'; name: string; color: string; court: Player[]; bench: Player[];
  opponents: Player[]; oppColor: string;
  /** true = this side serves, false = it receives, null = not known */
  serving: boolean | null;
  /** SD-58: this side's server (when it serves and the rotation is known) — pre-fills Ace */
  server?: Player | null;
  /** SD-58: the opponent's server (when they serve) — a missed serve is charged to them */
  oppServer?: Player | null;
  icon: string; blocks: boolean;
  dispatch: (a: ScoreAction) => void;
}) {
  const [how, setHow] = useState<VbOutcome>('attack');
  const [err, setErr] = useState<string | undefined>(undefined);
  const [showBench, setShowBench] = useState(false);
  const outcomes = VB_OUTCOMES.filter((o) => (blocks || o.kind !== 'block')
    && !(o.kind === 'ace' && serving === false) // only the server can ace
    && !(o.kind === 'serveerror' && serving === true)); // your own missed serve isn't your point
  const roster = [...court, ...bench];
  const reset = () => { setHow('attack'); setErr(undefined); };
  const score = (kind: VbOutcome, p?: Player) => {
    const fault = kind === 'opperror' ? { err, by: p } : kind === 'serveerror' && oppServer ? { by: oppServer } : undefined;
    dispatch(outcomeAction(kind, side, kind === 'opperror' ? undefined : p, fault));
    reset();
  };
  // SD-58: with the server known, an ace is one tap on the server
  const aceTap = serving === true && server ? server : null;
  const modes = outcomes.filter((o) => (o.credited || o.kind === 'opperror') && !(aceTap && o.kind === 'ace'));
  const oneTap = outcomes.filter((o) => !o.credited && o.kind !== 'opperror');
  const tapLabel = (o: typeof VB_OUTCOMES[number]) => (o.kind === 'serveerror' && oppServer ? `${outcomeChip(o)} · ${oppServer.fullName}` : outcomeChip(o));
  const effHow = modes.some((o) => o.kind === how) ? how : 'attack';
  const chip = (p: Player, dot: string, onPress: () => void) => <SelectChip key={p.id} label={p.fullName} active={false} dotColor={dot} onPress={onPress} />;
  return (
    <View style={[ctrl.sideBox, { borderLeftColor: color }]}>
      <View style={ctrl.headRow}>
        <Text style={ctrl.label}>{icon} Point — {name}</Text>
        {serving === true && <Text style={[ctrl.serveBadge, { backgroundColor: color }]} accessibilityLabel={`${server ? server.fullName : name} serving`}>🏐 {server ? `${server.fullName} serves` : 'Serving'}</Text>}
      </View>
      {roster.length > 0 ? (
        <>
          <View style={ctrl.chips}>
            {modes.map((o) => <SelectChip key={o.kind} label={outcomeChip(o)} active={effHow === o.kind} onPress={() => { setHow(o.kind); if (o.kind !== 'opperror') setErr(undefined); }} />)}
          </View>
          {effHow === 'opperror' ? (
            <>
              <Text style={ctrl.hint}>What went wrong? (optional)</Text>
              <View style={ctrl.chips}>
                {VB_ERROR_TYPES.map((t) => <SelectChip key={t.key} label={t.label} active={err === t.key} onPress={() => setErr(err === t.key ? undefined : t.key)} />)}
              </View>
              <Text style={ctrl.hint}>Who erred? (optional — tap to give {name} the point)</Text>
              <View style={ctrl.chips}>
                {opponents.map((p) => chip(p, oppColor, () => score('opperror', p)))}
                <SelectChip label="Not named" active={false} onPress={() => score('opperror')} />
              </View>
            </>
          ) : (
            <>
              <Text style={ctrl.hint}>{VB_OUTCOMES.find((o) => o.kind === effHow)!.label} by…</Text>
              <View style={ctrl.chips}>
                {court.map((p) => chip(p, color, () => score(effHow, p)))}
                <SelectChip label="No player" active={false} onPress={() => score(effHow)} />
                {bench.length > 0 && <SelectChip label={showBench ? `Hide bench ▴` : `Bench (${bench.length}) ▾`} active={false} onPress={() => setShowBench((v) => !v)} />}
              </View>
              {showBench && bench.length > 0 && (
                <View style={ctrl.chips}>
                  {bench.map((p) => chip(p, color, () => score(effHow, p)))}
                </View>
              )}
            </>
          )}
          <View style={ctrl.chips}>
            {aceTap && <SelectChip label={`🎯 Ace · ${aceTap.fullName}`} active={false} dotColor={color} onPress={() => score('ace', aceTap)} />}
            {oneTap.map((o) => <SelectChip key={o.kind} label={tapLabel(o)} active={false} onPress={() => score(o.kind)} />)}
          </View>
        </>
      ) : (
        <View style={ctrl.chips}>
          {outcomes.map((o) => <SelectChip key={o.kind} label={outcomeChip(o)} active={false} onPress={() => score(o.kind)} />)}
        </View>
      )}
    </View>
  );
}

/** SD-117b: the side's court (lineup slots with a player, else the stamped
 *  court when it's smaller than the squad) and the bench (the rest). With
 *  neither, everyone is "court" — nothing to fold. */
function splitCourt(roster: Player[], lineup: { playerId?: string }[], stamped?: { id: string }[]): { court: Player[]; bench: Player[] } {
  const ids = lineup.filter((sl) => sl.playerId).map((sl) => sl.playerId!);
  const pick = ids.length ? ids : stamped && stamped.length < roster.length ? stamped.map((p) => p.id) : [];
  if (!pick.length) return { court: roster, bench: [] };
  const byId = new Map(roster.map((p) => [p.id, p]));
  const court = pick.map((id) => byId.get(id)).filter((p): p is Player => !!p);
  const on = new Set(court.map((p) => p.id));
  return court.length ? { court, bench: roster.filter((p) => !on.has(p.id)) } : { court: roster, bench: [] };
}

/** Point / timeout controls — volleyball's, parameterised so a future set-based
 *  net sport without blocks can reuse them. `timeoutsPerSet` is the fallback
 *  when the state doesn't carry the format's (SD-117b). */
export function makeSetScoringControls(opts: { icon: string; blocks: boolean; timeoutsPerSet?: number; serve?: boolean }): SportPlugin<VolleyballState>['ScoringControls'] {
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
      .map((o) => ({ kind: o.kind, label: outcomeChip(o), credited: o.credited }));
    const hc = homeColor ?? theme.colors.home;
    const ac = awayColor ?? theme.colors.away;
    // SD-58 / SD-71: the six on court now (rotation + subs) when tracked
    const track = trackCourt(s);
    const home = trackedCourt(track, 'home', homeRoster, s) ?? splitCourt(homeRoster, homeLineup, s.lineup?.home);
    const away = trackedCourt(track, 'away', awayRoster, s) ?? splitCourt(awayRoster, awayLineup, s.lineup?.away);
    const server = servingSide(s);
    const servingOf = (side: 'home' | 'away') => (server ? server === side : null);
    const srvPlayer = track.server && track.serving ? asPlayer(track.server, track.serving === 'home' ? homeRoster : awayRoster) : null;
    const serverOf = (side: 'home' | 'away') => (srvPlayer && track.serving === side ? srvPlayer : null);
    const libCues = (['home', 'away'] as const).map((sd) => liberoCue(s, sd, track)).filter((x): x is string => !!x);
    const perSet = s.timeoutsPerSet ?? opts.timeoutsPerSet ?? timeoutsPerSet(s);
    const switchCue = switchSidesDue(s);
    const tto = technicalTimeoutDue(s);
    return (
      <View style={{ gap: theme.spacing(4) }}>
        {(switchCue || tto || libCues.length > 0) && (
          <View style={ctrl.cue} accessibilityLiveRegion="polite">
            {switchCue && <Text style={ctrl.cueText}>↔ {switchCue}</Text>}
            {tto && <Text style={ctrl.cueText}>⏱️ Technical timeout — 21 points played (sets 1–2)</Text>}
            {libCues.map((c) => <Text key={c} style={ctrl.cueText}>⚠ {c}</Text>)}
          </View>
        )}
        {opts.serve && (homeRoster.length > 0 || awayRoster.length > 0 || s.serve) && (
          <ServePanel s={s} track={track} dispatch={dispatch}
            home={{ side: 'home', name: homeName, color: hc, roster: homeRoster, lineup: homeLineup, court: subCourt(track, 'home', homeRoster, home.court, homeRoster.length) }}
            away={{ side: 'away', name: awayName, color: ac, roster: awayRoster, lineup: awayLineup, court: subCourt(track, 'away', awayRoster, away.court, awayRoster.length) }} />
        )}
        <SidePoints side="home" name={homeName} color={hc} court={home.court} bench={home.bench} opponents={away.court.length ? away.court : awayRoster} oppColor={ac} serving={servingOf('home')} server={serverOf('home')} oppServer={serverOf('away')} icon={opts.icon} blocks={opts.blocks} dispatch={dispatch} />
        <SidePoints side="away" name={awayName} color={ac} court={away.court} bench={away.bench} opponents={home.court.length ? home.court : homeRoster} oppColor={hc} serving={servingOf('away')} server={serverOf('away')} oppServer={serverOf('home')} icon={opts.icon} blocks={opts.blocks} dispatch={dispatch} />
        {perSet > 0 && (() => {
          const setNo = s.setsWon.home + s.setsWon.away + 1;
          const used = (side: 'home' | 'away') => s.events.filter((e) => e.kind === 'timeout' && e.side === side && e.set === setNo).length;
          const left = (side: 'home' | 'away') => Math.max(0, perSet - used(side));
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

/** SD-58 / SD-71: the court from the tracker — when a rotation is stamped or a
 *  sub was made for this side (else null: the SD-117b split stands). */
function trackedCourt(t: VbTrack, side: 'home' | 'away', roster: Player[], s: VolleyballState): { court: Player[]; bench: Player[] } | null {
  const c = t.court[side];
  if (!c || !c.length || !(t.ordered[side] || s.subs?.some((x) => x.side === side && x.set === setNoOf(s)))) return null;
  const court = c.map((p) => asPlayer(p, roster));
  const on = new Set(court.map((p) => p.id));
  return { court, bench: roster.filter((p) => !on.has(p.id)) };
}

/** Who can be substituted: the tracked court, else the lineup's court when
 *  it's smaller than the squad (a real six). Null = not known. */
function subCourt(t: VbTrack, side: 'home' | 'away', roster: Player[], court: Player[], squad: number): Player[] | null {
  if (t.court[side]?.length) {
    const list = t.court[side]!.map((p) => asPlayer(p, roster));
    return list.length < squad ? list : null;
  }
  return court.length && court.length < squad ? court : null;
}

/** SD-29: the court at the start — lineup slots with a player, else the squad. */
function courtPlayers(roster: Player[], lineup: { playerId?: string; playerName?: string }[]): { id: string; name: string }[] {
  const byId = new Map(roster.map((p) => [p.id, p]));
  const slots = lineup.filter((sl) => sl.playerId);
  if (slots.length) return slots.map((sl) => ({ id: sl.playerId!, name: byId.get(sl.playerId!)?.fullName ?? sl.playerName ?? '' }));
  return roster.map((p) => ({ id: p.id, name: p.fullName }));
}

// Timeouts per set come from the format (2 indoor, 1 beach — SD-117b).
const ScoringControls = makeSetScoringControls({ icon: '🏐', blocks: true, serve: true });

const LiveExtras: NonNullable<SportPlugin<VolleyballState>['LiveExtras']> = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }) => {
  const s = state as VolleyballState;
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
      <MatchBoxScore sport="volleyball" source={volleyballBox(s, { homeRoster, awayRoster })} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} />
      {/* SD-58: serve / side-out figures once the toss is recorded (null otherwise) */}
      <MatchStatsPanel sport="volleyball" state={s} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} homeColor={homeColor} awayColor={awayColor} />
      {(s.subs?.length ?? 0) > 0 && (
        <>
          <Text style={ctrl.label}>Substitutions</Text>
          {subLines(s, homeName, awayName).map((l, i) => <Text key={i} style={textStyles.muted}>{l}</Text>)}
        </>
      )}
      <Text style={ctrl.label}>Point log</Text>
      <LiveTimeline events={s.events} homeColor={homeColor} awayColor={awayColor} emptyText="No points yet." homeRoster={homeRoster} awayRoster={awayRoster} onPlayer={onPlayer} />
    </View>
  );
};

/** SD-71 — "Set 2 · 8-6 · Home: ⬇ Asha ⬆ Bela (libero)" per sub. */
function subLines(s: VolleyballState, homeName: string, awayName: string): string[] {
  const KIND: Record<string, string> = { exceptional: ' (exceptional — injury)', libero: ' (libero)' };
  return (s.subs ?? []).map((x) => {
    const pts = s.events.filter((e) => e.set === x.set && e.side && ['point', 'attack', 'block', 'ace', 'opperror', 'serveerror'].includes(e.kind ?? '')).slice(0, x.at);
    const h = pts.filter((e) => e.side === 'home').length;
    const a = pts.length - h;
    return `Set ${x.set} · ${h}-${a} · ${x.side === 'home' ? homeName : awayName}: ⬇ ${x.off.name} ⬆ ${x.on.name}${KIND[x.kind] ?? ''}`;
  });
}

/** Broadcast-style board: SETS won + a column of points per set, the live set
 *  highlighted — the layout volleyball TV graphics use. */
const VolleyballScoreboard: NonNullable<SportPlugin<VolleyballState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live, closed }) => {
  const s = state as VolleyballState;
  return (
    <SetLineBoard
      ls={lineScore(s)} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} live={live} closed={closed}
      status={`Set ${s.setsWon.home + s.setsWon.away + 1}${isDecider(s) ? ' · Decider' : ''}`} bestOf={`best of ${s.setsToWin * 2 - 1}`}
      // SD-117b: 🏐 after the serving side (derived from the rallies) and the
      // SET POINT / MATCH POINT chip (pointStatus.ts, the same as the racket sports)
      serving={servingSide(s)} serveIcon="🏐"
      alerts={pressureText(pointPressure(reducer, s, { unit: 'set' }), { home: homeName, away: awayName })}
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
  // SD-32: + points / attackPoints / blocks / aces from the point log (left
  // out whole if a credited name can't be matched to an id). Partial: an old
  // line whose names don't resolve keeps moving by live increments.
  statTotals: volleyballStatTotals,
  statTotalsPartial: true,
  statTotalsNeedsPlayers: true,
  result: (s) => (s.ended ? { winner: s.setsWon.home > s.setsWon.away ? 'home' : s.setsWon.away > s.setsWon.home ? 'away' : 'draw', home: s.setsWon.home, away: s.setsWon.away } : null),
  // SD-17: rally points over every set (FIVB point ratio).
  standingsUnits,
  Scoreboard: VolleyballScoreboard,
  // SD-01: once ended → sets won + "25-21, 23-25, 15-12" (never the reset 0–0).
  scoreLine: (s, perspective) => scoreLine(s?.sets, { perspective }),
  // SD-20: the line score (a match closed by hand: "25-21, 12-8 conceded").
  lineScore,
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
        { value: 'indoor', label: 'Indoor (25 · dec 15)', set: { playersPerSide: 6, substitutes: 6, setsToWin: 3, pointsPerSet: 25, deciderPoints: 15, winByTwo: true, timeoutsPerSet: 2 } },
        { value: 'beach', label: 'Beach (21 · dec 15)', set: { playersPerSide: 2, substitutes: 0, setsToWin: 2, pointsPerSet: 21, deciderPoints: 15, winByTwo: true, timeoutsPerSet: 1 } },
        { value: 'nineaside', label: '9-a-side (21 · best of 3)', set: { playersPerSide: 9, substitutes: 3, setsToWin: 2, pointsPerSet: 21, deciderPoints: 15, winByTwo: true, timeoutsPerSet: 2 } },
        { value: 'single', label: 'Single set to 25', set: { playersPerSide: 6, substitutes: 6, setsToWin: 1, pointsPerSet: 25, deciderPoints: 25, winByTwo: true, timeoutsPerSet: 2 } },
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
    // SD-117b: FIVB indoor 2 per team per set; beach 1 (+ a technical timeout
    // at 21 points in sets 1–2, shown as a cue)
    { key: 'timeoutsPerSet', label: 'Timeouts per team per set', type: 'count', default: 2, min: 0, max: 3, advanced: true, hint: '2 indoor · 1 beach' },
  ],
};

const ctrl = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  hint: { color: theme.colors.textMuted, fontSize: theme.font.small },
  headRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing(2) },
  serveBadge: { color: '#fff', fontSize: theme.font.tiny, fontWeight: '800', borderRadius: theme.radius.pill, paddingVertical: 2, paddingHorizontal: theme.spacing(2), overflow: 'hidden' },
  cue: { backgroundColor: theme.colors.accent + '22', borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.accent, padding: theme.spacing(3), gap: theme.spacing(1) },
  cueText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  sideBox: { gap: theme.spacing(2), borderLeftWidth: 3, paddingLeft: theme.spacing(3) },
  setsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  setChip: {
    color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700',
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3),
  },
});
