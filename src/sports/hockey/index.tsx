/**
 * Hockey plugin (FIH) — SD-101. Archetype: goal / time, on a STOPPABLE game
 * clock (quarters by default). The pure rules live in ./engine.ts; the field
 * tracker, statTotals and box score in ./totals.ts / ./box.ts.
 *
 * The scorer's panel: the clock (start / stop / end the period / set it), then
 * per side Goal (field / PC / stroke, scorer + assist), Penalty corner, Shot,
 * Stroke, Card (green 2′ / yellow 5′ or 10′ / red) and Sub; the keeper is
 * picked from the line-up (GK slot) or changed by hand. Every event carries
 * its game-clock second, so a card's suspension counts down on playing time
 * and the player is back by himself. A level match with a shoot-out decider
 * goes to the FIH shoot-out (5 each, then sudden death, order reversed).
 *
 * Corrections: "Correct the timeline" removes or re-enters a past moment
 * (REMOVE_EVENT with the reversed credits, then the same flow stamped at the
 * original time); after the match the generic #05 list re-credits or removes
 * rows (the reducer reads the scorer from `attribution`, so totals follow).
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
  init, reducer, isComplete, result, matchSec, periodSec, clockFace, periodName, periodLong, periodStarted, running,
  eventCredits, creditAttribution, currentKeeper, soScore, nextShooter, hockeyScoreLine, HOCKEY_PRESETS, HOCKEY_LIVE_SETTINGS,
  type CardColour, type GoalType, type HockeyEvent, type HockeyState, type Side,
} from './engine';
import { hockeyTotals, hockeyLiveField, hockeyField, unavailable } from './totals';
import { hockeyBox } from './box';
import { hockeyTimeline, describeEvent, eventWhen, timelineEvents, GOAL_LABEL } from './timeline';
import { hockeyTickerDetail, hockeyTickerFlash } from './ticker';
import { hockeyFormation, HockeyPitch } from './pitch';
import { usePendingEdit } from '../usePendingEdit';
import { RowAction, confirmRemove } from '../TimelineControls';

const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const isKeeperPos = (p?: string | null) => !!p && /^\s*(gk|goal\s*-?\s*keeper|keeper)\s*$/i.test(p);
const TRACKED = ['goals', 'fieldGoals', 'pcGoals', 'strokeGoals', 'strokesMissed', 'assists', 'shots', 'shotsOnGoal', 'saves', 'greenCards', 'yellowCards', 'redCards', 'cleanSheets'];

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
  | { mode: 'goal'; side: Side; step: 'type' | 'scorer' | 'assist'; goalType?: GoalType; scorer?: Player | null }
  | { mode: 'shot'; side: Side; step: 'result' | 'player'; onGoal?: boolean }
  | { mode: 'stroke'; side: Side; step: 'result' | 'player'; outcome?: 'saved' | 'missed' }
  | { mode: 'card'; side: Side; step: 'colour' | 'player'; card?: CardColour; minutes?: number }
  | { mode: 'sub'; side: Side; step: 'off' | 'on'; off?: Player }
  | { mode: 'gk'; side: Side };

/* -------------------------------- controls --------------------------------- */

