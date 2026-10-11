/**
 * Baseball + softball plugin (WBSC) — SD-144. Archetype: runs by inning, no
 * clock. The pure rules live in ./engine.ts (the game is re-derived from the
 * log on every action); statTotals in ./totals.ts, the box scores in ./box.ts.
 *
 * Built for ONE person scoring on a phone:
 *  - one tap per pitch: Ball · Strike (looking) · Swinging · Foul · HBP — ball
 *    four and strike three close the plate appearance by themselves;
 *  - "In play →" opens the outcome sheet (1B 2B 3B HR, groundout, flyout,
 *    lineout, double play, sac fly / bunt, fielder's choice, error); with
 *    nobody on base (and fielders not asked) the tap IS the play — otherwise
 *    the runners show with their usual advance pre-picked and one ✓ confirms;
 *  - runners (steal, caught stealing, wild pitch, passed ball, balk, pick-off),
 *    subs (pinch hitter / runner, defensive change, pitching change) and
 *    ejections behind their own buttons;
 *  - outs, half-innings, the walk-off, the run rule and extra innings (with
 *    the tie-break runners) happen by themselves; only a CALLED game (time /
 *    weather) is ended by hand — and it asks first (SD-106).
 * Corrections: "Correct the plays" removes a play, re-enters it at its place
 * in the log (SD-114: the removal is held until the new play is in), or marks
 * its runs earned / unearned (the scorer's override).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { ensureContrast } from '../../core/contrast';
import { Button, TextField } from '../../components/ui';
import { confirmMatchAction } from '../../components/ConfirmSheet';
import { LineScoreboard } from '../../components/LineScoreboard';
import { MatchBoxScore } from '../../components/BoxScore';
import { LiveTimeline } from '../LiveTimeline';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';
import {
  init, reducer, isComplete, result, cardLine, statusText, situation, defaultMoves, defaultRunnerMoves, withStays, buildPitch, buildPlay, buildRunner,
  stateAfter, eventCredits, creditAttribution, halfLong, halfShort, inningOf, whoKey, mercyText, newUid, defaultRbi,
  BASEBALL_PRESETS, BASEBALL_LIVE_SETTINGS, OUTCOME_LABEL, RUNNER_LABEL, POSITIONS,
  type BaseballEvent, type BaseballState, type Dest, type LineupEntry, type Move, type Outcome, type RunnerKind, type Side, type Who,
} from './engine';
import { baseballTotals } from './totals';
import { baseballBox, baseballPitchingBox } from './box';
import { baseballPitchingStats } from './stats';
import { baseballTimeline, describeEvent, eventWhen, timelineEvents } from './timeline';
import { baseballTickerDetail, baseballTickerFlash } from './ticker';
import { baseballFormation, BaseballField, CountDots, Diamond } from './diamond';
import { usePendingEdit } from '../usePendingEdit';
import { BackfillBar, RowAction, confirmRemove } from '../TimelineControls';
import { baseballVoice, baseballVoiceEnds } from './voice';

const BASE_NAME = ['Home', '1st', '2nd', '3rd'];
const DESTS: { to: Dest; label: string }[] = [{ to: -1, label: 'Out' }, { to: 1, label: '1B' }, { to: 2, label: '2B' }, { to: 3, label: '3B' }, { to: 4, label: 'Score' }];
const HIT_BTNS: Outcome[] = ['1B', '2B', '3B', 'HR'];
const OUT_BTNS: Outcome[] = ['GO', 'FO', 'LO', 'DP', 'SF', 'SH'];
const REACH_BTNS: Outcome[] = ['FC', 'E'];
const SHORT: Partial<Record<Outcome, string>> = { '1B': 'Single', '2B': 'Double', '3B': 'Triple', HR: 'Home run', GO: 'Groundout', FO: 'Fly / pop out', LO: 'Lineout', DP: 'Double play', SF: 'Sac fly', SH: 'Sac bunt', FC: "Fielder's choice", E: 'Error' };
/** outcomes that ask for the fielders when "Ask for fielders" is on */
const FIELDED: Outcome[] = ['GO', 'FO', 'LO', 'DP', 'SF', 'SH', 'FC'];
const isPos = (p?: string | null) => !!p && ([...POSITIONS, 'DH', 'EF'] as string[]).includes(p);

/* ------------------------------ player picker ------------------------------ */

