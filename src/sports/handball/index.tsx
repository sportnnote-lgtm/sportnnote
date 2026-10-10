/**
 * Handball plugin (IHF) — SD-102. Archetype: goal / time, on a running game
 * clock (2 halves, counting up). The pure rules live in ./engine.ts; the field
 * tracker and statTotals in ./totals.ts, the box score in ./box.ts.
 *
 * The scorer's panel: the clock (start / stop / end the half / set it), then
 * per side Goal (shot type, scorer + assist), 7 m (scored / saved / missed),
 * Shot (type, then saved / missed / blocked), Turnover (technical fault or
 * stolen), Card (warning, 2 minutes, disqualification, + report), Time-out
 * (IHF 2:10 limits) and Sub; the keeper is picked from the line-up (GK slot)
 * or changed by hand. Every event carries its game-clock second, so a
 * 2-minute suspension counts down on playing time and the player is back by
 * himself. A level knockout match goes to extra time and / or 7-metre throws.
 *
 * Corrections: "Correct the timeline" removes or re-enters a past moment
 * (REMOVE_EVENT with the reversed credits — the linked save / block / steal
 * goes with it — then the same flow stamped at the original time, SD-114).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, TextField } from '../../components/ui';
import { confirmMatchAction } from '../../components/ConfirmSheet';
import { LineScoreboard } from '../../components/LineScoreboard';
import { MatchBoxScore } from '../../components/BoxScore';
import { FieldBanner } from '../FieldBanner';
import { LiveTimeline } from '../LiveTimeline';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';
import {
  init, reducer, isComplete, result, matchSec, periodSec, periodLen, clockFace, clockText, periodName, periodLong, periodStarted, running,
  eventCredits, creditAttribution, currentKeeper, soScore, nextThrower, handballScoreLine, timeoutCheck, suspensionsOf, hasYellow, teamYellows,
  totalPeriods, maxEtRounds, HANDBALL_PRESETS, HANDBALL_LIVE_SETTINGS, SHOT_LABEL, SHOT_TYPES, LIVE_KEYS,
  type HandballEvent, type HandballState, type MissResult, type Sanction, type ShotType, type Side,
} from './engine';
import { handballTotals, handballLiveField, handballField, unavailable } from './totals';
import { handballBox } from './box';
import { handballTimeline, describeEvent, eventWhen, timelineEvents } from './timeline';
import { handballTickerDetail, handballTickerFlash } from './ticker';
import { handballFormation, HandballCourt } from './court';
import { usePendingEdit } from '../usePendingEdit';
import { BackfillBar, RowAction, confirmRemove } from '../TimelineControls';

const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const isKeeperPos = (p?: string | null) => !!p && /^\s*(gk|goal\s*-?\s*keeper|keeper)\s*$/i.test(p);
const TRACKED: string[] = LIVE_KEYS.filter((k) => k !== 'soTaken' && k !== 'soGoals');
const FIELD_TYPES = SHOT_TYPES.filter((t) => t !== 'sevenM');

/* ------------------------------ player picker ------------------------------ */