const ScoringControls: SportPlugin<HockeyState>['ScoringControls'] = ({
  state: liveState, dispatch: rawDispatch, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [], homeLineup = [], awayLineup = [],
}) => {
  // SD-114: Edit holds the removal until the re-entry commits (Cancel keeps the
  // event); `s` is the view as if it were removed. See usePendingEdit.
  const { view: s, dispatch, begin: holdRemoval, cancel: dropHeldRemoval } = usePendingEdit(liveState, rawDispatch, reducer);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [pcOpen, setPcOpen] = useState<Side | null>(null);
  const [editAt, setEditAt] = useState<{ sec: number; period: number } | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [clockText, setClockText] = useState('');
  const [setting, setSetting] = useState(false);
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
    rosterOf(sd).find((p) => (id && p.id === id) || (!id && nm && p.fullName === nm)) ?? (id ? { id, fullName: nm ?? 'Player', sports: ['hockey'] } as Player : undefined);

  // stamp every event with its game-clock second (or the edited moment's)
  const fire = (a: ScoreAction) => {
    const at = Date.now();
    dispatch({ ...a, payload: { ...a.payload, uid: (a.payload?.uid as string | undefined) ?? uid(), at, sec: editAt?.sec ?? matchSec(s, at), period: editAt?.period ?? s.period, ...(editAt ? { edit: true } : {}) } });
  };

  /* ---- who is on the field ---- */
  const stampOf = (sd: Side) => {
    const roster = rosterOf(sd);
    const slots = lineupOf(sd).filter((sl) => sl.playerId);
    const players = slots.map((sl) => ({ id: sl.playerId!, name: roster.find((p) => p.id === sl.playerId)?.fullName ?? sl.playerName ?? '' }));
    const gkSlot = slots.find((sl) => sl.position === 'GK');
    const gkP = gkSlot ? players.find((p) => p.id === gkSlot.playerId)
      : roster.filter((p) => isKeeperPos(p.sportDetails?.hockey?.position)).map((p) => ({ id: p.id, name: p.fullName })).find((k) => !players.length || players.some((x) => x.id === k.id));
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
  const onField = (sd: Side): Player[] => {
    const roster = rosterOf(sd);
    const gone = (p: Player) => out[sd].has(p.id) || out[sd].has(p.fullName);
    if (s.xi?.[sd]?.players?.length) {
      return hockeyField(s, matchSec(s, now) / 60).onField[sd].map((f) => byId(sd, f.id, f.name)).filter((p): p is Player => !!p);
    }
    const lu = lineupOf(sd).filter((sl) => sl.playerId).map((sl) => byId(sd, sl.playerId, sl.playerName)).filter((p): p is Player => !!p);
    return (lu.length ? lu : roster).filter((p) => !gone(p));
  };
  const bench = (sd: Side): Player[] => {
    const on = new Set(onField(sd).map((p) => p.id));
    return rosterOf(sd).filter((p) => !on.has(p.id) && !out[sd].has(p.id) && !out[sd].has(p.fullName));
  };
  const keeper = (sd: Side) => {
    const k = currentKeeper(s, sd);
    return k?.id ? byId(sd, k.id, k.name) : undefined;
  };

  /* ---- recorders ---- */
  const credit = (e: Parameters<typeof eventCredits>[0]) => {
    const cr = eventCredits(e);
    return { attribution: creditAttribution(cr.first, 1, TRACKED), attribution2: creditAttribution(cr.second, 1, TRACKED) };
  };
  const goal = (sd: Side, goalType: GoalType, scorer: Player | null, assist: Player | null) => {
    fire({ type: 'GOAL', side: sd, payload: { goalType }, ...credit({ type: 'goal', goalType, playerId: scorer?.id, playerName: scorer?.fullName, secondId: assist?.id, secondName: assist?.fullName }) });
    setFlow(null); setPcOpen(null);
  };
  // the keeper's save: its own action on the keeper's side, linked to the shot
  const save = (keeperSide: Side, ref: string) => {
    const gk = keeper(keeperSide);
    fire({ type: 'SAVE', side: keeperSide, payload: { ref }, ...credit({ type: 'save', playerId: gk?.id, playerName: gk?.fullName }) });
  };
  const shot = (sd: Side, onGoal: boolean, p: Player | null) => {
    const id = uid();
    fire({ type: 'SHOT', side: sd, payload: { onGoal, uid: id }, ...credit({ type: 'shot', onGoal, playerId: p?.id, playerName: p?.fullName }) });
    if (onGoal) save(opp(sd), id);
    setFlow(null);
  };
  const stroke = (sd: Side, outcome: 'saved' | 'missed', p: Player | null) => {
    const id = uid();
    fire({ type: 'STROKE', side: sd, payload: { outcome, uid: id }, ...credit({ type: 'stroke', outcome, playerId: p?.id, playerName: p?.fullName }) });
    if (outcome === 'saved') save(opp(sd), id);
    setFlow(null);
  };
  const card = (sd: Side, colour: CardColour, minutes: number | undefined, p: Player | null) => {
    fire({ type: 'CARD', side: sd, payload: { card: colour, ...(minutes ? { minutes } : {}) }, ...credit({ type: 'card', card: colour, playerId: p?.id, playerName: p?.fullName }) });
    setFlow(null);
  };
  const sub = (sd: Side, off: Player, on: Player) => {
    fire({ type: 'SUB', side: sd, payload: { offId: off.id, offName: off.fullName, onId: on.id, onName: on.fullName } });
    setFlow(null);
  };
  const setKeeper = (sd: Side, p: Player) => {
    fire({ type: 'GK', side: sd, payload: { id: p.id, name: p.fullName } });
    setFlow(null);
  };

  /* ---- correct the timeline ---- */
  const removalActions = (e: HockeyEvent): ScoreAction[] => {
    const cr = eventCredits(e);
    return [
      { type: 'REMOVE_EVENT', side: e.side, payload: { id: e.id }, attribution: creditAttribution(cr.first, -1), attribution2: creditAttribution(cr.second, -1) },
      // a shot / stroke takes its keeper's save with it (the save's own side)
      ...s.events.filter((x) => x.type === 'save' && x.ref === e.id).flatMap(removalActions),
    ];
  };
  const remove = (e: HockeyEvent) => { for (const a of removalActions(e)) dispatch(a); };
  // SD-114: held until the re-entry commits — Cancel keeps the event as it was.
  const edit = (e: HockeyEvent) => {
    if (e.type === 'pc' || e.type === 'save') { remove(e); return; }
    holdRemoval(removalActions(e));
    setEditAt({ sec: e.sec, period: e.period });
    setShowEdit(false);
    if (e.type === 'goal') setFlow({ mode: 'goal', side: e.side, step: 'type' });
    else if (e.type === 'shot') setFlow({ mode: 'shot', side: e.side, step: 'result' });
    else if (e.type === 'stroke') setFlow({ mode: 'stroke', side: e.side, step: 'result' });
    else if (e.type === 'card') setFlow({ mode: 'card', side: e.side, step: 'colour' });
    else if (e.type === 'sub') setFlow({ mode: 'sub', side: e.side, step: 'off' });
    else if (e.type === 'gk') setFlow({ mode: 'gk', side: e.side });
  };

  /* ---- clock ---- */
  const startStop = () => {
    const at = Date.now();
    if (running(s)) { dispatch({ type: 'CLOCK', payload: { run: false, at } }); return; }
    if (s.period === 1 && !periodStarted(s)) stampXi();
    dispatch({ type: 'CLOCK', payload: { run: true, at } });
  };
  const last = s.period >= s.periods;
  // SD-106: ending a quarter / full time asks first (ConfirmSheet).
  const endPeriod = async () => {
    if (!periodStarted(s)) return; // SD-116 (H1): a period that hasn't started can't end
    const score = `${s.home}-${s.away}`;
    const ok = last ? await confirmMatchAction('fullTime', { score }) : await confirmMatchAction('endPeriod', { period: periodName(s, s.period), score });
    if (!ok) return;
    if (last) stampXi();
    dispatch({ type: 'END_PERIOD', payload: { at: Date.now() } });
  };
  const applyClock = () => {
    const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(clockText.trim());
    if (!m) return;
    const left = Number(m[1]) * 60 + Number(m[2] ?? 0);
    dispatch({ type: 'SET_CLOCK', payload: { periodSec: s.periodMinutes * 60 - left, at: Date.now() } });
    setSetting(false); setClockText('');
  };

  /* ---- shoot-out ---- */
  const level = s.home === s.away;
  if (s.ended) {
    if (s.shootout) {
      const sc = soScore(s);
      const nextSide = nextShooter(s.shootout);
      const n = s.shootout[nextSide].length + 1;
      return (
        <View style={c.wrap}>
          <View style={c.panel}>
            <Text style={c.h}>🏑 Shoot-out · {sc.home}–{sc.away}</Text>
            {(['home', 'away'] as const).map((sd) => (
              <View key={sd} style={c.soRow}>
                <Text style={c.soTeam} numberOfLines={1}>{name(sd)}</Text>
                <Text style={c.soDots}>{s.shootout![sd].map((k) => (k.scored ? '●' : '○')).join(' ') || '–'}</Text>
              </View>
            ))}
            {s.shootoutWinner ? (
              <Text style={c.done}>{name(s.shootoutWinner)} win the shoot-out {sc.home}–{sc.away}</Text>
            ) : (
              <>
                <Text style={c.meta}>
                  Next: {name(nextSide)} · attempt {n}{n > 5 ? ' (sudden death)' : ''} · 8-second 1 v 1 against the keeper
                </Text>
                <Text style={c.small}>Taker (optional)</Text>
                <PlayerGrid players={onField(nextSide).filter((p) => p.id !== soTaker?.id)} onPick={(p) => setSoTaker(p)} />
                {soTaker ? <Text style={c.meta}>Taker: {soTaker.fullName}</Text> : null}
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
          <Text style={c.h}>Full time · {s.home}–{s.away}</Text>
          {level && s.decider === 'shootout' ? (
            <>
              <Text style={c.meta}>Level — the match goes to a shoot-out (5 each, then sudden death). Who shoots first?</Text>
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
        <Text style={[c.h, { color: color(sd) }]} numberOfLines={1}>{t} · {name(sd)}{editAt ? ` · ${Math.max(1, Math.ceil(editAt.sec / 60))}'` : ''}</Text>
        <Text style={c.cancel} accessibilityRole="button" onPress={() => setFlow(null)}>Cancel</Text>
      </View>
    );
    switch (flow.mode) {
      case 'goal':
        if (flow.step === 'type') return (
          <View style={c.panel}>{head('Goal')}
            <View style={c.row}>
              {(['field', 'pc', 'stroke'] as const).filter((t) => t !== 'pc' || s.penaltyCorners).map((t) => (
                <Button key={t} label={t === 'field' ? 'Field goal' : t === 'pc' ? 'From PC' : 'Stroke'} variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, goalType: t, step: 'scorer' })} />
              ))}
            </View>
          </View>
        );
        if (flow.step === 'scorer') return (
          <View style={c.panel}>{head(GOAL_LABEL[flow.goalType ?? 'field'])}
            <Text style={c.small}>Who scored?</Text>
            <PlayerGrid players={onField(sd)} onPick={(p) => (flow.goalType === 'stroke' ? goal(sd, 'stroke', p, null) : setFlow({ ...flow, scorer: p, step: 'assist' }))}
              skip={{ label: 'Team goal (no scorer)', onPress: () => goal(sd, flow.goalType ?? 'field', null, null) }} />
          </View>
        );
        return (
          <View style={c.panel}>{head('Assist')}
            <PlayerGrid players={onField(sd).filter((p) => p.id !== flow.scorer?.id)} onPick={(p) => goal(sd, flow.goalType ?? 'field', flow.scorer ?? null, p)}
              skip={{ label: 'No assist', onPress: () => goal(sd, flow.goalType ?? 'field', flow.scorer ?? null, null) }} />
          </View>
        );
      case 'shot':
        if (flow.step === 'result') return (
          <View style={c.panel}>{head('Shot')}
            <View style={c.row}>
              <Button label="On goal — saved" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, onGoal: true, step: 'player' })} />
              <Button label="Off target / blocked" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, onGoal: false, step: 'player' })} />
            </View>
            {keeper(opp(sd)) ? <Text style={c.meta}>A save goes to {keeper(opp(sd))!.fullName} (keeper).</Text> : null}
          </View>
        );
        return (
          <View style={c.panel}>{head(flow.onGoal ? 'Shot on goal' : 'Shot off target')}
            <PlayerGrid players={onField(sd)} onPick={(p) => shot(sd, !!flow.onGoal, p)} skip={{ label: 'Skip player', onPress: () => shot(sd, !!flow.onGoal, null) }} />
          </View>
        );
      case 'stroke':
        if (flow.step === 'result') return (
          <View style={c.panel}>{head('Penalty stroke')}
            <View style={c.row}>
              <Button label="Scored" color={color(sd)} style={c.flex} onPress={() => setFlow({ mode: 'goal', side: sd, step: 'scorer', goalType: 'stroke' })} />
              <Button label="Saved" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, outcome: 'saved', step: 'player' })} />
              <Button label="Missed" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, outcome: 'missed', step: 'player' })} />
            </View>
          </View>
        );
        return (
          <View style={c.panel}>{head('Stroke taker')}
            <PlayerGrid players={onField(sd)} onPick={(p) => stroke(sd, flow.outcome ?? 'missed', p)} skip={{ label: 'Skip player', onPress: () => stroke(sd, flow.outcome ?? 'missed', null) }} />
          </View>
        );
      case 'card':
        if (flow.step === 'colour') return (
          <View style={c.panel}>{head('Card')}
            <View style={c.row}>
              <Button label="🟩 Green 2′" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, card: 'green', minutes: 2, step: 'player' })} />
              <Button label="🟥 Red" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, card: 'red', minutes: undefined, step: 'player' })} />
            </View>
            <View style={c.row}>
              <Button label="🟨 Yellow 5′" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, card: 'yellow', minutes: 5, step: 'player' })} />
              <Button label="🟨 Yellow 10′" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, card: 'yellow', minutes: 10, step: 'player' })} />
            </View>
            <Text style={c.meta}>Green and yellow: the player sits out that much playing time, then is back by himself. Red: off for good — the team plays a player short.</Text>
          </View>
        );
        return (
          <View style={c.panel}>{head(`${flow.card === 'green' ? 'Green' : flow.card === 'yellow' ? 'Yellow' : 'Red'} card`)}
            <PlayerGrid players={onField(sd)} onPick={(p) => card(sd, flow.card ?? 'green', flow.minutes, p)} />
          </View>
        );
      case 'sub':
        if (flow.step === 'off') return (
          <View style={c.panel}>{head('Sub — who comes off?')}
            <PlayerGrid players={onField(sd)} onPick={(p) => setFlow({ ...flow, off: p, step: 'on' })} />
          </View>
        );
        return (
          <View style={c.panel}>{head(`Sub — on for ${flow.off?.fullName ?? ''}`)}
            <PlayerGrid players={bench(sd)} onPick={(p) => flow.off && sub(sd, flow.off, p)} />
            <Text style={c.meta}>Rolling substitutions — a player who comes off may go back on later.</Text>
          </View>
        );
      case 'gk':
        return (
          <View style={c.panel}>{head('Goalkeeper')}
            <PlayerGrid players={[...onField(sd), ...bench(sd)]} onPick={(p) => setKeeper(sd, p)} />
          </View>
        );
    }
  })();

  const live = hockeyLiveField(s, now);
  const sideCol = (sd: Side) => {
    const gk = keeper(sd);
    return (
      <View key={sd} style={c.col}>
        <Text style={[c.team, { color: color(sd) }]} numberOfLines={1}>{name(sd)}</Text>
        <Button label="🏑 Goal" color={color(sd)} onPress={() => setFlow({ mode: 'goal', side: sd, step: 'type' })} />
        {s.penaltyCorners ? (
          <Button label="🚩 PC" accessibilityLabel="Penalty corner" variant="ghost" onPress={() => { fire({ type: 'PC', side: sd }); setPcOpen(sd); }} />
        ) : null}
        <Button label="🎯 Shot" variant="ghost" onPress={() => setFlow({ mode: 'shot', side: sd, step: 'result' })} />
        <Button label="⚪ Stroke" variant="ghost" onPress={() => setFlow({ mode: 'stroke', side: sd, step: 'result' })} />
        <Button label="🟨 Card" variant="ghost" onPress={() => setFlow({ mode: 'card', side: sd, step: 'colour' })} />
        <Button label="🔁 Sub" variant="ghost" onPress={() => setFlow({ mode: 'sub', side: sd, step: 'off' })} />
        <Text style={c.gk} accessibilityRole="button" onPress={() => setFlow({ mode: 'gk', side: sd })} numberOfLines={2}>
          🧤 {gk ? gk.fullName : 'Set keeper'} ›
        </Text>
        {live.short[sd] > 0 ? <Text style={c.short}>Playing {live.short[sd]} short</Text> : null}
      </View>
    );
  };

  return (
    <View style={c.wrap}>
      {/* the game clock */}
      <View style={c.panel}>
        <View style={c.clockRow}>
          <View style={{ flex: 1 }}>
            <Text style={c.small}>{periodLong(s, s.period)}{s.stopClock ? ' · clock stops on goals & PCs' : ''}</Text>
            <Text style={c.clock}>{clockFace(s, now)}</Text>
          </View>
          <Button label={running(s) ? '⏸ Stop' : periodStarted(s) ? '▶ Resume' : s.period === 1 ? '▶ Push back' : `▶ Start ${periodName(s, s.period)}`} variant={running(s) ? 'ghost' : 'primary'} onPress={startStop} />
        </View>
        <View style={c.row}>
          {/* the last period's Full time sits at the bottom of the controls (SD-106) */}
          {!last ? <Button label={`⏭ End ${periodName(s, s.period)}`} variant="ghost" style={c.flex}
            disabled={!periodStarted(s)} onPress={() => void endPeriod()} /> : null}
          <Button label="⏱ Set clock" variant="ghost" style={c.flex} onPress={() => setSetting((v) => !v)} />
        </View>
        {setting ? (
          <View style={c.row}>
            <View style={c.flex}><TextField label="Time left (mm:ss)" value={clockText} onChange={setClockText} placeholder={clockFace(s, now)} /></View>
            <Button label="Set" onPress={applyClock} />
          </View>
        ) : null}
        {/* (the suspension banner sits in the board above, with the clock) */}
        {periodSec(s, now) >= s.periodMinutes * 60 && running(s) ? <Text style={c.short}>Time is up — finish any penalty corner, then end the {s.periods === 4 ? 'quarter' : 'period'}.</Text> : null}
      </View>

      {pcOpen && !flow ? (
        <View style={c.panel}>
          <Text style={[c.h, { color: color(pcOpen) }]}>🚩 Penalty corner · {name(pcOpen)}</Text>
          <View style={c.row}>
            <Button label="🏑 PC goal" color={color(pcOpen)} style={c.flex} onPress={() => setFlow({ mode: 'goal', side: pcOpen, step: 'scorer', goalType: 'pc' })} />
            <Button label="🎯 Shot" variant="ghost" style={c.flex} onPress={() => { const sd = pcOpen; setPcOpen(null); setFlow({ mode: 'shot', side: sd, step: 'result' }); }} />
            <Button label="No goal" variant="ghost" style={c.flex} onPress={() => setPcOpen(null)} />
          </View>
        </View>
      ) : null}

      {flowPanel ?? (
        <View style={c.cols}>{sideCol('home')}{sideCol('away')}</View>
      )}

      <EditList s={s} show={showEdit} setShow={setShowEdit} onRemove={remove} onEdit={edit} homeName={homeName} awayName={awayName} />
      {/* SD-116 (H1): not live during the break before the last period — it
          would credit a whole unplayed half / quarter */}
      {last ? <Button label="🏁 Full time" variant="danger" disabled={!periodStarted(s)} onPress={() => void endPeriod()} /> : null}
      {last && !periodStarted(s) ? <Text style={c.gk}>Start {periodName(s, s.period)} first — Full time unlocks once it’s under way.</Text> : null}
    </View>
  );
};