function PlayerGrid({ players, onPick, tag, skip }: { players: Player[]; onPick: (p: Player) => void; tag?: (p: Player) => string | undefined; skip?: { label: string; onPress: () => void } }) {
  return (
    <View style={c.grid}>
      {players.map((p) => (
        <TouchableOpacity key={p.id} style={c.pchip} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={`${p.fullName}${tag?.(p) ? `, ${tag(p)}` : ''}`} onPress={() => onPick(p)}>
          <Text style={c.pnum}>{tag?.(p) ?? p.jerseyNo ?? '–'}</Text>
          <Text style={c.pname} numberOfLines={1}>{p.fullName}</Text>
        </TouchableOpacity>
      ))}
      {players.length === 0 ? <Text style={c.meta}>No players to pick.</Text> : null}
      {skip ? (
        <TouchableOpacity style={[c.pchip, c.skip]} activeOpacity={0.75} accessibilityRole="button" onPress={skip.onPress}>
          <Text style={c.skipTxt}>{skip.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

type Flow =
  | { mode: 'inplay' }
  | { mode: 'advance'; outcome?: Outcome; rk?: RunnerKind; moves: Move[]; fielders: string; rbi?: number }
  | { mode: 'runner' }
  | { mode: 'runnerPick'; rk: RunnerKind }
  | { mode: 'sub'; step: 'kind' }
  | { mode: 'ph' }
  | { mode: 'pr'; base?: 1 | 2 | 3 }
  | { mode: 'def'; slot?: number; on?: Player }
  | { mode: 'pitcher'; side: Side }
  | { mode: 'eject'; side?: Side }
  | { mode: 'lineup'; side: Side; picks: Player[]; step: 'order' | 'pitcher' }
  | { mode: 'more' };

const ScoringControls: SportPlugin<BaseballState>['ScoringControls'] = ({
  state: liveState, dispatch: rawDispatch, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [], homeLineup = [], awayLineup = [],
}) => {
  const { view, dispatch, begin: holdRemoval, cancel: dropHeldRemoval } = usePendingEdit(liveState, rawDispatch, reducer);
  const [flow, setFlow] = useState<Flow | null>(null);
  /** re-entering a play: the id it goes after ('' = the first) */
  const [editAfter, setEditAfter] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [official, setOfficial] = useState('');
  useEffect(() => { if (flow === null && editAfter !== null) { setEditAfter(null); dropHeldRemoval(); } }, [flow]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = useMemo(() => (editAfter !== null ? stateAfter(view, editAfter) : view), [view, editAfter]);
  const g = s.g;

  const name = (sd: Side) => (sd === 'home' ? homeName : awayName);
  const color = (sd: Side) => (sd === 'home' ? homeColor ?? theme.colors.home : awayColor ?? theme.colors.away);
  /** team colour as TEXT on a panel: darkened / lightened to AA (SD-155) */
  const ink = (sd: Side) => ensureContrast(color(sd), theme.colors.surface);
  const rosterOf = (sd: Side) => (sd === 'home' ? homeRoster : awayRoster);
  const slotsOf = (sd: Side) => (sd === 'home' ? homeLineup : awayLineup);
  const asPlayer = (sd: Side, w?: Who | LineupEntry): Player | undefined =>
    !w ? undefined : rosterOf(sd).find((p) => (w.id && p.id === w.id) || (!w.id && p.fullName === w.name)) ?? ({ id: w.id ?? `name:${w.name}`, fullName: w.name ?? 'Player', sports: ['baseball'] } as unknown as Player);
  const who = (p: Player): Who => (p.id.startsWith('name:') ? { name: p.fullName } : { id: p.id, name: p.fullName });

  /* ---- line-ups ---- */
  const posOfSlot = (sd: Side, id: string) => slotsOf(sd).find((x) => x.playerId === id)?.position;
  /** the default batting order + pitcher from the team sheet / squad order */
  const defaults = (sd: Side): { order: LineupEntry[]; pitcher?: Who } => {
    const roster = rosterOf(sd);
    if (!roster.length) return { order: [] };
    const pSlot = slotsOf(sd).find((x) => x.position === 'P' && x.playerId);
    const placed = slotsOf(sd).filter((x) => x.playerId && isPos(x.position)).map((x) => x.playerId!);
    let pool = placed.length ? roster.filter((p) => placed.includes(p.id)) : roster;
    if (s.cfg.dh && pSlot) pool = pool.filter((p) => p.id !== pSlot.playerId);
    const named = pool.slice(0, s.cfg.lineupSize).map((p) => ({ id: p.id, name: p.fullName, ...(posOfSlot(sd, p.id) ? { pos: posOfSlot(sd, p.id) } : {}) }));
    // a short roster: the rest of the order bats as numbered slots
    const order: LineupEntry[] = [...named, ...Array.from({ length: Math.max(0, s.cfg.lineupSize - named.length) }, (_, i) => ({ name: `Batter ${named.length + i + 1}` }))];
    const pid = pSlot?.playerId ?? roster.find((p) => !order.some((o) => o.id === p.id))?.id ?? (s.cfg.dh ? undefined : named[named.length - 1]?.id);
    const pp = roster.find((p) => p.id === pid);
    return { order, ...(pp ? { pitcher: { id: pp.id, name: pp.fullName } } : {}) };
  };
  const started = s.events.some((e) => e.type === 'pitch' || e.type === 'pa' || e.type === 'runner');
  const stampLineups = () => {
    if (started) return;
    for (const sd of ['home', 'away'] as const) {
      if (s.lineup[sd] || s.starters[sd]) continue;
      const d = defaults(sd);
      if (d.order.length || d.pitcher) dispatch({ type: 'LINEUP', payload: { team: sd, order: d.order, ...(d.pitcher ? { pitcher: d.pitcher } : {}) } });
    }
  };

  /** send a play (stamped at its place when re-entering a correction) */
  const fire = (a: ScoreAction) => {
    if (editAfter === null) stampLineups();
    dispatch(a);
    if (editAfter !== null) { setEditAfter(null); }
    setFlow(null);
  };
  const extra = (): Record<string, unknown> => (editAfter !== null ? { after: editAfter, edit: true } : {});

  const sit = situation(s);
  const bat = sit.bat;
  const field = sit.field;
  const orderOf = (sd: Side) => g.order[sd];
  const bench = (sd: Side): Player[] => rosterOf(sd).filter((p) => !orderOf(sd).some((o) => o.id === p.id) && whoKey(g.pitcher[sd]) !== p.id);
  const runners = ([1, 2, 3] as const).filter((b) => !!g.bases[b - 1]);
  const askFielders = s.cfg.askFielders;

  /* ---- plays ---- */
  const pitch = (k: 'ball' | 'called' | 'swinging' | 'foul') => fire(buildPitch(s, k, extra()));
  const playNow = (o: Outcome, opts: { moves?: Move[]; fielders?: string; rbi?: number } = {}) =>
    fire(buildPlay(s, o, { ...opts, extra: extra() }));
  const outcome = (o: Outcome) => {
    const needsSheet = (runners.length > 0 && !['HR', '3B', 'BB', 'IBB', 'HBP', 'K'].includes(o)) || o === 'E' || (askFielders && FIELDED.includes(o));
    if (!needsSheet) { playNow(o); return; }
    setFlow({ mode: 'advance', outcome: o, moves: withStays(s, defaultMoves(s, o)), fielders: '' });
  };
  const runnerPlay = (rk: RunnerKind, base?: 1 | 2 | 3) => {
    const moves = defaultRunnerMoves(s, rk, base);
    if (!moves.length) return;
    if ((rk === 'WP' || rk === 'PB') && runners.length > 1) { setFlow({ mode: 'advance', rk, moves: withStays(s, moves, false), fielders: '' }); return; }
    fire(buildRunner(s, rk, moves, extra()));
  };
  const pickRunner = (rk: RunnerKind) => {
    if (runners.length === 1) { runnerPlay(rk, runners[0]); return; }
    setFlow({ mode: 'runnerPick', rk });
  };

  /* ---- subs ---- */
  const sub = (payload: Record<string, unknown>, sd: Side) => fire({ type: 'SUB', side: sd, payload: { ...payload, ...extra(), uid: newUid() } });

  /* ---- corrections ---- */
  const removalActions = (e: BaseballEvent): ScoreAction[] => {
    const cr = eventCredits(e);
    return [{ type: 'REMOVE_EVENT', ...(e.side ? { side: e.side } : {}), payload: { id: e.id }, attribution: creditAttribution(cr.first, -1), attribution2: creditAttribution(cr.second, -1) }];
  };
  const remove = (e: BaseballEvent) => { for (const a of removalActions(e)) dispatch(a); };
  const edit = (e: BaseballEvent) => {
    if (e.type !== 'pa' && e.type !== 'runner' && e.type !== 'pitch') { remove(e); return; }
    const i = view.events.findIndex((x) => x.id === e.id);
    holdRemoval(removalActions(e));
    setEditAfter(i > 0 ? view.events[i - 1].id : '');
    setShowEdit(false);
    setFlow(e.type === 'runner' ? { mode: 'runner' } : e.type === 'pa' ? { mode: 'inplay' } : null);
  };
  const toggleEarned = (e: BaseballEvent) => {
    const runs = view.g.runs.filter((r) => r.event === e.id);
    const earned = runs.some((r) => r.earned);
    dispatch({ type: 'ER', payload: { ref: e.id, earned: !earned, uid: newUid() } });
  };

  /* ---- called game ---- */
  const callGame = async () => {
    const ok = await confirmMatchAction('fullTime', { score: `${g.score.home}-${g.score.away}`, detail: `Called game (time / weather): ${name('home')} ${g.score.home}, ${name('away')} ${g.score.away} is saved as the final score.` });
    if (ok) dispatch({ type: 'END', payload: { reason: 'called', at: Date.now() } });
  };

  /* ---- after the last out ---- */
  if (view.g.ended && editAfter === null) {
    const r = result(view);
    return (
      <View style={c.wrap}>
        <View style={c.panel}>
          <Text style={c.h}>{statusText(view)} · {name('home')} {view.g.score.home} – {view.g.score.away} {name('away')}</Text>
          <Text style={c.meta}>{r ? (r.winner === 'draw' ? 'Tied game.' : `${name(r.winner)} win.`) : ''} Use “Correct the plays” below to fix a play.</Text>
        </View>
        <EditList s={view} show={showEdit} setShow={setShowEdit} onRemove={remove} onEarned={toggleEarned} homeName={homeName} awayName={awayName} />
      </View>
    );
  }

  /* ---- flows ---- */
  const head = (t: string, sd?: Side) => (
    <View style={c.flowHead}>
      <Text style={[c.h, sd ? { color: ink(sd) } : null]} numberOfLines={1}>{t}{sd ? ` · ${name(sd)}` : ''}</Text>
      <Text style={c.cancel} accessibilityRole="button" onPress={() => setFlow(null)}>Cancel</Text>
    </View>
  );
  const flowPanel = (() => {
    if (!flow) return null;
    switch (flow.mode) {
      case 'inplay':
        return (
          <View style={c.panel}>{head(`In play · ${sit.batter.name}`, bat)}
            <Text style={c.small}>Hit</Text>
            <View style={c.grid}>{HIT_BTNS.map((o) => <Button key={o} label={SHORT[o]!} color={color(bat)} style={c.quarter} onPress={() => outcome(o)} />)}</View>
            <Text style={c.small}>Out</Text>
            <View style={c.grid}>{OUT_BTNS.map((o) => <Button key={o} label={SHORT[o]!} variant="ghost" style={c.third} disabled={(o === 'DP' || o === 'SF' || o === 'SH') && g.outs >= 2} onPress={() => outcome(o)} />)}</View>
            <Text style={c.small}>Reached</Text>
            <View style={c.grid}>{REACH_BTNS.map((o) => <Button key={o} label={SHORT[o]!} variant="ghost" style={c.half} onPress={() => outcome(o)} />)}</View>
            {runners.length ? <Text style={c.meta}>Next: the runners with their usual advance — change any, then ✓.</Text> : null}
          </View>
        );
      case 'advance': {
        const f = flow;
        const draft = (): ScoreAction => (f.outcome
          ? buildPlay(s, f.outcome, { moves: f.moves, fielders: f.fielders || undefined, ...(f.rbi !== undefined ? { rbi: f.rbi } : {}), extra: extra() })
          : buildRunner(s, f.rk!, f.moves, extra()));
        const a = draft();
        const runs = (reducer(s, { ...a, payload: { ...a.payload, uid: '__pv' } }).g.ann.__pv?.runs) ?? 0;
        const rbiNow = f.rbi ?? (f.outcome ? defaultRbi(f.outcome, runs) : 0);
        const setTo = (from: number, to: Dest) => setFlow({ ...f, moves: f.moves.map((m) => (m.from === from ? { ...m, to } : m)), rbi: undefined });
        const isErr = f.outcome === 'E';
        const tapFielder = (n: number) => setFlow({ ...f, fielders: isErr ? `E${n}` : f.fielders ? `${f.fielders}-${n}` : String(n) });
        return (
          <View style={c.panel}>{head(f.outcome ? OUTCOME_LABEL[f.outcome] : RUNNER_LABEL[f.rk!], bat)}
            {f.moves.map((m) => (
              <View key={m.from} style={c.moveRow}>
                <Text style={c.moveWho} numberOfLines={1}>{m.from === 0 ? `Batter · ${m.name ?? ''}` : `${BASE_NAME[m.from]} · ${m.name ?? 'Runner'}`}</Text>
                <View style={c.moveChips}>
                  {DESTS.filter((d) => d.to === -1 || d.to === 4 || d.to >= Math.max(1, m.from)).map((d) => {
                    const on = m.to === d.to || (d.to === m.from && m.to === m.from);
                    return (
                      <TouchableOpacity key={d.to} accessibilityRole="button" accessibilityLabel={`${m.name ?? BASE_NAME[m.from]}: ${d.label}`} accessibilityState={{ selected: on }}
                        style={[c.dest, on && c.destOn]} onPress={() => setTo(m.from, d.to)}>
                        <Text style={[c.destTxt, on && c.destTxtOn]}>{d.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
            {f.outcome && (isErr || askFielders) ? (
              <View style={{ gap: theme.spacing(1) }}>
                <Text style={c.small}>{isErr ? 'Error by (position)' : 'Fielders (optional)'} {f.fielders ? `· ${f.fielders}` : ''}</Text>
                <View style={c.grid}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <TouchableOpacity key={n} accessibilityRole="button" accessibilityLabel={`Fielder ${n}, ${POSITIONS[n - 1]}`} style={c.num} onPress={() => tapFielder(n)}>
                      <Text style={c.numTxt}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                  {f.fielders ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear the fielders" style={c.num} onPress={() => setFlow({ ...f, fielders: '' })}><Text style={c.numTxt}>Clear</Text></TouchableOpacity> : null}
                </View>
              </View>
            ) : null}
            {f.outcome ? (
              <View style={c.rbiRow}>
                <Text style={c.meta}>RBI</Text>
                <Button label="−" accessibilityLabel="One fewer RBI" variant="ghost" style={c.step} onPress={() => setFlow({ ...f, rbi: Math.max(0, rbiNow - 1) })} />
                <Text style={c.rbi}>{rbiNow}</Text>
                <Button label="+" accessibilityLabel="One more RBI" variant="ghost" style={c.step} onPress={() => setFlow({ ...f, rbi: Math.min(4, rbiNow + 1) })} />
                <Text style={c.meta}>{runs} run{runs === 1 ? '' : 's'} score</Text>
              </View>
            ) : null}
            <Button label="✓ Confirm" color={color(bat)} onPress={() => fire(draft())} />
          </View>
        );
      }
      case 'runner':
        return (
          <View style={c.panel}>{head('🏃 Runners', bat)}
            <View style={c.grid}>
              {(['SB', 'CS', 'WP', 'PB', 'BK', 'PO', 'ADV', 'OUT'] as RunnerKind[]).map((rk) => (
                <Button key={rk} label={RUNNER_LABEL[rk]} variant="ghost" style={c.half} disabled={!runners.length}
                  onPress={() => (rk === 'WP' || rk === 'PB' || rk === 'BK' ? runnerPlay(rk) : pickRunner(rk))} />
              ))}
            </View>
            {!runners.length ? <Text style={c.meta}>Nobody on base.</Text> : <Text style={c.meta}>A steal / pick-off takes the runner you pick; a wild pitch, passed ball or balk moves every runner up one.</Text>}
          </View>
        );
      case 'runnerPick':
        return (
          <View style={c.panel}>{head(`${RUNNER_LABEL[flow.rk]} — which runner?`, bat)}
            <View style={c.grid}>
              {runners.map((b) => <Button key={b} label={`${BASE_NAME[b]} · ${g.bases[b - 1]?.name ?? 'Runner'}`} variant="ghost" style={c.half} onPress={() => runnerPlay(flow.rk, b)} />)}
            </View>
          </View>
        );
      case 'sub':
        return (
          <View style={c.panel}>{head('🔁 Changes')}
            <View style={c.grid}>
              <Button label={`Pinch hitter · ${name(bat)}`} variant="ghost" style={c.half} onPress={() => setFlow({ mode: 'ph' })} />
              <Button label={`Pinch runner · ${name(bat)}`} variant="ghost" style={c.half} disabled={!runners.length} onPress={() => setFlow({ mode: 'pr', ...(runners.length === 1 ? { base: runners[0] } : {}) })} />
              <Button label={`Pitching change · ${name(field)}`} variant="ghost" style={c.half} onPress={() => setFlow({ mode: 'pitcher', side: field })} />
              <Button label={`Defensive change · ${name(field)}`} variant="ghost" style={c.half} onPress={() => setFlow({ mode: 'def' })} />
            </View>
          </View>
        );
      case 'ph':
        return (
          <View style={c.panel}>{head(`Pinch hitter for ${sit.batter.name}`, bat)}
            <PlayerGrid players={bench(bat)} onPick={(p) => sub({ kind: 'ph', slot: sit.batter.slot, on: who(p), off: { ...(sit.batter.id ? { id: sit.batter.id } : {}), name: sit.batter.name } }, bat)} />
          </View>
        );
      case 'pr': {
        if (!flow.base) return (
          <View style={c.panel}>{head('Pinch runner — for which runner?', bat)}
            <View style={c.grid}>{runners.map((b) => <Button key={b} label={`${BASE_NAME[b]} · ${g.bases[b - 1]?.name ?? 'Runner'}`} variant="ghost" style={c.half} onPress={() => setFlow({ mode: 'pr', base: b })} />)}</View>
          </View>
        );
        const r = g.bases[flow.base - 1];
        return (
          <View style={c.panel}>{head(`Pinch runner on ${BASE_NAME[flow.base]} for ${r?.name ?? 'the runner'}`, bat)}
            <PlayerGrid players={bench(bat)} onPick={(p) => sub({ kind: 'pr', base: flow.base, ...(typeof r?.slot === 'number' ? { slot: r.slot } : {}), on: who(p), ...(r?.name ? { off: { ...(r.id ? { id: r.id } : {}), name: r.name } } : {}) }, bat)} />
          </View>
        );
      }
      case 'def': {
        if (flow.slot === undefined) return (
          <View style={c.panel}>{head('Defensive change — who comes out?', field)}
            <View style={c.grid}>{orderOf(field).map((e, i) => <Button key={i} label={`${i + 1}. ${e.name}${e.pos ? ` (${e.pos})` : ''}`} variant="ghost" style={c.half} onPress={() => setFlow({ mode: 'def', slot: i })} />)}</View>
          </View>
        );
        if (!flow.on) return (
          <View style={c.panel}>{head(`In for ${orderOf(field)[flow.slot]?.name}`, field)}
            <PlayerGrid players={bench(field)} onPick={(p) => setFlow({ ...flow, on: p })} />
          </View>
        );
        return (
          <View style={c.panel}>{head(`${flow.on.fullName} plays…`, field)}
            <View style={c.grid}>
              {[...POSITIONS, 'DH'].map((pos) => <Button key={pos} label={pos} variant="ghost" style={c.quarter}
                onPress={() => sub({ kind: 'def', slot: flow.slot, on: who(flow.on!), pos, off: { ...(orderOf(field)[flow.slot!]?.id ? { id: orderOf(field)[flow.slot!].id } : {}), name: orderOf(field)[flow.slot!]?.name } }, field)} />)}
            </View>
          </View>
        );
      }
      case 'pitcher': {
        const sd = flow.side;
        const cur = g.pitcher[sd];
        const slot = !s.cfg.dh && cur ? orderOf(sd).findIndex((e) => (cur.id && e.id === cur.id) || (!cur.id && e.name === cur.name)) : -1;
        return (
          <View style={c.panel}>{head(cur ? `New pitcher for ${cur.name}` : 'Who is pitching?', sd)}
            <PlayerGrid players={rosterOf(sd).filter((p) => p.id !== cur?.id)} tag={(p) => (p.id === cur?.id ? 'P' : undefined)}
              onPick={(p) => (started || cur ? sub({ kind: 'p', on: who(p), ...(cur ? { off: cur } : {}), ...(slot >= 0 ? { slot } : {}) }, sd) : (dispatch({ type: 'LINEUP', payload: { team: sd, order: s.lineup[sd] ?? defaults(sd).order, pitcher: who(p) } }), setFlow(null)))} />
          </View>
        );
      }
      case 'eject': {
        if (!flow.side) return (
          <View style={c.panel}>{head('🟥 Ejection — which team?')}
            <View style={c.row}>{(['away', 'home'] as const).map((sd) => <Button key={sd} label={name(sd)} color={color(sd)} style={c.flex} onPress={() => setFlow({ mode: 'eject', side: sd })} />)}</View>
          </View>
        );
        const sd = flow.side;
        return (
          <View style={c.panel}>{head('🟥 Ejected', sd)}
            <PlayerGrid players={rosterOf(sd)} onPick={(p) => { dispatch({ type: 'EJECT', side: sd, payload: { player: who(p), uid: newUid() } }); setFlow(null); }} />
            <Text style={c.small}>Or a coach / manager</Text>
            <View style={c.row}>
              <View style={c.flex}><TextField label="Official (optional)" value={official} onChange={setOfficial} placeholder="e.g. Manager" autoCapitalize="words" /></View>
              <Button label="Record" variant="ghost" onPress={() => { dispatch({ type: 'EJECT', side: sd, payload: { official: official.trim() || 'Team official', uid: newUid() } }); setOfficial(''); setFlow(null); }} />
            </View>
            <Text style={c.meta}>An ejected player can’t come back — make the substitution from “Changes”.</Text>
          </View>
        );
      }
      case 'lineup': {
        const sd = flow.side;
        if (flow.step === 'order') return (
          <View style={c.panel}>{head(`Batting order · tap ${s.cfg.lineupSize} in order`, sd)}
            {flow.picks.length ? <Text style={c.meta}>{flow.picks.map((p, i) => `${i + 1}. ${p.fullName}`).join(' · ')}</Text> : null}
            <PlayerGrid players={rosterOf(sd).filter((p) => !flow.picks.some((x) => x.id === p.id))} onPick={(p) => {
              const picks = [...flow.picks, p];
              setFlow(picks.length >= s.cfg.lineupSize ? { ...flow, picks, step: 'pitcher' } : { ...flow, picks });
            }} />
            <View style={c.row}>
              <Button label="Start again" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, picks: [] })} />
              <Button label="Done" variant="ghost" style={c.flex} disabled={!flow.picks.length} onPress={() => setFlow({ ...flow, step: 'pitcher' })} />
            </View>
          </View>
        );
        const done = (p?: Player) => {
          const picked: LineupEntry[] = flow.picks.map((x) => ({ id: x.id, name: x.fullName, ...(posOfSlot(sd, x.id) ? { pos: posOfSlot(sd, x.id) } : {}) }));
          const order = [...picked, ...Array.from({ length: Math.max(0, s.cfg.lineupSize - picked.length) }, (_, i) => ({ name: `Batter ${picked.length + i + 1}` }))];
          dispatch({ type: 'LINEUP', payload: { team: sd, order, ...(p ? { pitcher: who(p) } : {}) } });
          setFlow(null);
        };
        return (
          <View style={c.panel}>{head('Starting pitcher', sd)}
            <PlayerGrid players={rosterOf(sd)} onPick={done} skip={{ label: 'Skip', onPress: () => done() }} />
          </View>
        );
      }
      case 'more':
        return (
          <View style={c.panel}>{head('More')}
            <View style={c.grid}>
              <Button label="Intentional walk" variant="ghost" style={c.half} onPress={() => outcome('IBB')} />
              {s.cfg.pitches ? null : <Button label="Hit by pitch" variant="ghost" style={c.half} onPress={() => outcome('HBP')} />}
              <Button label="🟥 Ejection" variant="ghost" style={c.half} onPress={() => setFlow({ mode: 'eject' })} />
            </View>
          </View>
        );
    }
    return null;
  })();

  /* ---- the pad ---- */
  // before the first pitch the team sheet's order / pitcher show (stamped on the first pitch)
  const shownBatter = !started && !s.lineup[bat] ? { ...(defaults(bat).order[sit.batter.slot] ?? sit.batter), slot: sit.batter.slot } : sit.batter;
  const shownPitcher = !started && !s.starters[field] ? defaults(field).pitcher : sit.pitcher;
  const pk = whoKey(sit.pitcher);
  const pitches = pk ? g.pitches[pk] ?? 0 : 0;
  const t = baseballTotals(s);
  const line = sit.batter.id ? t[sit.batter.id]?.stats : undefined;
  const today = line ? `${line.hits ?? 0}-for-${line.atBats ?? 0}` : '';
  const onDeck = orderOf(bat)[(sit.batter.slot + 1) % Math.max(1, orderOf(bat).length)];
  const setup = !started && editAfter === null ? (
    <View style={c.panel}>
      <Text style={c.h}>⚾ Line-ups</Text>
      {(['away', 'home'] as const).map((sd) => {
        const order = s.lineup[sd] ?? defaults(sd).order;
        const p = s.starters[sd] ?? defaults(sd).pitcher;
        return (
          <View key={sd} style={c.setupSide}>
            <Text style={[c.team, { color: ink(sd), textAlign: 'left' }]}>{name(sd)} {sd === 'away' ? '(bats first)' : ''}</Text>
            <Text style={c.meta} numberOfLines={3}>{order.length ? order.map((e, i) => `${i + 1}. ${e.name}${e.pos ? ` ${e.pos}` : ''}`).join(' · ') : 'No roster — batters are numbered 1–' + s.cfg.lineupSize + '.'}</Text>
            <Text style={c.meta}>Pitcher: {p?.name ?? '—'}</Text>
            {rosterOf(sd).length ? (
              <View style={c.row}>
                <Button label="Set batting order" variant="ghost" style={c.flex} onPress={() => setFlow({ mode: 'lineup', side: sd, picks: [], step: 'order' })} />
                <Button label="Pitcher" accessibilityLabel={`Pick ${name(sd)}'s starting pitcher`} variant="ghost" style={c.flex} onPress={() => setFlow({ mode: 'pitcher', side: sd })} />
              </View>
            ) : null}
          </View>
        );
      })}
      <Text style={c.meta}>{BASEBALL_PRESETS[s.cfg.preset]?.label ?? 'Baseball'} · {s.cfg.innings} innings · run rule {mercyText(s.cfg.mercy)}{s.cfg.tiebreak !== 'none' ? ` · tie-break from the ${s.cfg.tbFrom}th (${s.cfg.tiebreak === 'r12' ? 'runners on 1st + 2nd' : 'runner on 2nd'})` : ''}. The first pitch starts the game.</Text>
    </View>
  ) : null;

  return (
    <View style={c.wrap}>
      {editAfter !== null ? <BackfillBar at={`${halfShort(g.half)} · ${g.outs} out`} onLive={() => setFlow(null)} /> : null}
      {setup}
      <View style={c.panel}>
        <View style={c.sitRow}>
          <Diamond bases={g.bases} />
          {s.cfg.pitches ? <CountDots balls={g.balls} strikes={g.strikes} outs={g.outs} /> : <CountDots balls={0} strikes={0} outs={g.outs} maxBalls={1} maxStrikes={1} />}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={c.h} accessibilityLiveRegion="polite">{halfLong(g.half)} · {g.outs} out{g.outs === 1 ? '' : 's'}</Text>
            <Text style={[c.small, { color: ink(bat) }]} numberOfLines={1}>{name(bat)} batting</Text>
          </View>
        </View>
        <Text style={c.bat} numberOfLines={1}>🏏 {shownBatter.slot + 1}. {shownBatter.name}{shownBatter.pos ? ` (${shownBatter.pos})` : ''}{today ? ` · ${today}` : ''}</Text>
        <Text style={c.meta} numberOfLines={1}>⚾ {shownPitcher?.name ?? 'Pitcher'} · {pitches} pitch{pitches === 1 ? '' : 'es'}{onDeck ? ` · on deck ${onDeck.name}` : ''}</Text>
      </View>

      {flowPanel ?? (
        <>
          {s.cfg.pitches ? (
            <View style={c.pad}>
              <View style={c.row}>
                <Button label="Ball" accessibilityLabel={`Ball, count ${g.balls}-${g.strikes}`} variant="ghost" style={c.flex} onPress={() => pitch('ball')} />
                <Button label="Strike" accessibilityLabel="Called strike (looking)" variant="ghost" style={c.flex} onPress={() => pitch('called')} />
                <Button label="Swinging" accessibilityLabel="Swinging strike" variant="ghost" style={c.flex} onPress={() => pitch('swinging')} />
              </View>
              <View style={c.row}>
                <Button label="Foul" variant="ghost" style={c.flex} onPress={() => pitch('foul')} />
                <Button label="In play" accessibilityLabel="Ball in play — pick the outcome" color={color(bat)} style={c.flex} onPress={() => setFlow({ mode: 'inplay' })} />
                <Button label="HBP" accessibilityLabel="Hit by pitch" variant="ghost" style={c.flex} onPress={() => outcome('HBP')} />
              </View>
            </View>
          ) : (
            <View style={c.pad}>
              <View style={c.grid}>
                {HIT_BTNS.map((o) => <Button key={o} label={SHORT[o]!} color={color(bat)} style={c.quarter} onPress={() => outcome(o)} />)}
                <Button label="Walk" variant="ghost" style={c.quarter} onPress={() => outcome('BB')} />
                <Button label="Strikeout" variant="ghost" style={c.quarter} onPress={() => outcome('K')} />
                <Button label="Other out / reach →" variant="ghost" style={c.half} onPress={() => setFlow({ mode: 'inplay' })} />
              </View>
            </View>
          )}
          <View style={c.row}>
            <Button label="Runners" accessibilityLabel="Runner plays: steal, wild pitch, pick-off" variant="ghost" style={c.flex} disabled={!runners.length} onPress={() => setFlow({ mode: 'runner' })} />
            <Button label="Subs" accessibilityLabel="Substitutions and pitching changes" variant="ghost" style={c.flex} onPress={() => setFlow({ mode: 'sub', step: 'kind' })} />
            <Button label="More" accessibilityLabel="More: intentional walk, ejection" variant="ghost" style={c.flex} onPress={() => setFlow({ mode: 'more' })} />
          </View>
        </>
      )}

      <EditList s={view} show={showEdit} setShow={setShowEdit} onRemove={remove} onEdit={edit} onEarned={toggleEarned} homeName={homeName} awayName={awayName} />
      {/* SD-106: the only hand-made end — a called game — sits at the bottom and asks first */}
      {editAfter === null ? <Button label="🏁 Call game (time / weather)" variant="danger" disabled={g.half < 2} onPress={() => void callGame()} /> : null}
      {editAfter === null && g.half < 2 ? <Text style={c.note}>Outs, innings, walk-offs and the run rule end the game by themselves. Call a game only for a time limit or the weather (after the 1st inning).</Text> : null}
    </View>
  );
};

/** The scorer's "Correct the plays" list: remove, re-enter, earned / unearned. */
function EditList({ s, show, setShow, onRemove, onEdit, onEarned, homeName, awayName }: {
  s: BaseballState; show: boolean; setShow: (v: boolean) => void; onRemove: (e: BaseballEvent) => void; onEdit?: (e: BaseballEvent) => void; onEarned: (e: BaseballEvent) => void; homeName: string; awayName: string;
}) {
  if (!s.events.length) return null;
  return (
    <View style={c.panel}>
      <Text style={c.link} accessibilityRole="button" onPress={() => setShow(!show)}>{show ? 'Hide' : '✎ Correct the plays'}</Text>
      {show ? [...timelineEvents(s)].reverse().slice(0, 40).map((e) => {
        const d = describeEvent(e);
        const runs = s.g.runs.filter((r) => r.event === e.id);
        const editable = e.type === 'pa' || e.type === 'runner' || e.type === 'pitch';
        return (
          <View key={e.id} style={c.editRow}>
            <Text style={c.editWhen}>{eventWhen(s, e)}</Text>
            <Text style={c.editLabel} numberOfLines={2}>{d.icon} {d.label}{e.side && e.type !== 'pitch' ? ` · ${e.side === 'home' ? homeName : awayName}` : ''}{d.detail ? ` · ${d.detail}` : ''}</Text>
            {runs.length ? <RowAction label={runs.some((r) => r.earned) ? 'ER' : 'UER'} tone="insert" a11y={`Runs on this play are ${runs.some((r) => r.earned) ? 'earned' : 'unearned'} — tap to change`} onPress={() => onEarned(e)} /> : null}
            {onEdit && editable ? <RowAction label="✎ Edit" tone="edit" a11y={`Edit ${d.label}`} onPress={() => onEdit(e)} /> : null}
            <RowAction label="✕" tone="remove" a11y={`Remove ${d.label}`} onPress={() => void confirmRemove(`${d.label} (${eventWhen(s, e)})`, () => onRemove(e),
              e.type === 'pa' || e.type === 'runner' ? 'Later plays keep their runner moves — check the bases after.' : undefined)} />
          </View>
        );
      }) : null}
    </View>
  );
}

/* ------------------------------- live views -------------------------------- */

const LiveClock: NonNullable<SportPlugin<BaseballState>['LiveClock']> = ({ state }) => {
  const s = state as BaseballState;
  if (!s?.g) return null;
  const g = s.g;
  return (
    <View style={c.clockWrap}>
      {!g.ended && s.events.length ? <Diamond bases={g.bases} size={40} /> : null}
      <Text style={c.clockSmall}>{g.ended || !s.events.length ? statusText(s) : `${halfShort(g.half)} · ${g.outs} out${s.cfg.pitches ? ` · ${g.balls}-${g.strikes}` : ''}`}</Text>
    </View>
  );
};

/** The line score: R first, then runs per inning, then H and E. */
const BaseballScoreboard: NonNullable<SportPlugin<BaseballState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live }) => {
  const s = state as BaseballState;
  const g = s.g;
  // the last half-inning with a play in it (a finished game has moved on)
  let last = -1;
  for (const e of s.events) { const a = g.ann[e.id]; if (a && !a.ignored && (e.type === 'pitch' || e.type === 'pa' || e.type === 'runner')) last = Math.max(last, a.half); }
  const upTo = g.ended ? last : s.events.length ? g.half : -1;
  const n = Math.max(s.cfg.innings, inningOf(Math.max(0, upTo)));
  const columns = [
    ...Array.from({ length: n }, (_, i) => ({ label: String(i + 1), highlight: !g.ended && s.events.length > 0 && inningOf(g.half) === i + 1 })),
    { label: 'H' }, { label: 'E' },
  ];
  const cells = (sd: Side) => [
    ...Array.from({ length: n }, (_, i) => {
      const h = 2 * i + (sd === 'away' ? 0 : 1);
      // the home team didn't need its last turn at bat
      if (g.ended && g.endReason !== 'called' && sd === 'home' && h === upTo + 1 && upTo % 2 === 0) return 'X';
      if (h > upTo) return '';
      return String(g.line[h] ?? 0);
    }),
    String(g.hits[sd]), String(g.errors[sd]),
  ];
  const r = result(s);
  return (
    <LineScoreboard
      live={live}
      clock={<LiveClock state={s} />}
      leadLabel="R"
      columns={columns}
      // baseball reads the visitors on top (they bat first): the board's first row is the away team
      winner={r && r.winner !== 'draw' ? (r.winner === 'away' ? 'home' : 'away') : undefined}
      home={{ name: awayName, color: awayColor ?? theme.colors.away, lead: String(g.score.away), cells: cells('away') }}
      away={{ name: homeName, color: homeColor ?? theme.colors.home, lead: String(g.score.home), cells: cells('home') }}
    />
  );
};

const LiveExtras: NonNullable<SportPlugin<BaseballState>['LiveExtras']> = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }) => {
  const s = state as BaseballState;
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Text style={c.h}>Plays</Text>
      <LiveTimeline events={baseballTimeline(s)} homeColor={homeColor} awayColor={awayColor} emptyText="No plays yet." homeRoster={homeRoster} awayRoster={awayRoster} onPlayer={onPlayer} />
      <Text style={c.h}>Batting</Text>
      <MatchBoxScore sport="baseball" source={baseballBox(s, { homeRoster, awayRoster })} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} />
      {s.g?.spells.length || s.starters?.home || s.starters?.away ? <Text style={c.h}>Pitching</Text> : null}
      <MatchBoxScore sport="baseball" schema={baseballPitchingStats} show="box" source={baseballPitchingBox(s, { homeRoster, awayRoster })} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} />
    </View>
  );
};

/* --------------------------------- plugin ---------------------------------- */

export const baseballPlugin: SportPlugin<BaseballState> = {
  id: 'baseball',
  name: 'Baseball & softball',
  icon: '⚾',
  archetype: 'running-points',
  createInitialState: init,
  reducer,
  isComplete,
  result,
  cardLine,
  summary: (s) => ({
    homeScore: String(s.g.score.home),
    awayScore: String(s.g.score.away),
    statusLine: statusText(s),
    detailLine: `H ${s.g.hits.home}-${s.g.hits.away} · E ${s.g.errors.home}-${s.g.errors.away}`,
  }),
  statTotals: baseballTotals,
  // SD-115: what Undo removes — "Single · Rao (2-1)"
  undoLabel: (step) => {
    if (!step) return null;
    const prev = step.prev as BaseballState | undefined;
    const next = step.next as BaseballState | undefined;
    if (!prev?.events || !next?.events) return null;
    if (step.type === 'LINEUP') return 'line-up';
    if (next.events.length <= prev.events.length) return step.type === 'REMOVE_EVENT' ? 'play correction' : step.type === 'END' ? 'called game' : null;
    const e = next.events.find((x) => !prev.events.some((y) => y.id === x.id));
    if (!e) return null;
    const d = describeEvent(e);
    return `${d.label}${e.type === 'pa' && e.batter?.name ? ` · ${e.batter.name}` : ''} (${next.g.score.home}-${next.g.score.away})`;
  },
  tickerDetail: baseballTickerDetail,
  tickerFlash: baseballTickerFlash,
  voice: { hints: ['ball', 'strike swinging', 'foul', 'single', 'home run', 'walk', 'strikeout looking', 'ground out 6 3', 'stolen base'], parse: baseballVoice, ends: baseballVoiceEnds },
  ScoringControls,
  LiveClock,
  Scoreboard: BaseballScoreboard,
  LiveExtras,
  formation: (perSide) => baseballFormation(perSide),
  Court: BaseballField,
  liveSettings: BASEBALL_LIVE_SETTINGS,
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'baseball', onCreate: true,
      options: [
        ...Object.entries(BASEBALL_PRESETS).map(([value, p]) => ({ value, label: p.label, set: p.set })),
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'innings', label: 'Innings', type: 'number', default: 9, min: 3, max: 12, advanced: true },
    {
      key: 'mercy', label: 'Run rule (mercy)', type: 'choice', default: '15@5,10@7', advanced: true,
      options: [
        { value: '15@5,10@7', label: '15 after 5, 10 after 7 (WBSC baseball)' },
        { value: '15@3,10@4,7@5', label: '15 after 3, 10 after 4, 7 after 5 (WBSC softball)' },
        { value: '20@3,15@4,10@5', label: '20 after 3, 15 after 4, 10 after 5 (slow pitch)' },
        { value: '10@5', label: '10 after 5' },
        { value: '10@4', label: '10 after 4' },
        { value: '15@3,10@4', label: '15 after 3, 10 after 4' },
        { value: '', label: 'None' },
      ],
      hint: 'a lead this big after that many innings ends the game — check your competition',
    },
    {
      key: 'tiebreak', label: 'Extra innings', type: 'choice', default: 'r12', advanced: true,
      options: [
        { value: 'r12', label: 'Runners on 1st + 2nd (WBSC baseball)' },
        { value: 'r2', label: 'Runner on 2nd (WBSC softball, MLB)' },
        { value: 'none', label: 'Play on, bases empty' },
      ],
    },
    { key: 'tbFrom', label: 'Tie-break from inning', type: 'number', default: 10, min: 2, max: 15, advanced: true },
    { key: 'dh', label: 'Designated hitter', type: 'toggle', default: true, advanced: true },
    { key: 'lineupSize', label: 'Batters in the order', type: 'count', default: 9, min: 9, max: 15, advanced: true, hint: '10 in slow pitch; more for a continuous batting order' },
    { key: 'startCount', label: 'Count starts at', type: 'choice', default: '0-0', options: [{ value: '0-0', label: '0-0' }, { value: '1-1', label: '1-1 (slow pitch)' }], advanced: true },
    { key: 'foulOut', label: 'Foul with two strikes is out', type: 'toggle', default: false, advanced: true, hint: 'slow pitch' },
    { key: 'allowTies', label: 'A tied game may stand', type: 'toggle', default: false, advanced: true, hint: 'time-limited league games; never in a knockout' },
    { key: 'maxInnings', label: 'Stop after inning (0 = play on)', type: 'number', default: 0, min: 0, max: 20, advanced: true },
    { key: 'pitches', label: 'Pitch-by-pitch (balls & strikes)', type: 'toggle', default: true, advanced: true },
    { key: 'askFielders', label: 'Ask for fielders (6-3)', type: 'toggle', default: false, advanced: true },
  ],
};

const c = StyleSheet.create({
  wrap: { gap: theme.spacing(3) },
  panel: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  pad: { gap: theme.spacing(2) },
  row: { flexDirection: 'row', gap: theme.spacing(2), alignItems: 'stretch' },
  flex: { flex: 1 },
  half: { flexBasis: '46%', flexGrow: 1 },
  third: { flexBasis: '30%', flexGrow: 1 },
  quarter: { flexBasis: '22%', flexGrow: 1 },
  team: { fontSize: theme.font.small, fontWeight: '800', textAlign: 'center' },
  h: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800', flexShrink: 1 },
  small: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  note: { color: theme.colors.textMuted, fontSize: theme.font.tiny, textAlign: 'center' },
  bat: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  sitRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  setupSide: { gap: theme.spacing(1), paddingTop: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  clockWrap: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), flex: 1, minWidth: 0, justifyContent: 'center' },
  clockSmall: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '900', fontVariant: ['tabular-nums'] },
  flowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  cancel: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', paddingHorizontal: theme.spacing(2), paddingVertical: theme.spacing(3), minHeight: 44 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  pchip: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), minHeight: 44, paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceAlt, maxWidth: '100%' },
  pnum: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  pname: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', flexShrink: 1 },
  skip: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: 'transparent' },
  skipTxt: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  moveRow: { gap: theme.spacing(1), paddingVertical: theme.spacing(1), borderTopWidth: 1, borderTopColor: theme.colors.border },
  moveWho: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  moveChips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(1) },
  dest: { minHeight: 44, minWidth: 52, paddingHorizontal: theme.spacing(2), alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.inputBorder },
  destOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  destTxt: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  destTxtOn: { color: theme.colors.onFill },
  num: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.inputBorder, paddingHorizontal: theme.spacing(2) },
  numTxt: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  rbiRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  rbi: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '900', minWidth: 24, textAlign: 'center' },
  step: { minWidth: 48 },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800', minHeight: 44, paddingVertical: theme.spacing(3) },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  editWhen: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '800', width: 72 },
  editLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
});