function PlayerGrid({ players, onPick, skip }: { players: Player[]; onPick: (p: Player) => void; skip?: { label: string; onPress: () => void } }) {
  return (
    <View style={c.grid}>
      {players.map((p) => (
        <TouchableOpacity key={p.id} style={c.pchip} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={p.fullName} onPress={() => onPick(p)}>
          <Text style={c.pnum}>{p.jerseyNo ?? '–'}</Text>
          <Text style={c.pname} numberOfLines={1}>{p.fullName}</Text>
        </TouchableOpacity>
      ))}
      {players.length === 0 ? <Text style={c.meta}>No players listed — use the button below.</Text> : null}
      {skip ? (
        <TouchableOpacity style={[c.pchip, c.skip]} activeOpacity={0.75} accessibilityRole="button" onPress={skip.onPress}>
          <Text style={c.skipTxt}>{skip.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

type Flow =
  | { mode: 'goal'; side: Side; step: 'type' | 'scorer' | 'assist'; shotType?: ShotType; scorer?: Player | null }
  | { mode: 'shot'; side: Side; step: 'type' | 'result' | 'player' | 'blocker'; shotType?: ShotType; result?: MissResult; shooter?: Player | null }
  | { mode: 'seven'; side: Side; step: 'result' | 'player'; result?: 'saved' | 'missed' }
  | { mode: 'turnover'; side: Side; step: 'kind' | 'player' | 'stealer'; stolen?: boolean; loser?: Player | null }
  | { mode: 'card'; side: Side; step: 'kind' | 'player'; card?: Sanction; blue?: boolean }
  | { mode: 'sub'; side: Side; step: 'off' | 'on'; off?: Player | null }
  | { mode: 'gk'; side: Side };

/* -------------------------------- controls --------------------------------- */

const ScoringControls: SportPlugin<HandballState>['ScoringControls'] = ({
  state: liveState, dispatch: rawDispatch, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [], homeLineup = [], awayLineup = [],
}) => {
  // SD-114: Edit holds the removal until the re-entry commits (Cancel keeps the
  // event); `s` is the view as if it were removed. See usePendingEdit.
  const { view: s, dispatch, begin: holdRemoval, cancel: dropHeldRemoval } = usePendingEdit(liveState, rawDispatch, reducer);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [editAt, setEditAt] = useState<{ sec: number; period: number } | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [clockInput, setClockInput] = useState('');
  const [setting, setSetting] = useState(false);
  const [official, setOfficial] = useState('');
  const [soTaker, setSoTaker] = useState<Player | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running(s)) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.clock.since, s.ended]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (flow === null && editAt) { setEditAt(null); dropHeldRemoval(); } }, [flow]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = Date.now();
  const name = (sd: Side) => (sd === 'home' ? homeName : awayName);
  const color = (sd: Side) => (sd === 'home' ? homeColor ?? theme.colors.home : awayColor ?? theme.colors.away);
  const rosterOf = (sd: Side) => (sd === 'home' ? homeRoster : awayRoster);
  const lineupOf = (sd: Side) => (sd === 'home' ? homeLineup : awayLineup);
  const byId = (sd: Side, id?: string, nm?: string): Player | undefined =>
    rosterOf(sd).find((p) => (id && p.id === id) || (!id && nm && p.fullName === nm)) ?? (id ? { id, fullName: nm ?? 'Player', sports: ['handball'] } as Player : undefined);

  // stamp every event with its game-clock second (or the edited moment's)
  const fire = (a: ScoreAction) => {
    const at = Date.now();
    dispatch({ ...a, payload: { ...a.payload, uid: (a.payload?.uid as string | undefined) ?? uid(), at, sec: editAt?.sec ?? matchSec(s, at), period: editAt?.period ?? s.period, ...(editAt ? { edit: true } : {}) } });
  };

  /* ---- who is on court ---- */
  const stampOf = (sd: Side) => {
    const roster = rosterOf(sd);
    const slots = lineupOf(sd).filter((sl) => sl.playerId);
    const players = slots.map((sl) => ({ id: sl.playerId!, name: roster.find((p) => p.id === sl.playerId)?.fullName ?? sl.playerName ?? '' }));
    const gkSlot = slots.find((sl) => sl.position === 'GK');
    const gkP = gkSlot ? players.find((p) => p.id === gkSlot.playerId)
      : roster.filter((p) => isKeeperPos(p.sportDetails?.handball?.position)).map((p) => ({ id: p.id, name: p.fullName })).find((k) => !players.length || players.some((x) => x.id === k.id));
    return { ...(players.length ? { players } : {}), ...(gkP ? { gk: gkP } : {}) };
  };
  const stampXi = () => {
    for (const sd of ['home', 'away'] as const) {
      const st = stampOf(sd);
      if (!st.players && !st.gk) continue;
      if (JSON.stringify(st) === JSON.stringify(s.xi?.[sd] ?? {})) continue;
      dispatch({ type: 'XI', payload: { team: sd, ...st } });
    }
  };
  const out = unavailable(s, now);
  const onCourt = (sd: Side): Player[] => {
    const roster = rosterOf(sd);
    const gone = (p: Player) => out[sd].has(p.id) || out[sd].has(p.fullName);
    if (s.xi?.[sd]?.players?.length) {
      return handballField(s, matchSec(s, now) / 60).onField[sd].map((f) => byId(sd, f.id, f.name)).filter((p): p is Player => !!p);
    }
    const lu = lineupOf(sd).filter((sl) => sl.playerId).map((sl) => byId(sd, sl.playerId, sl.playerName)).filter((p): p is Player => !!p);
    return (lu.length ? lu : roster).filter((p) => !gone(p));
  };
  const bench = (sd: Side): Player[] => {
    const on = new Set(onCourt(sd).map((p) => p.id));
    return rosterOf(sd).filter((p) => !on.has(p.id) && !out[sd].has(p.id) && !out[sd].has(p.fullName));
  };
  /** a sanction can hit anyone on the team sheet still in the match */
  const sanctionable = (sd: Side): Player[] => [...onCourt(sd), ...bench(sd)];
  const keeper = (sd: Side) => {
    const k = currentKeeper(s, sd);
    return k?.id ? byId(sd, k.id, k.name) : undefined;
  };

  /* ---- recorders ---- */
  const credit = (e: Parameters<typeof eventCredits>[0]) => {
    const cr = eventCredits(e);
    return { attribution: creditAttribution(cr.first, 1, TRACKED), attribution2: creditAttribution(cr.second, 1, TRACKED) };
  };
  const goal = (sd: Side, shotType: ShotType, scorer: Player | null, assist: Player | null) => {
    fire({ type: 'GOAL', side: sd, payload: { shotType }, ...credit({ type: 'goal', shotType, playerId: scorer?.id, playerName: scorer?.fullName, secondId: assist?.id, secondName: assist?.fullName }) });
    setFlow(null);
  };
  // an attempt that didn't score; a save goes to the other side's keeper (its
  // own action on the keeper's side), a block to the blocker
  const miss = (sd: Side, shotType: ShotType, res: MissResult, p: Player | null, blocker?: Player | null) => {
    const id = uid();
    fire({ type: 'MISS', side: sd, payload: { shotType, result: res, uid: id }, ...credit({ type: 'miss', shotType, playerId: p?.id, playerName: p?.fullName }) });
    if (res === 'saved') {
      const gk = keeper(opp(sd));
      fire({ type: 'SAVE', side: opp(sd), payload: { ref: id, shotType }, ...credit({ type: 'save', shotType, playerId: gk?.id, playerName: gk?.fullName }) });
    }
    if (res === 'blocked' && blocker) fire({ type: 'BLOCK', side: opp(sd), payload: { ref: id }, ...credit({ type: 'block', playerId: blocker.id, playerName: blocker.fullName }) });
    setFlow(null);
  };
  const turnover = (sd: Side, p: Player | null, stealer?: Player | null) => {
    const id = uid();
    fire({ type: 'TURNOVER', side: sd, payload: { uid: id, ...(stealer !== undefined ? { stolen: true } : {}) }, ...credit({ type: 'turnover', playerId: p?.id, playerName: p?.fullName }) });
    if (stealer) fire({ type: 'STEAL', side: opp(sd), payload: { ref: id }, ...credit({ type: 'steal', playerId: stealer.id, playerName: stealer.fullName }) });
    setFlow(null);
  };
  const card = (sd: Side, kind: Sanction, p: Player | null, blue?: boolean) => {
    const third = kind === 'twoMin' && !!p && suspensionsOf(s, sd, { id: p.id, name: p.fullName }) >= 2;
    fire({ type: 'CARD', side: sd, payload: { card: kind, ...(third ? { third: true } : {}), ...(blue ? { blue: true } : {}) }, ...credit({ type: 'card', card: kind, third, blue, playerId: p?.id, playerName: p?.fullName }) });
    setFlow(null);
  };
  const officialCard = (sd: Side, kind: Sanction) => {
    fire({ type: 'CARD', side: sd, payload: { card: kind, official: official.trim() || 'Team official' } });
    setOfficial(''); setFlow(null);
  };
  const sub = (sd: Side, off: Player | null, on: Player) => {
    fire({ type: 'SUB', side: sd, payload: { ...(off ? { offId: off.id, offName: off.fullName } : {}), onId: on.id, onName: on.fullName } });
    setFlow(null);
  };
  const setKeeper = (sd: Side, p: Player) => {
    fire({ type: 'GK', side: sd, payload: { id: p.id, name: p.fullName } });
    setFlow(null);
  };
  const timeout = (sd: Side) => fire({ type: 'TIMEOUT', side: sd });

  /* ---- correct the timeline ---- */
  const isAnswer = (e: HandballEvent) => (e.type === 'save' || e.type === 'block' || e.type === 'steal') && !!e.ref;
  const removalActions = (e: HandballEvent): ScoreAction[] => {
    const cr = eventCredits(e);
    return [
      { type: 'REMOVE_EVENT', side: e.side, payload: { id: e.id }, attribution: creditAttribution(cr.first, -1), attribution2: creditAttribution(cr.second, -1) },
      // an attempt / turnover takes its save / block / steal with it (their own side)
      ...s.events.filter((x) => isAnswer(x) && x.ref === e.id).flatMap(removalActions),
    ];
  };
  const remove = (e: HandballEvent) => { for (const a of removalActions(e)) dispatch(a); };
  const edit = (e: HandballEvent) => {
    if (e.type === 'timeout' || isAnswer(e) || e.type === 'save') { remove(e); return; }
    holdRemoval(removalActions(e));
    setEditAt({ sec: e.sec, period: e.period });
    setShowEdit(false);
    if (e.type === 'goal') setFlow({ mode: 'goal', side: e.side, step: 'type' });
    else if (e.type === 'miss') setFlow(e.shotType === 'sevenM' ? { mode: 'seven', side: e.side, step: 'result' } : { mode: 'shot', side: e.side, step: 'type' });
    else if (e.type === 'turnover') setFlow({ mode: 'turnover', side: e.side, step: 'kind' });
    else if (e.type === 'card') setFlow({ mode: 'card', side: e.side, step: 'kind' });
    else if (e.type === 'sub') setFlow({ mode: 'sub', side: e.side, step: 'off' });
    else if (e.type === 'gk') setFlow({ mode: 'gk', side: e.side });
    else if (e.type === 'block' || e.type === 'steal') remove(e);
  };

  /* ---- clock ---- */
  const startStop = () => {
    const at = Date.now();
    if (running(s)) { dispatch({ type: 'CLOCK', payload: { run: false, at } }); return; }
    if (s.period === 1 && !periodStarted(s)) stampXi();
    dispatch({ type: 'CLOCK', payload: { run: true, at } });
  };
  const level = s.home === s.away;
  const lastOfTotal = s.period >= totalPeriods(s);
  // the end of regular time / an extra time while level, with extra time left,
  // goes on to extra time — so it's a period end, not full time (IHF 2:2)
  const toExtra = lastOfTotal && level && s.etRounds < maxEtRounds(s.decider);
  const last = lastOfTotal && !toExtra;
  // SD-106: ending a half / full time asks first (ConfirmSheet).
  const endPeriod = async () => {
    if (!periodStarted(s)) return; // SD-116 (H1): a half that hasn't started can't end
    const score = `${s.home}-${s.away}`;
    const ok = last ? await confirmMatchAction('fullTime', { score }) : await confirmMatchAction('endPeriod', { period: periodName(s, s.period), score });
    if (!ok) return;
    if (last) stampXi();
    dispatch({ type: 'END_PERIOD', payload: { at: Date.now() } });
  };
  const applyClock = () => {
    const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(clockInput.trim());
    if (!m) return;
    // the time on the match clock (handball counts up), within this half
    const want = Number(m[1]) * 60 + Number(m[2] ?? 0);
    const start = matchSec(s, now) - periodSec(s, now);
    dispatch({ type: 'SET_CLOCK', payload: { periodSec: Math.max(0, Math.min(periodLen(s, s.period), want - start)), at: Date.now() } });
    setSetting(false); setClockInput('');
  };

  /* ---- after the final whistle: 7-metre throws ---- */
  if (s.ended) {
    if (s.shootout) {
      const sc = soScore(s);
      const nextSide = nextThrower(s.shootout);
      const n = s.shootout[nextSide].length + 1;
      return (
        <View style={c.wrap}>
          <View style={c.panel}>
            <Text style={c.h}>🎯 7-metre throws · {sc.home}–{sc.away}</Text>
            {(['home', 'away'] as const).map((sd) => (
              <View key={sd} style={c.soRow}>
                <Text style={c.soTeam} numberOfLines={1}>{name(sd)}</Text>
                <Text style={c.soDots}>{s.shootout![sd].map((k) => (k.scored ? '●' : '○')).join(' ') || '–'}</Text>
              </View>
            ))}
            {s.shootoutWinner ? (
              <Text style={c.done}>{name(s.shootoutWinner)} win on 7-metre throws {sc.home}–{sc.away}</Text>
            ) : (
              <>
                <Text style={c.meta}>Next: {name(nextSide)} · throw {n}{n > 5 ? ' (one each until decided)' : ''}</Text>
                <Text style={c.small}>Thrower (optional)</Text>
                <PlayerGrid players={sanctionable(nextSide).filter((p) => p.id !== soTaker?.id)} onPick={(p) => setSoTaker(p)} />
                {soTaker ? <Text style={c.meta}>Thrower: {soTaker.fullName}</Text> : null}
                <View style={c.row}>
                  <Button label="✓ Scored" color={color(nextSide)} style={c.flex} onPress={() => {
                    dispatch({ type: 'SO', side: nextSide, payload: { scored: true }, ...(soTaker ? { attribution: { playerId: soTaker.id, stat: 'soTaken', playerName: soTaker.fullName, extra: { soGoals: 1 } } } : {}) });
                    setSoTaker(null);
                  }} />
                  <Button label="✗ Missed / saved" variant="ghost" style={c.flex} onPress={() => {
                    dispatch({ type: 'SO', side: nextSide, payload: { scored: false }, ...(soTaker ? { attribution: { playerId: soTaker.id, stat: 'soTaken', playerName: soTaker.fullName } } : {}) });
                    setSoTaker(null);
                  }} />
                </View>
              </>
            )}
          </View>
        </View>
      );
    }
    return (
      <View style={c.wrap}>
        <View style={c.panel}>
          <Text style={c.h}>Full time · {s.home}–{s.away}{s.etRounds ? ' (after extra time)' : ''}</Text>
          {level && s.decider !== 'none' ? (
            <>
              <Text style={c.meta}>Level — the match goes to 7-metre throws (5 each, then one each until decided). Who throws first?</Text>
              <View style={c.row}>
                <Button label={`${homeName} first`} color={color('home')} style={c.flex} onPress={() => dispatch({ type: 'START_SHOOTOUT', payload: { first: 'home' } })} />
                <Button label={`${awayName} first`} color={color('away')} style={c.flex} onPress={() => dispatch({ type: 'START_SHOOTOUT', payload: { first: 'away' } })} />
              </View>
            </>
          ) : (
            <Text style={c.meta}>{level ? 'Draw.' : `${name(s.home > s.away ? 'home' : 'away')} win.`} Use “Correct the timeline” below to fix a moment.</Text>
          )}
        </View>
        <EditList s={s} show={showEdit} setShow={setShowEdit} onRemove={remove} homeName={homeName} awayName={awayName} />
      </View>
    );
  }

  /* ---- flows ---- */
  const flowPanel = (() => {
    if (!flow) return null;
    const sd = flow.side;
    const head = (t: string) => (
      <View style={c.flowHead}>
        <Text style={[c.h, { color: color(sd) }]} numberOfLines={1}>{t} · {name(sd)}</Text>
        <Text style={c.cancel} accessibilityRole="button" onPress={() => setFlow(null)}>Cancel</Text>
      </View>
    );
    const typeGrid = (pick: (t: ShotType) => void) => (
      <View style={c.grid}>
        {FIELD_TYPES.map((t) => (
          <Button key={t} label={SHOT_LABEL[t]} variant="ghost" style={c.typeBtn} onPress={() => pick(t)} />
        ))}
      </View>
    );
    switch (flow.mode) {
      case 'goal':
        if (flow.step === 'type') return (
          <View style={c.panel}>{head('Goal')}
            <Text style={c.small}>From where?</Text>
            {typeGrid((t) => setFlow({ ...flow, shotType: t, step: 'scorer' }))}
            <Text style={c.meta}>A 7-metre throw has its own 🎯 7 m button.</Text>
          </View>
        );
        if (flow.step === 'scorer') return (
          <View style={c.panel}>{head(`Goal · ${SHOT_LABEL[flow.shotType ?? 'nineM']}`)}
            <Text style={c.small}>Who scored?</Text>
            <PlayerGrid players={onCourt(sd)} onPick={(p) => (flow.shotType === 'sevenM' ? goal(sd, 'sevenM', p, null) : setFlow({ ...flow, scorer: p, step: 'assist' }))}
              skip={{ label: 'Team goal (no scorer)', onPress: () => goal(sd, flow.shotType ?? 'nineM', null, null) }} />
          </View>
        );
        return (
          <View style={c.panel}>{head('Assist')}
            <PlayerGrid players={onCourt(sd).filter((p) => p.id !== flow.scorer?.id)} onPick={(p) => goal(sd, flow.shotType ?? 'nineM', flow.scorer ?? null, p)}
              skip={{ label: 'No assist', onPress: () => goal(sd, flow.shotType ?? 'nineM', flow.scorer ?? null, null) }} />
          </View>
        );
      case 'shot':
        if (flow.step === 'type') return (
          <View style={c.panel}>{head('Shot — no goal')}
            <Text style={c.small}>From where?</Text>
            {typeGrid((t) => setFlow({ ...flow, shotType: t, step: 'result' }))}
          </View>
        );
        if (flow.step === 'result') return (
          <View style={c.panel}>{head(`Shot · ${SHOT_LABEL[flow.shotType ?? 'nineM']}`)}
            <View style={c.row}>
              <Button label="🧤 Saved" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, result: 'saved', step: 'player' })} />
              <Button label="↗ Missed" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, result: 'missed', step: 'player' })} />
              <Button label="🛡 Blocked" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, result: 'blocked', step: 'player' })} />
            </View>
            {keeper(opp(sd)) ? <Text style={c.meta}>A save goes to {keeper(opp(sd))!.fullName} (keeper).</Text> : null}
          </View>
        );
        if (flow.step === 'player') return (
          <View style={c.panel}>{head('Who shot?')}
            <PlayerGrid players={onCourt(sd)} onPick={(p) => (flow.result === 'blocked' ? setFlow({ ...flow, shooter: p, step: 'blocker' }) : miss(sd, flow.shotType ?? 'nineM', flow.result ?? 'missed', p))}
              skip={{ label: 'Skip player', onPress: () => (flow.result === 'blocked' ? setFlow({ ...flow, shooter: null, step: 'blocker' }) : miss(sd, flow.shotType ?? 'nineM', flow.result ?? 'missed', null)) }} />
          </View>
        );
        return (
          <View style={c.panel}>{head(`Blocked by (${name(opp(sd))})`)}
            <PlayerGrid players={onCourt(opp(sd))} onPick={(p) => miss(sd, flow.shotType ?? 'nineM', 'blocked', flow.shooter ?? null, p)}
              skip={{ label: 'Skip blocker', onPress: () => miss(sd, flow.shotType ?? 'nineM', 'blocked', flow.shooter ?? null, null) }} />
          </View>
        );
      case 'seven':
        if (flow.step === 'result') return (
          <View style={c.panel}>{head('7-metre throw')}
            <View style={c.row}>
              <Button label="✓ Scored" color={color(sd)} style={c.flex} onPress={() => setFlow({ mode: 'goal', side: sd, step: 'scorer', shotType: 'sevenM' })} />
              <Button label="🧤 Saved" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, result: 'saved', step: 'player' })} />
              <Button label="↗ Missed" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, result: 'missed', step: 'player' })} />
            </View>
            {keeper(opp(sd)) ? <Text style={c.meta}>A save goes to {keeper(opp(sd))!.fullName} (keeper) as a 7 m save.</Text> : null}
          </View>
        );
        return (
          <View style={c.panel}>{head('7 m thrower')}
            <PlayerGrid players={onCourt(sd)} onPick={(p) => miss(sd, 'sevenM', flow.result ?? 'missed', p)} skip={{ label: 'Skip player', onPress: () => miss(sd, 'sevenM', flow.result ?? 'missed', null) }} />
          </View>
        );
      case 'turnover':
        if (flow.step === 'kind') return (
          <View style={c.panel}>{head('Turnover')}
            <View style={c.row}>
              <Button label="⚠️ Technical fault" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, stolen: false, step: 'player' })} />
              <Button label="🖐 Ball stolen" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, stolen: true, step: 'player' })} />
            </View>
            <Text style={c.meta}>Technical faults: steps, double dribble, line violation, offensive foul, passive play, a bad pass… A stolen ball also credits the defender with a steal.</Text>
          </View>
        );
        if (flow.step === 'player') return (
          <View style={c.panel}>{head(flow.stolen ? 'Who lost the ball?' : 'Technical fault — who?')}
            <PlayerGrid players={onCourt(sd)} onPick={(p) => (flow.stolen ? setFlow({ ...flow, loser: p, step: 'stealer' }) : turnover(sd, p))}
              skip={{ label: 'Skip player', onPress: () => (flow.stolen ? setFlow({ ...flow, loser: null, step: 'stealer' }) : turnover(sd, null)) }} />
          </View>
        );
        return (
          <View style={c.panel}>{head(`Stolen by (${name(opp(sd))})`)}
            <PlayerGrid players={onCourt(opp(sd))} onPick={(p) => turnover(sd, flow.loser ?? null, p)} skip={{ label: 'Skip', onPress: () => turnover(sd, flow.loser ?? null, null) }} />
          </View>
        );
      case 'card': {
        if (flow.step === 'kind') return (
          <View style={c.panel}>{head('Sanction')}
            <View style={c.row}>
              <Button label="🟨 Warning" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, card: 'yellow', step: 'player' })} />
              <Button label="⏱ 2 minutes" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, card: 'twoMin', step: 'player' })} />
            </View>
            <View style={c.row}>
              <Button label="🟥 Disqualify" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, card: 'red', blue: false, step: 'player' })} />
              <Button label="🟥🟦 + report" accessibilityLabel="Disqualification with a written report (blue card)" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, card: 'red', blue: true, step: 'player' })} />
            </View>
            <Text style={c.meta}>2 minutes: the team plays a player short for 2 minutes of playing time; the 3rd suspension of a player disqualifies him. A disqualification: out for the match, the team short for 2 minutes. Blue = a written report follows.</Text>
          </View>
        );
        const k = flow.card ?? 'twoMin';
        const title = k === 'yellow' ? 'Warning (yellow)' : k === 'twoMin' ? '2-minute suspension' : flow.blue ? 'Disqualification + report' : 'Disqualification';
        const warnedTeam = teamYellows(s, sd);
        return (
          <View style={c.panel}>{head(title)}
            {k === 'yellow' && warnedTeam >= 3 ? <Text style={c.short}>{name(sd)} have had 3 warnings — IHF: the next sanction is 2 minutes.</Text> : null}
            <PlayerGrid players={sanctionable(sd)} onPick={(p) => {
              if (k === 'yellow' && hasYellow(s, sd, { id: p.id, name: p.fullName })) { card(sd, 'twoMin', p); return; }
              card(sd, k, p, flow.blue);
            }} />
            {k === 'twoMin' ? <Text style={c.meta}>A player’s 3rd suspension is recorded as a disqualification too.</Text> : null}
            {k === 'yellow' ? <Text style={c.meta}>One warning per player: a player already warned gets 2 minutes instead.</Text> : null}
            <Text style={c.small}>Or a team official</Text>
            <View style={c.row}>
              <View style={c.flex}><TextField label="Official (optional)" value={official} onChange={setOfficial} placeholder="e.g. Coach" autoCapitalize="words" /></View>
              <Button label="Record" variant="ghost" onPress={() => officialCard(sd, k)} />
            </View>
          </View>
        );
      }
      case 'sub': {
        if (flow.step === 'off') {
          const live = handballLiveField(s, now);
          return (
            <View style={c.panel}>{head('Sub — who comes off?')}
              <PlayerGrid players={onCourt(sd)} onPick={(p) => setFlow({ ...flow, off: p, step: 'on' })}
                skip={live.short[sd] > 0 && !live.suspended.some((x) => x.side === sd) ? { label: 'No one — fill the empty place', onPress: () => setFlow({ ...flow, off: null, step: 'on' }) } : undefined} />
            </View>
          );
        }
        return (
          <View style={c.panel}>{head(flow.off ? `Sub — on for ${flow.off.fullName}` : 'Who comes on?')}
            <PlayerGrid players={bench(sd)} onPick={(p) => sub(sd, flow.off ?? null, p)} />
            <Text style={c.meta}>Substitutions are unlimited, through the team’s substitution area.</Text>
          </View>
        );
      }
      case 'gk':
        return (
          <View style={c.panel}>{head('Goalkeeper')}
            <PlayerGrid players={[...onCourt(sd), ...bench(sd)]} onPick={(p) => setKeeper(sd, p)} />
          </View>
        );
    }
  })();

  const live = handballLiveField(s, now);
  const sideCol = (sd: Side) => {
    const gk = keeper(sd);
    const to = timeoutCheck(s, sd, now);
    return (
      <View key={sd} style={c.col}>
        <Text style={[c.team, { color: color(sd) }]} numberOfLines={1}>{name(sd)}</Text>
        <Button label="🤾 Goal" color={color(sd)} onPress={() => setFlow({ mode: 'goal', side: sd, step: 'type' })} />
        <Button label="🎯 7 m" accessibilityLabel="7-metre throw" variant="ghost" onPress={() => setFlow({ mode: 'seven', side: sd, step: 'result' })} />
        <Button label="↗ Shot" accessibilityLabel="Shot without a goal" variant="ghost" onPress={() => setFlow({ mode: 'shot', side: sd, step: 'type' })} />
        <Button label="⚠️ Turnover" variant="ghost" onPress={() => setFlow({ mode: 'turnover', side: sd, step: 'kind' })} />
        <Button label="🟨 Card" accessibilityLabel="Sanction" variant="ghost" onPress={() => setFlow({ mode: 'card', side: sd, step: 'kind' })} />
        <Button label="🔁 Sub" variant="ghost" onPress={() => setFlow({ mode: 'sub', side: sd, step: 'off' })} />
        <Button label={`⏸ Time-out · ${to.left}`} accessibilityLabel={`Team time-out for ${name(sd)}, ${to.left} left`} variant="ghost" disabled={!to.ok || !periodStarted(s)} onPress={() => timeout(sd)} />
        {!to.ok && to.reason && to.left > 0 ? <Text style={c.gk}>{to.reason}</Text> : null}
        <Text style={c.gk} accessibilityRole="button" onPress={() => setFlow({ mode: 'gk', side: sd })} numberOfLines={2}>
          🧤 {gk ? gk.fullName : 'Set keeper'} ›
        </Text>
        {live.short[sd] > 0 ? <Text style={c.short}>Playing {live.short[sd]} short</Text> : null}
      </View>
    );
  };

  return (
    <View style={c.wrap}>
      {editAt ? <BackfillBar at={`${periodName(s, editAt.period)} ${clockText(editAt.sec)}`} onLive={() => setFlow(null)} /> : null}
      {/* the game clock */}
      <View style={c.panel}>
        <View style={c.clockRow}>
          <View style={{ flex: 1 }}>
            <Text style={c.small}>{periodLong(s, s.period)}</Text>
            <Text style={c.clock}>{clockFace(s, now)}</Text>
          </View>
          <Button label={running(s) ? '⏸ Stop' : periodStarted(s) ? '▶ Resume' : s.period === 1 ? '▶ Throw-off' : `▶ Start ${periodName(s, s.period)}`} variant={running(s) ? 'ghost' : 'primary'} onPress={startStop} />
        </View>
        <View style={c.row}>
          {/* the final whistle's Full time sits at the bottom of the controls (SD-106) */}
          {!last ? <Button label={`⏭ End ${periodName(s, s.period)}`} variant="ghost" style={c.flex}
            disabled={!periodStarted(s)} onPress={() => void endPeriod()} /> : null}
          <Button label="⏱ Set clock" variant="ghost" style={c.flex} onPress={() => setSetting((v) => !v)} />
        </View>
        {toExtra && periodStarted(s) ? <Text style={c.meta}>Level — ending this half goes to extra time (2 × {s.etMinutes} min).</Text> : null}
        {setting ? (
          <View style={c.row}>
            <View style={c.flex}><TextField label="Match clock (mm:ss)" value={clockInput} onChange={setClockInput} placeholder={clockFace(s, now)} /></View>
            <Button label="Set" onPress={applyClock} />
          </View>
        ) : null}
        {periodSec(s, now) >= periodLen(s, s.period) && running(s) ? <Text style={c.short}>Time is up — finish any 7 m or free throw, then end the half.</Text> : null}
        {!running(s) && periodStarted(s) && periodSec(s, now) < periodLen(s, s.period) ? (() => {
          const lastEv = s.events[s.events.length - 1];
          const why = lastEv?.type === 'timeout' ? ` (team time-out, ${name(lastEv.side)})` : lastEv?.type === 'card' && lastEv.card !== 'yellow' ? ' (suspension)' : '';
          return (
            <View style={c.stopped} accessibilityRole="alert">
              <Text style={c.stoppedTxt}>⏸ Clock stopped{why}</Text>
              <Button label="▶ Resume" onPress={startStop} />
            </View>
          );
        })() : null}
      </View>

      {flowPanel ?? (
        <View style={c.cols}>{sideCol('home')}{sideCol('away')}</View>
      )}

      <EditList s={s} show={showEdit} setShow={setShowEdit} onRemove={remove} onEdit={edit} homeName={homeName} awayName={awayName} />
      {/* SD-116 (H1): not live during the break before the last half */}
      {last ? <Button label="🏁 Full time" variant="danger" disabled={!periodStarted(s)} onPress={() => void endPeriod()} /> : null}
      {last && !periodStarted(s) ? <Text style={c.gk}>Start {periodName(s, s.period)} first — Full time unlocks once it’s under way.</Text> : null}
    </View>
  );
};