/** The scorer's "Correct the timeline" list: remove a moment, or re-enter it. */
function EditList({ s, show, setShow, onRemove, onEdit, homeName, awayName }: {
  s: HockeyState; show: boolean; setShow: (v: boolean) => void; onRemove: (e: HockeyEvent) => void; onEdit?: (e: HockeyEvent) => void; homeName: string; awayName: string;
}) {
  if (!s.events.length) return null;
  return (
    <View style={c.panel}>
      <Text style={c.link} accessibilityRole="button" onPress={() => setShow(!show)}>{show ? 'Hide' : '✎ Correct the timeline'}</Text>
      {show ? [...timelineEvents(s)].reverse().slice(0, 40).map(({ e, saver }) => {
        const d = describeEvent(e, saver);
        return (
          <View key={e.id} style={c.editRow}>
            <Text style={c.editWhen}>{eventWhen(s, e)}</Text>
            <Text style={c.editLabel} numberOfLines={2}>{d.icon} {d.label} · {e.side === 'home' ? homeName : awayName}{d.detail ? ` · ${d.detail}` : ''}</Text>
            {onEdit && e.type !== 'pc' && e.type !== 'save' ? <RowAction label="✎ Edit" tone="edit" a11y={`Edit ${d.label}`} onPress={() => onEdit(e)} /> : null}
            <RowAction label="✕" tone="remove" a11y={`Remove ${d.label}`} onPress={() => void confirmRemove(`${d.label} (${eventWhen(s, e)})`, () => onRemove(e),
              s.events.some((x) => x.type === 'save' && x.ref === e.id) ? 'The keeper\'s save on it goes too. The score and player stats re-adjust.' : undefined)} />
          </View>
        );
      }) : null}
    </View>
  );
}

/* ------------------------------- live views -------------------------------- */

const LiveClock: NonNullable<SportPlugin<HockeyState>['LiveClock']> = ({ state }) => {
  const s = state as HockeyState;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running(s)) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.clock?.since, s.ended]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = Date.now();
  const so = soScore(s);
  const label = s.ended ? (s.shootout ? `FT · SO ${so.home}–${so.away}` : 'FT') : !periodStarted(s) ? (s.period === 1 ? '—' : `${periodName(s, s.period)} next`) : `${periodName(s, s.period)} ${clockFace(s, now)}`;
  const live = s.ended ? null : hockeyLiveField(s, now);
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

/** Goals per quarter / half, the live period highlighted. */
const HockeyScoreboard: NonNullable<SportPlugin<HockeyState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live }) => {
  const s = state as HockeyState;
  const n = Math.max(s.periods, s.period);
  const columns = [
    ...Array.from({ length: n }, (_, i) => ({ label: periodName(s, i + 1), highlight: !s.ended && i + 1 === s.period })),
    ...(s.shootout ? [{ label: 'SO' }] : []),
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

const LiveExtras: NonNullable<SportPlugin<HockeyState>['LiveExtras']> = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }) => {
  const s = state as HockeyState;
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Text style={c.h}>Timeline</Text>
      <LiveTimeline events={hockeyTimeline(s)} homeColor={homeColor} awayColor={awayColor} emptyText="No goals or cards yet." homeRoster={homeRoster} awayRoster={awayRoster} onPlayer={onPlayer} />
      <Text style={c.h}>Match stats</Text>
      <MatchBoxScore sport="hockey" source={hockeyBox(s, { homeRoster, awayRoster })} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} />
    </View>
  );
};