/** The scorer's "Correct the timeline" list: remove a moment, or re-enter it. */
function EditList({ s, show, setShow, onRemove, onEdit, homeName, awayName }: {
  s: HandballState; show: boolean; setShow: (v: boolean) => void; onRemove: (e: HandballEvent) => void; onEdit?: (e: HandballEvent) => void; homeName: string; awayName: string;
}) {
  if (!s.events.length) return null;
  return (
    <View style={c.panel}>
      <Text style={c.link} accessibilityRole="button" onPress={() => setShow(!show)}>{show ? 'Hide' : '✎ Correct the timeline'}</Text>
      {show ? [...timelineEvents(s)].reverse().slice(0, 40).map(({ e, answer, answers }) => {
        const d = describeEvent(e, answer);
        return (
          <View key={e.id} style={c.editRow}>
            <Text style={c.editWhen}>{eventWhen(s, e)}</Text>
            <Text style={c.editLabel} numberOfLines={2}>{d.icon} {d.label} · {e.side === 'home' ? homeName : awayName}{d.detail ? ` · ${d.detail}` : ''}</Text>
            {onEdit && e.type !== 'timeout' && e.type !== 'save' && e.type !== 'block' && e.type !== 'steal' ? <RowAction label="✎ Edit" tone="edit" a11y={`Edit ${d.label}`} onPress={() => onEdit(e)} /> : null}
            <RowAction label="✕" tone="remove" a11y={`Remove ${d.label}`} onPress={() => void confirmRemove(`${d.label} (${eventWhen(s, e)})`, () => onRemove(e),
              answers.length ? 'The linked save / block / steal goes too. The score and player stats re-adjust.' : undefined)} />
          </View>
        );
      }) : null}
    </View>
  );
}