/* --------------------------------- plugin ---------------------------------- */

export const hockeyPlugin: SportPlugin<HockeyState> = {
  id: 'hockey',
  name: 'Hockey',
  icon: '🏑',
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
        ? `${s.shootoutWinner === 'home' ? 'Home' : 'Away'} win ${so.home}–${so.away} in the shoot-out`
        : s.shootout ? `Shoot-out ${so.home}–${so.away}`
        : s.ended ? 'Full Time'
        : !periodStarted(s) && s.period > 1 ? `End of ${periodName(s, s.period - 1)}`
        : periodLong(s, s.period)[0].toUpperCase() + periodLong(s, s.period).slice(1),
      detailLine: s.shootout ? `Shoot-out · ${so.home}–${so.away}` : undefined,
      homeReds: s.events.filter((e) => e.type === 'card' && e.card === 'red' && e.side === 'home').length,
      awayReds: s.events.filter((e) => e.type === 'card' && e.card === 'red' && e.side === 'away').length,
    };
  },
  // the shoot-out result under the score ("SO 4–3"); '' for every other match
  scoreLine: hockeyScoreLine,
  statTotals: hockeyTotals,
  tickerDetail: hockeyTickerDetail,
  tickerFlash: hockeyTickerFlash,
  ScoringControls,
  LiveClock,
  Scoreboard: HockeyScoreboard,
  LiveExtras,
  formation: (perSide) => hockeyFormation(perSide),
  Court: HockeyPitch,
  liveSettings: HOCKEY_LIVE_SETTINGS,
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'fih', onCreate: true,
      options: [
        ...Object.entries(HOCKEY_PRESETS).map(([value, p]) => ({ value, label: p.label, set: p.set })),
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'playersPerSide', label: 'Players per side', type: 'count', default: 11, min: 4, max: 11, advanced: true },
    { key: 'periods', label: 'Periods', type: 'choice', default: 4, advanced: true, options: [{ value: 4, label: '4 quarters' }, { value: 2, label: '2 halves' }] },
    { key: 'periodMinutes', label: 'Minutes per period', type: 'number', default: 15, min: 1, max: 45, advanced: true },
    { key: 'stopClock', label: 'Stop the clock for goals & penalty corners', type: 'toggle', default: true, advanced: true, hint: 'as international matches do; you restart it' },
    { key: 'penaltyCorners', label: 'Penalty corners', type: 'toggle', default: true, advanced: true, hint: 'off for Hockey5s' },
    {
      key: 'decider', label: 'If level at full time', type: 'choice', default: 'none',
      options: [
        { value: 'none', label: 'Draw stands' },
        { value: 'shootout', label: 'Shoot-out (5 each, then sudden death)' },
      ],
      hint: 'always a shoot-out in a tournament on “FIH + shoot-out bonus”',
    },
  ],
};

const c = StyleSheet.create({
  wrap: { gap: theme.spacing(3) },
  panel: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  row: { flexDirection: 'row', gap: theme.spacing(2), alignItems: 'flex-end' },
  flex: { flex: 1 },
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
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  editWhen: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '800', width: 56 },
  editLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
});