/* ------------------------------- live views -------------------------------- */

const LiveClock: NonNullable<SportPlugin<HandballState>['LiveClock']> = ({ state }) => {
  const s = state as HandballState;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running(s)) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.clock?.since, s.ended]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = Date.now();
  const so = soScore(s);
  const label = s.ended ? (s.shootout ? `FT · 7m ${so.home}–${so.away}` : s.etRounds ? 'FT (AET)' : 'FT')
    : !periodStarted(s) ? (s.period === 1 ? '—' : `${periodName(s, s.period)} next`) : `${periodName(s, s.period)} ${clockFace(s, now)}`;
  const live = s.ended ? null : handballLiveField(s, now);
  return (
    <View style={{ alignItems: 'center', gap: theme.spacing(1), flex: 1, minWidth: 0 }}>
      <View style={c.clockRow2}>
        <View style={[c.dot, { backgroundColor: running(s) ? theme.colors.danger : theme.colors.textMuted }]} />
        <Text style={c.clockSmall}>{label}</Text>
      </View>
      {live ? (
        <View style={{ alignSelf: 'stretch' }}>
          <FieldBanner suspended={live.suspended} onField={live.short.home || live.short.away ? live.onField : null} />
        </View>
      ) : null}
    </View>
  );
};

/** Goals per half (and extra time), the live half highlighted. */
const HandballScoreboard: NonNullable<SportPlugin<HandballState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live }) => {
  const s = state as HandballState;
  const n = Math.max(totalPeriods(s), s.period);
  const columns = [
    ...Array.from({ length: n }, (_, i) => ({ label: periodName(s, i + 1), highlight: !s.ended && i + 1 === s.period })),
    ...(s.shootout ? [{ label: '7m' }] : []),
  ];
  const goals = (sd: Side, p: number) => s.events.filter((e) => e.type === 'goal' && e.side === sd && e.period === p).length;
  const so = soScore(s);
  const cells = (sd: Side) => [
    ...Array.from({ length: n }, (_, i) => (i + 1 <= s.period || s.ended ? String(goals(sd, i + 1)) : '')),
    ...(s.shootout ? [String(so[sd])] : []),
  ];
  const r = result(s);
  return (
    <LineScoreboard
      live={live}
      clock={<LiveClock state={s} />}
      leadLabel="GOALS"
      columns={columns}
      winner={r && r.winner !== 'draw' ? r.winner : undefined}
      home={{ name: homeName, color: homeColor ?? theme.colors.home, lead: String(s.home), cells: cells('home') }}
      away={{ name: awayName, color: awayColor ?? theme.colors.away, lead: String(s.away), cells: cells('away') }}
    />
  );
};

const LiveExtras: NonNullable<SportPlugin<HandballState>['LiveExtras']> = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }) => {
  const s = state as HandballState;
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Text style={c.h}>Timeline</Text>
      <LiveTimeline events={handballTimeline(s)} homeColor={homeColor} awayColor={awayColor} emptyText="No goals or sanctions yet." homeRoster={homeRoster} awayRoster={awayRoster} onPlayer={onPlayer} />
      <Text style={c.h}>Match stats</Text>
      <MatchBoxScore sport="handball" source={handballBox(s, { homeRoster, awayRoster })} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} />
    </View>
  );
};

/* --------------------------------- plugin ---------------------------------- */

export const handballPlugin: SportPlugin<HandballState> = {
  id: 'handball',
  name: 'Handball',
  icon: '🤾',
  archetype: 'goal-time',
  createInitialState: init,
  reducer,
  isComplete,
  result,
  summary: (s) => {
    const so = soScore(s);
    return {
      homeScore: String(s.home),
      awayScore: String(s.away),
      statusLine: s.shootoutWinner
        ? `${s.shootoutWinner === 'home' ? 'Home' : 'Away'} win ${so.home}–${so.away} on 7-metre throws`
        : s.shootout ? `7-metre throws ${so.home}–${so.away}`
        : s.ended ? (s.etRounds ? 'Full Time (after extra time)' : 'Full Time')
        : !periodStarted(s) && s.period > 1 ? (s.period === 2 ? 'Half-time' : `End of ${periodName(s, s.period - 1)}`)
        : periodLong(s, s.period)[0].toUpperCase() + periodLong(s, s.period).slice(1),
      detailLine: s.shootout ? `7-metre throws · ${so.home}–${so.away}` : undefined,
      homeReds: s.events.filter((e) => e.type === 'card' && !e.official && (e.card === 'red' || e.third) && e.side === 'home').length,
      awayReds: s.events.filter((e) => e.type === 'card' && !e.official && (e.card === 'red' || e.third) && e.side === 'away').length,
    };
  },
  // the 7-metre shoot-out under the score ("SO 4–3"); '' for every other match
  scoreLine: handballScoreLine,
  statTotals: handballTotals,
  tickerDetail: handballTickerDetail,
  tickerFlash: handballTickerFlash,
  ScoringControls,
  LiveClock,
  Scoreboard: HandballScoreboard,
  LiveExtras,
  formation: (perSide) => handballFormation(perSide),
  Court: HandballCourt,
  liveSettings: HANDBALL_LIVE_SETTINGS,
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'senior', onCreate: true,
      options: [
        ...Object.entries(HANDBALL_PRESETS).map(([value, p]) => ({ value, label: p.label, set: p.set })),
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'playersPerSide', label: 'Players per side (incl. keeper)', type: 'count', default: 7, min: 4, max: 7, advanced: true },
    { key: 'periodMinutes', label: 'Minutes per half', type: 'number', default: 30, min: 1, max: 45, advanced: true },
    { key: 'stopClock', label: 'Stop the clock for suspensions', type: 'toggle', default: true, advanced: true, hint: 'IHF 2:9 — the clock always stops for a team time-out' },
    {
      key: 'decider', label: 'If level at full time', type: 'choice', default: 'none',
      options: [
        { value: 'none', label: 'Draw stands (league)' },
        { value: 'et2', label: 'Extra time 2 × 5, again if level, then 7 m throws (IHF)' },
        { value: 'et', label: 'Extra time 2 × 5, then 7 m throws' },
        { value: 'shootout', label: '7 m throws straight away' },
      ],
      hint: 'a knockout match needs a winner',
    },
  ],
};

const c = StyleSheet.create({
  wrap: { gap: theme.spacing(3) },
  panel: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  row: { flexDirection: 'row', gap: theme.spacing(2), alignItems: 'flex-end' },
  flex: { flex: 1 },
  typeBtn: { flexBasis: '30%', flexGrow: 1 },
  cols: { flexDirection: 'row', gap: theme.spacing(2) },
  col: { flex: 1, gap: theme.spacing(2), minWidth: 0 },
  team: { fontSize: theme.font.small, fontWeight: '800', textAlign: 'center' },
  h: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800', flexShrink: 1 },
  small: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  done: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '800' },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  clock: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '900', fontVariant: ['tabular-nums'] },
  clockRow2: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  clockSmall: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '900', fontVariant: ['tabular-nums'] },
  dot: { width: 9, height: 9, borderRadius: 5 },
  gk: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', textAlign: 'center' },
  short: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '800', textAlign: 'center' },
  flowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  cancel: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  pchip: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceAlt, maxWidth: '100%' },
  pnum: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  pname: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', flexShrink: 1 },
  skip: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: 'transparent' },
  skipTxt: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  soRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  soTeam: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', width: 110 },
  soDots: { color: theme.colors.text, fontSize: theme.font.body, letterSpacing: 1, flex: 1 },
  stopped: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), padding: theme.spacing(2), borderRadius: theme.radius.sm, backgroundColor: theme.colors.accent + '22', borderWidth: 1, borderColor: theme.colors.accent },
  stoppedTxt: { flex: 1, color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  editWhen: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '800', width: 64 },
  editLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
});
