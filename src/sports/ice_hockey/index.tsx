/**
 * Ice hockey plugin (IIHF; NHL / US high-school / youth presets) — SD-145.
 * Archetype: goal / time on a stoppable game clock (3 periods, counting down).
 * The pure rules live in ./engine.ts; statTotals in ./totals.ts, the box score
 * in ./box.ts, the timeline in ./timeline.ts.
 *
 * The scorer's panel: the clock (start / stop at every whistle, end the period,
 * set it) with the penalty box under it (who is serving, time left, 5 v 4),
 * then per side Goal (scorer, up to two assists; power play / short-handed /
 * empty net pre-filled from the penalties and the net, changeable; optional
 * +/- on-ice picks), Shot (on goal — the other goalie's save), Penalty (kind,
 * infraction, player), Penalty shot, Pull goalie / Goalie back, Time-out, and
 * the goalie in net. A level game goes to overtime (sudden death) and / or a
 * shoot-out as the decider says; the scorer picks who shoots first.
 *
 * Corrections: "Correct the timeline" removes or re-enters a past moment
 * (REMOVE_EVENT with the reversed credits — a second assist's own reversal
 * rides on a STAT_ADJUST — then the same flow stamped at the original time,
 * SD-114: Cancel keeps the event).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { ensureContrast } from '../../core/contrast';
import { Button, TextField } from '../../components/ui';
import { confirmMatchAction } from '../../components/ConfirmSheet';
import { LineScoreboard } from '../../components/LineScoreboard';
import { MatchBoxScore } from '../../components/BoxScore';
import { FieldBanner } from '../FieldBanner';
import { LiveTimeline } from '../LiveTimeline';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';
import {
  init, reducer, isComplete, result, levelAtEnd, aggLine, matchSec, periodSec, periodLen, clockFace, mmss, periodName, periodLong,
  periodStarted, running, eventCredits, creditAttribution, goalFlagsNow, goalieAt, goalieOf, netEmpty, penaltyBox, partEnd, skatersOn, baseSkaters,
  soScore, nextShooter, needsSdPick, iceHockeyScoreLine, timeoutLeft, totalPeriods, nextIsOvertime, eventWhen, standingsUnits, ejects,
  ICE_HOCKEY_PRESETS, ICE_HOCKEY_LIVE_SETTINGS, PEN_LABEL, INFRACTIONS, STRENGTH_LABEL, LIVE_KEYS,
  type IceEvent, type IceHockeyState, type PenKind, type Side, type Strength,
} from './engine';
import { iceHockeyTotals } from './totals';
import { iceHockeyBox } from './box';
import { iceHockeyTimeline, describeEvent, goalTags } from './timeline';
import { iceHockeyTickerDetail, iceHockeyTickerFlash } from './ticker';
import { iceHockeyFormation, IceRink } from './rink';
import { iceHockeyVoice, iceHockeyVoiceEnds } from './voice';
import { usePendingEdit } from '../usePendingEdit';
import { BackfillBar, RowAction, confirmRemove } from '../TimelineControls';

const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const isGoaliePos = (p?: string | null) => !!p && /^\s*(g|gk|goalie|goaltender|goal\s*-?\s*keeper|netminder)\s*$/i.test(p);
const TRACKED: string[] = LIVE_KEYS.filter((k) => k !== 'soTaken' && k !== 'soGoals');
const PEN_MENU: PenKind[] = ['minor', 'double', 'major', 'majorGm', 'misconduct', 'gm', 'match', 'bench'];

/* ------------------------------ player picker ------------------------------ */

function PlayerGrid({ players, onPick, skip, picked }: { players: Player[]; onPick: (p: Player) => void; skip?: { label: string; onPress: () => void }; picked?: Set<string> }) {
  return (
    <View style={c.grid}>
      {players.map((p) => {
        const on = picked?.has(p.id);
        return (
          <TouchableOpacity key={p.id} style={[c.pchip, on ? c.pchipOn : null]} activeOpacity={0.75} accessibilityRole="button"
            accessibilityState={picked ? { selected: !!on } : undefined} accessibilityLabel={p.fullName} onPress={() => onPick(p)}>
            <Text style={c.pnum}>{p.jerseyNo ?? '–'}</Text>
            <Text style={[c.pname, on ? c.pnameOn : null]} numberOfLines={1}>{p.fullName}</Text>
          </TouchableOpacity>
        );
      })}
      {players.length === 0 ? <Text style={c.meta}>No players listed — use the button below.</Text> : null}
      {skip ? (
        <TouchableOpacity style={[c.pchip, c.skip]} activeOpacity={0.75} accessibilityRole="button" onPress={skip.onPress}>
          <Text style={c.skipTxt}>{skip.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function Chip({ label, on, onPress, a11y }: { label: string; on: boolean; onPress: () => void; a11y?: string }) {
  return (
    <TouchableOpacity style={[c.chip, on ? c.chipOn : null]} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={a11y ?? label}>
      <Text style={[c.chipTxt, on ? c.chipTxtOn : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

type GoalDraft = { strength: Strength; en: boolean; scorer?: Player | null; a1?: Player | null };
type Flow =
  | { mode: 'goal'; side: Side; step: 'scorer' | 'a1' | 'a2' | 'onice'; d: GoalDraft; a2?: Player | null }
  | { mode: 'shot'; side: Side }
  | { mode: 'pen'; side: Side; step: 'kind' | 'infraction' | 'player'; pen?: PenKind; infraction?: string }
  | { mode: 'ps'; side: Side; step: 'result' | 'player'; res?: 'saved' | 'missed' }
  | { mode: 'gk'; side: Side };

/* -------------------------------- controls --------------------------------- */

const ScoringControls: SportPlugin<IceHockeyState>['ScoringControls'] = ({
  state: liveState, dispatch: rawDispatch, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [], homeLineup = [], awayLineup = [],
}) => {
  const { view: s, dispatch, begin: holdRemoval, cancel: dropHeldRemoval } = usePendingEdit(liveState, rawDispatch, reducer);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [editAt, setEditAt] = useState<{ sec: number; period: number } | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [clockInput, setClockInput] = useState('');
  const [setting, setSetting] = useState(false);
  const [soTaker, setSoTaker] = useState<Player | null>(null);
  const [onIce, setOnIce] = useState<{ home: Set<string>; away: Set<string> }>({ home: new Set(), away: new Set() });
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running(s)) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.clock.since, s.ended]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (flow === null && editAt) { setEditAt(null); dropHeldRemoval(); } }, [flow]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = Date.now();
  const nowSec = editAt?.sec ?? matchSec(s, now);
  const name = (sd: Side) => (sd === 'home' ? homeName : awayName);
  const color = (sd: Side) => (sd === 'home' ? homeColor ?? theme.colors.home : awayColor ?? theme.colors.away);
  /** a team colour as TEXT on the panel (SD-155: ≥ 4.5:1) */
  const ink = (sd: Side) => ensureContrast(color(sd), theme.colors.surface);
  const rosterOf = (sd: Side) => (sd === 'home' ? homeRoster : awayRoster);
  const lineupOf = (sd: Side) => (sd === 'home' ? homeLineup : awayLineup);
  const byId = (sd: Side, id?: string, nm?: string): Player | undefined =>
    rosterOf(sd).find((p) => (id && p.id === id) || (!id && nm && p.fullName === nm)) ?? (id ? { id, fullName: nm ?? 'Player', sports: ['ice_hockey'] } as Player : undefined);

  // stamp every event with its game-clock second (or the edited moment's)
  const fire = (a: ScoreAction) => {
    const at = Date.now();
    dispatch({ ...a, payload: { ...a.payload, uid: (a.payload?.uid as string | undefined) ?? uid(), at, sec: editAt?.sec ?? matchSec(s, at), period: editAt?.period ?? s.period, ...(editAt ? { edit: true } : {}) } });
  };

  /* ---- who is dressed / in the box ---- */
  const stampOf = (sd: Side) => {
    const roster = rosterOf(sd);
    const slots = lineupOf(sd).filter((sl) => sl.playerId);
    const players = slots.map((sl) => ({ id: sl.playerId!, name: roster.find((p) => p.id === sl.playerId)?.fullName ?? sl.playerName ?? '' }));
    const gSlot = slots.find((sl) => isGoaliePos(sl.position));
    const gkP = gSlot ? players.find((p) => p.id === gSlot.playerId)
      : roster.filter((p) => isGoaliePos(p.sportDetails?.ice_hockey?.position)).map((p) => ({ id: p.id, name: p.fullName })).find((k) => !players.length || players.some((x) => x.id === k.id));
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
  const box = penaltyBox(s, nowSec);
  const out = (sd: Side) => new Set(box.ejected.filter((x) => x.side === sd).flatMap((x) => [x.who.id, x.who.name].filter(Boolean) as string[]));
  const inBox = (sd: Side) => new Set([...box.running[sd], ...box.waiting[sd]].flatMap((p) => [p.who.id, p.who.name].filter(Boolean) as string[])
    .concat(box.misconduct.filter((m) => m.side === sd).flatMap((m) => [m.who.id, m.who.name].filter(Boolean) as string[])));
  /** the dressed players still in the game (ejected out) */
  const dressed = (sd: Side): Player[] => {
    const gone = out(sd);
    const lu = (s.xi?.[sd]?.players?.length ? [] : lineupOf(sd).filter((sl) => sl.playerId).map((sl) => byId(sd, sl.playerId, sl.playerName)).filter((p): p is Player => !!p));
    const base = rosterOf(sd).length ? rosterOf(sd) : lu;
    return base.filter((p) => !gone.has(p.id) && !gone.has(p.fullName));
  };
  /** who can be on the ice now (not in the box) */
  const skatersOf = (sd: Side): Player[] => {
    const b = inBox(sd);
    const g = goalieOf(s, sd);
    // the side's goalie isn't offered as a scorer / shooter (a goalie goal: ✎ Edit afterwards)
    return dressed(sd).filter((p) => !b.has(p.id) && !b.has(p.fullName) && !(g?.id && p.id === g.id));
  };
  const goalie = (sd: Side) => { const g = goalieAt(s, sd); return g?.id ? byId(sd, g.id, g.name) : undefined; };
  const theGoalie = (sd: Side) => { const g = goalieOf(s, sd); return g?.id ? byId(sd, g.id, g.name) : undefined; };

  /* ---- recorders ---- */
  const credit = (e: Parameters<typeof eventCredits>[0]) => {
    const cr = eventCredits(e, s.pimScale);
    return { attribution: creditAttribution(cr.first, 1, TRACKED), attribution2: creditAttribution(cr.second, 1, TRACKED), third: creditAttribution(cr.third, 1, TRACKED) };
  };
  const goal = (sd: Side, d: GoalDraft, a2: Player | null, ice?: { home: string[]; away: string[] }) => {
    const id = uid();
    const cr = credit({ type: 'goal', side: sd, playerId: d.scorer?.id, playerName: d.scorer?.fullName, secondId: d.a1?.id, secondName: d.a1?.fullName, strength: d.strength, en: d.en });
    fire({ type: 'GOAL', side: sd, payload: { uid: id, strength: d.strength, ...(d.en ? { en: true } : {}), ...(ice ? { onIce: ice } : {}) }, attribution: cr.attribution, attribution2: cr.attribution2 });
    if (a2) {
      const c3 = credit({ type: 'goal', side: sd, thirdId: a2.id, thirdName: a2.fullName }).third;
      fire({ type: 'ASSIST2', side: sd, payload: { ref: id }, attribution: c3 });
    }
    setFlow(null);
  };
  const shot = (sd: Side, p: Player | null, ps = false) => {
    const gk = goalie(opp(sd));
    const cr = credit({ type: 'shot', side: sd, playerId: p?.id, playerName: p?.fullName, gkId: gk?.id, gkName: gk?.fullName });
    fire({ type: 'SHOT', side: sd, payload: ps ? { ps: true } : {}, attribution: cr.attribution, attribution2: cr.attribution2 });
    setFlow(null);
  };
  const psGoal = (sd: Side, p: Player | null) => {
    const cr = credit({ type: 'goal', side: sd, playerId: p?.id, playerName: p?.fullName, ps: true, en: netEmpty(s, opp(sd)) });
    fire({ type: 'GOAL', side: sd, payload: { ps: true, ...(netEmpty(s, opp(sd)) ? { en: true } : {}) }, attribution: cr.attribution });
    setFlow(null);
  };
  const psMiss = (sd: Side, p: Player | null) => { fire({ type: 'MISS', side: sd, payload: p ? { playerId: p.id, playerName: p.fullName } : {} }); setFlow(null); };
  const penalty = (sd: Side, pen: PenKind, infraction: string | undefined, p: Player | null) => {
    const cr = credit({ type: 'pen', side: sd, pen, playerId: p?.id, playerName: p?.fullName });
    fire({ type: 'PEN', side: sd, payload: { pen, ...(infraction ? { infraction } : {}), ...(!cr.attribution && p ? { playerId: p.id, playerName: p.fullName } : {}) }, attribution: cr.attribution });
    setFlow(null);
  };
  const setGoalie = (sd: Side, p: Player) => { fire({ type: 'GK', side: sd, payload: { id: p.id, name: p.fullName } }); setFlow(null); };

  const startGoal = (sd: Side) => {
    const f = goalFlagsNow(s, sd, nowSec);
    setFlow({ mode: 'goal', side: sd, step: 'scorer', d: { strength: f.strength, en: f.en } });
  };

  /* ---- correct the timeline ---- */
  const removalActions = (e: IceEvent): ScoreAction[] => {
    const cr = eventCredits(e, s.pimScale);
    return [
      { type: 'REMOVE_EVENT', side: e.side, payload: { id: e.id }, attribution: creditAttribution(cr.first, -1), attribution2: creditAttribution(cr.second, -1) },
      ...(cr.third ? [{ type: 'STAT_ADJUST', side: e.side, payload: { ref: e.id }, attribution: creditAttribution(cr.third, -1) } as ScoreAction] : []),
    ];
  };
  const remove = (e: IceEvent) => { for (const a of removalActions(e)) dispatch(a); };
  const edit = (e: IceEvent) => {
    if (e.type !== 'goal' && e.type !== 'shot' && e.type !== 'pen') { remove(e); return; }
    holdRemoval(removalActions(e));
    setEditAt({ sec: e.sec, period: e.period });
    setShowEdit(false);
    if (e.type === 'goal' && e.ps) setFlow({ mode: 'ps', side: e.side, step: 'result' });
    else if (e.type === 'goal') setFlow({ mode: 'goal', side: e.side, step: 'scorer', d: { strength: e.strength ?? 'ev', en: !!e.en } });
    else if (e.type === 'shot') setFlow(e.ps ? { mode: 'ps', side: e.side, step: 'result' } : { mode: 'shot', side: e.side });
    else setFlow({ mode: 'pen', side: e.side, step: 'kind' });
  };

  /* ---- clock ---- */
  const startStop = () => {
    const at = Date.now();
    if (running(s)) { dispatch({ type: 'CLOCK', payload: { run: false, at } }); return; }
    if (s.period === 1 && !periodStarted(s)) stampXi();
    dispatch({ type: 'CLOCK', payload: { run: true, at } });
  };
  const level = levelAtEnd(s);
  const toOt = s.period >= s.periods && nextIsOvertime(s);
  const last = s.period >= s.periods && !toOt;
  // SD-106: ending a period / the game asks first (ConfirmSheet)
  const endPeriod = async () => {
    if (!periodStarted(s)) return;
    const score = `${s.home}-${s.away}`;
    const ok = last ? await confirmMatchAction('fullTime', { score }) : await confirmMatchAction('endPeriod', { period: periodLong(s, s.period), score });
    if (!ok) return;
    if (last) stampXi();
    dispatch({ type: 'END_PERIOD', payload: { at: Date.now() } });
  };
  const applyClock = () => {
    const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(clockInput.trim());
    if (!m) return;
    // the time LEFT on the period clock (hockey counts down)
    const left = Number(m[1]) * 60 + Number(m[2] ?? 0);
    dispatch({ type: 'SET_CLOCK', payload: { periodSec: Math.max(0, Math.min(periodLen(s, s.period), periodLen(s, s.period) - left)), at: Date.now() } });
    setSetting(false); setClockInput('');
  };

  /* ---- after the final horn: the shoot-out ---- */
  if (s.ended) {
    if (s.shootout) {
      const sc = soScore(s);
      const nextSide = nextShooter(s.shootout, s.soRounds);
      const n = s.shootout[nextSide].length + 1;
      return (
        <View style={c.wrap}>
          <View style={c.panel}>
            <Text style={c.h}>🥅 Shoot-out · {sc.home}–{sc.away}</Text>
            {(['home', 'away'] as const).map((sd) => (
              <View key={sd} style={c.soRow}>
                <Text style={c.soTeam} numberOfLines={1}>{name(sd)}</Text>
                <Text style={c.soDots} accessibilityLabel={`${name(sd)}: ${s.shootout![sd].filter((k) => k.scored).length} of ${s.shootout![sd].length}`}>{s.shootout![sd].map((k) => (k.scored ? '●' : '○')).join(' ') || '–'}</Text>
              </View>
            ))}
            {s.shootoutWinner ? (
              <Text style={c.done}>{name(s.shootoutWinner)} win the shoot-out {sc.home}–{sc.away} (final {result(s)?.home}–{result(s)?.away})</Text>
            ) : needsSdPick(s) ? (
              <>
                <Text style={c.meta}>{s.soRounds} each and still level — one shooter each until decided. Who shoots first?</Text>
                <Text style={c.meta}>IIHF: the team that shot second goes first; NHL keeps the order. Pick what the referee says.</Text>
                <View style={c.row}>
                  <Button label={`${homeName} first`} color={color('home')} style={c.flex} onPress={() => dispatch({ type: 'SO_ORDER', payload: { first: 'home' } })} />
                  <Button label={`${awayName} first`} color={color('away')} style={c.flex} onPress={() => dispatch({ type: 'SO_ORDER', payload: { first: 'away' } })} />
                </View>
              </>
            ) : (
              <>
                <Text style={c.meta}>Next: {name(nextSide)} · shot {n}{n > s.soRounds ? ' (sudden death)' : ` of ${s.soRounds}`}</Text>
                <Text style={c.small}>Shooter (optional)</Text>
                <PlayerGrid players={dressed(nextSide).filter((p) => p.id !== soTaker?.id)} onPick={(p) => setSoTaker(p)} />
                {soTaker ? <Text style={c.meta}>Shooter: {soTaker.fullName}</Text> : null}
                <View style={c.row}>
                  <Button label="✓ Scored" color={color(nextSide)} style={c.flex} onPress={() => {
                    dispatch({ type: 'SO', side: nextSide, payload: { scored: true }, ...(soTaker ? { attribution: { playerId: soTaker.id, stat: 'soTaken', playerName: soTaker.fullName, extra: { soGoals: 1 } } } : {}) });
                    setSoTaker(null);
                  }} />
                  <Button label="✗ Saved / missed" variant="ghost" style={c.flex} onPress={() => {
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
    const canSo = level && s.decider !== 'none' && !(s.decider === 'playoff' && !s.poShootout);
    return (
      <View style={c.wrap}>
        <View style={c.panel}>
          <Text style={c.h}>Final · {s.home}–{s.away}{s.otPeriods && !level ? ' (OT)' : ''}</Text>
          {canSo ? (
            <>
              <Text style={c.meta}>Level — the game goes to a shoot-out ({s.soRounds} shooters each, then one each until decided).</Text>
              <Text style={c.h}>🪙 Who shoots first?</Text>
              <Text style={c.meta}>As the referee decides (often the home team chooses) — pick the team going first.</Text>
              <View style={c.row}>
                <Button label={`${homeName} first`} color={color('home')} style={c.flex} onPress={() => dispatch({ type: 'START_SHOOTOUT', payload: { first: 'home' } })} />
                <Button label={`${awayName} first`} color={color('away')} style={c.flex} onPress={() => dispatch({ type: 'START_SHOOTOUT', payload: { first: 'away' } })} />
              </View>
            </>
          ) : (
            <Text style={c.meta}>{s.agg ? `${aggLine(s)}${level ? '.' : ` — ${name(s.home + s.agg.home > s.away + s.agg.away ? 'home' : 'away')} go through.`}` : level ? 'Tie.' : `${name(s.home > s.away ? 'home' : 'away')} win.`} Use “Correct the timeline” below to fix a moment.</Text>
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
        <Text style={[c.h, { color: ink(sd) }]} numberOfLines={1}>{t} · {name(sd)}</Text>
        <Text style={[c.cancel, c.tap]} accessibilityRole="button" onPress={() => setFlow(null)}>Cancel</Text>
      </View>
    );
    switch (flow.mode) {
      case 'goal': {
        const d = flow.d;
        const flags = (
          <View style={c.chips}>
            {(['ev', 'pp', 'sh'] as const).map((k) => <Chip key={k} label={k.toUpperCase()} a11y={STRENGTH_LABEL[k]} on={d.strength === k} onPress={() => setFlow({ ...flow, d: { ...d, strength: k } })} />)}
            <Chip label="EN" a11y="Empty net" on={d.en} onPress={() => setFlow({ ...flow, d: { ...d, en: !d.en } })} />
          </View>
        );
        const finish = (a2: Player | null) => {
          if (s.plusMinus) {
            // prefill the on-ice picks from the last goal (lines change, so check them)
            const lastIce = [...s.events].reverse().find((e) => e.type === 'goal' && e.onIce)?.onIce;
            const keep = (side: Side) => new Set((lastIce?.[side] ?? []).filter((id) => skatersOf(side).some((p) => p.id === id)));
            const h = keep('home'), a = keep('away');
            for (const p of [d.scorer, d.a1, a2]) if (p) (sd === 'home' ? h : a).add(p.id);
            setOnIce({ home: h, away: a });
            setFlow({ ...flow, step: 'onice', a2 });
            return;
          }
          goal(sd, d, a2);
        };
        if (flow.step === 'scorer') return (
          <View style={c.panel}>{head('Goal')}
            {flags}
            <Text style={c.meta}>{STRENGTH_LABEL[d.strength]}{d.en ? ' · empty net' : ''} — set from the penalties and the net; tap to change.</Text>
            <Text style={c.small}>Who scored?</Text>
            <PlayerGrid players={skatersOf(sd)} onPick={(p) => setFlow({ ...flow, d: { ...d, scorer: p }, step: 'a1' })}
              skip={{ label: 'Team goal (no scorer)', onPress: () => setFlow({ ...flow, d: { ...d, scorer: null }, step: 'a1' }) }} />
          </View>
        );
        if (flow.step === 'a1') return (
          <View style={c.panel}>{head('Assist')}
            <PlayerGrid players={skatersOf(sd).filter((p) => p.id !== d.scorer?.id)} onPick={(p) => setFlow({ ...flow, d: { ...d, a1: p }, step: 'a2' })}
              skip={{ label: 'Unassisted', onPress: () => finish(null) }} />
          </View>
        );
        if (flow.step === 'a2') return (
          <View style={c.panel}>{head('Second assist')}
            <PlayerGrid players={skatersOf(sd).filter((p) => p.id !== d.scorer?.id && p.id !== d.a1?.id)} onPick={(p) => finish(p)}
              skip={{ label: 'No second assist', onPress: () => finish(null) }} />
          </View>
        );
        const toggle = (side: Side, p: Player) => setOnIce((cur) => {
          const nx = new Set(cur[side]);
          if (nx.has(p.id)) nx.delete(p.id); else nx.add(p.id);
          return { ...cur, [side]: nx };
        });
        const gkIds = new Set([goalieOf(s, 'home')?.id, goalieOf(s, 'away')?.id].filter(Boolean) as string[]);
        return (
          <View style={c.panel}>{head('On the ice (+/-)')}
            <Text style={c.meta}>Tap the skaters on the ice when the goal went in (goalies don’t count). {d.strength === 'pp' ? 'A power-play goal doesn’t count for +/-.' : ''}</Text>
            {(['home', 'away'] as const).map((side) => (
              <View key={side} style={{ gap: theme.spacing(1) }}>
                <Text style={c.small}>{name(side)} · {onIce[side].size}</Text>
                <PlayerGrid players={skatersOf(side).filter((p) => !gkIds.has(p.id))} picked={onIce[side]} onPick={(p) => toggle(side, p)} />
              </View>
            ))}
            <View style={c.row}>
              <Button label="✓ Save goal" color={color(sd)} style={c.flex} onPress={() => goal(sd, d, flow.a2 ?? null, { home: [...onIce.home], away: [...onIce.away] })} />
              <Button label="Skip +/-" variant="ghost" onPress={() => goal(sd, d, flow.a2 ?? null)} />
            </View>
          </View>
        );
      }
      case 'shot':
        return (
          <View style={c.panel}>{head('Shot on goal')}
            <Text style={c.meta}>{goalie(opp(sd)) ? `The save goes to ${goalie(opp(sd))!.fullName}.` : 'No goalie set for the other side — the save is the team’s.'}</Text>
            <PlayerGrid players={skatersOf(sd)} onPick={(p) => shot(sd, p)} skip={{ label: 'Skip shooter', onPress: () => shot(sd, null) }} />
          </View>
        );
      case 'ps':
        if (flow.step === 'result') return (
          <View style={c.panel}>{head('Penalty shot')}
            <View style={c.row}>
              <Button label="✓ Scored" color={color(sd)} style={c.flex} onPress={() => setFlow({ mode: 'ps', side: sd, step: 'player' })} />
              <Button label="🧤 Saved" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, res: 'saved', step: 'player' })} />
              <Button label="↗ Missed" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, res: 'missed', step: 'player' })} />
            </View>
          </View>
        );
        return (
          <View style={c.panel}>{head('Penalty shot · shooter')}
            <PlayerGrid players={skatersOf(sd)} onPick={(p) => (flow.res === 'saved' ? shot(sd, p, true) : flow.res === 'missed' ? psMiss(sd, p) : psGoal(sd, p))}
              skip={{ label: 'Skip shooter', onPress: () => (flow.res === 'saved' ? shot(sd, null, true) : flow.res === 'missed' ? psMiss(sd, null) : psGoal(sd, null)) }} />
          </View>
        );
      case 'pen':
        if (flow.step === 'kind') return (
          <View style={c.panel}>{head('Penalty')}
            <View style={c.grid}>
              {PEN_MENU.map((k) => <Button key={k} label={PEN_LABEL[k]} variant="ghost" style={c.typeBtn} onPress={() => setFlow({ ...flow, pen: k, step: 'infraction' })} />)}
            </View>
            <Text style={c.meta}>Minor: the team is a skater short for 2 minutes (ends early if the other team scores). Major: 5 minutes in full. Misconduct: the player sits 10 minutes, the team isn’t short. Game misconduct / match penalty: the player is out of the game (a match penalty also leaves the team short 5 minutes).</Text>
          </View>
        );
        if (flow.step === 'infraction') return (
          <View style={c.panel}>{head(PEN_LABEL[flow.pen ?? 'minor'])}
            <Text style={c.small}>Infraction (optional)</Text>
            <View style={c.chips}>
              {INFRACTIONS.map((x) => <Chip key={x} label={x} on={false} onPress={() => (flow.pen === 'bench' ? penalty(sd, 'bench', x, null) : setFlow({ ...flow, infraction: x, step: 'player' }))} />)}
              <Chip label="Skip" on={false} onPress={() => (flow.pen === 'bench' ? penalty(sd, 'bench', undefined, null) : setFlow({ ...flow, step: 'player' }))} />
            </View>
          </View>
        );
        return (
          <View style={c.panel}>{head(`${PEN_LABEL[flow.pen ?? 'minor']}${flow.infraction ? ` · ${flow.infraction.toLowerCase()}` : ''}`)}
            <Text style={c.small}>Who?</Text>
            <PlayerGrid players={dressed(sd)} onPick={(p) => penalty(sd, flow.pen ?? 'minor', flow.infraction, p)}
              skip={{ label: 'Bench / team', onPress: () => penalty(sd, flow.pen === 'minor' ? 'bench' : flow.pen ?? 'bench', flow.infraction, null) }} />
            {flow.pen === 'match' || flow.pen === 'majorGm' ? <Text style={c.meta}>A team-mate serves the 5 minutes; the player is out of the game.</Text> : null}
          </View>
        );
      case 'gk':
        return (
          <View style={c.panel}>{head('Goalie in net')}
            <PlayerGrid players={dressed(sd)} onPick={(p) => setGoalie(sd, p)} />
          </View>
        );
    }
  })();

  const on = skatersOn(s, box);
  const base = baseSkaters(s);
  const pulled = { home: netEmpty(s, 'home'), away: netEmpty(s, 'away') };
  const sideCol = (sd: Side) => {
    const gk = theGoalie(sd);
    const toLeft = timeoutLeft(s, sd);
    return (
      <View key={sd} style={c.col}>
        <Text style={[c.team, { color: ink(sd) }]} numberOfLines={1}>{name(sd)}</Text>
        <Button label="🚨 Goal" color={color(sd)} disabled={!periodStarted(s)} onPress={() => startGoal(sd)} />
        <Button label="🥅 Shot" accessibilityLabel={`Shot on goal by ${name(sd)}`} variant="ghost" disabled={!periodStarted(s)} onPress={() => setFlow({ mode: 'shot', side: sd })} />
        <Button label="⏱ Penalty" variant="ghost" onPress={() => setFlow({ mode: 'pen', side: sd, step: 'kind' })} />
        <Button label="🎯 Penalty shot" variant="ghost" disabled={!periodStarted(s)} onPress={() => setFlow({ mode: 'ps', side: sd, step: 'result' })} />
        <Button label={pulled[sd] ? '🧤 Goalie back' : '🥅 Pull goalie'} accessibilityLabel={pulled[sd] ? `${name(sd)} goalie back in net` : `${name(sd)} pull the goalie for an extra skater`}
          variant="ghost" onPress={() => fire({ type: pulled[sd] ? 'BACK' : 'PULL', side: sd })} />
        <Button label={`⏸ Time-out · ${toLeft}`} accessibilityLabel={`Team time-out for ${name(sd)}, ${toLeft} left`} variant="ghost" disabled={toLeft === 0 || !periodStarted(s)} onPress={() => fire({ type: 'TIMEOUT', side: sd })} />
        <Text style={[c.gk, c.tap]} accessibilityRole="button" accessibilityLabel={`Goalie for ${name(sd)}: ${gk ? gk.fullName : 'not set'}. Change`} onPress={() => setFlow({ mode: 'gk', side: sd })} numberOfLines={2}>
          🧤 {gk ? `${gk.fullName}${pulled[sd] ? ' (pulled)' : ''}` : 'Set goalie'} ›
        </Text>
      </View>
    );
  };

  const boxRows = (['home', 'away'] as const).flatMap((sd) => [
    ...box.running[sd].map((p) => ({ sd, text: `${p.who.name ?? 'Bench'} · ${mmss(partEnd(p) - nowSec)}${p.parts.length > 1 ? ` (+${mmss(p.parts.slice(p.part + 1).reduce((a, b) => a + b, 0))})` : ''}` })),
    ...box.waiting[sd].map((p) => ({ sd, text: `${p.who.name ?? 'Bench'} · waits (${mmss(p.parts.reduce((a, b) => a + b, 0))})` })),
    ...box.misconduct.filter((m) => m.side === sd).map((m) => ({ sd, text: `${m.who.name ?? 'Player'} · 10′ ${mmss(m.until - nowSec)}` })),
  ]);

  return (
    <View style={c.wrap}>
      {editAt ? <BackfillBar at={eventWhen(s, editAt)} onLive={() => setFlow(null)} /> : null}
      <View style={c.panel}>
        <View style={c.clockRow}>
          <View style={{ flex: 1 }}>
            <Text style={c.small}>{periodLong(s, s.period)}{s.period > s.periods ? ` · sudden death, ${base} on ${base}` : ''}</Text>
            <Text style={c.clock} accessibilityLabel={`${clockFace(s, now)} left in the ${periodLong(s, s.period)}`}>{clockFace(s, now)}</Text>
          </View>
          <Button label={running(s) ? '⏸ Stop' : periodStarted(s) ? '▶ Resume' : s.period === 1 ? '▶ Face-off' : `▶ Start ${periodName(s, s.period)}`} variant={running(s) ? 'ghost' : 'primary'} onPress={startStop} />
        </View>
        <View style={c.row}>
          {!last ? <Button label={`⏭ End ${periodName(s, s.period)}`} variant="ghost" style={c.flex} disabled={!periodStarted(s)} onPress={() => void endPeriod()} /> : null}
          <Button label="⏱ Set clock" variant="ghost" style={c.flex} onPress={() => setSetting((v) => !v)} />
        </View>
        {toOt && periodStarted(s) ? <Text style={c.meta}>Level — ending this period goes to overtime (sudden death).</Text> : null}
        {setting ? (
          <View style={c.row}>
            <View style={c.flex}><TextField label="Time left (mm:ss)" value={clockInput} onChange={setClockInput} placeholder={clockFace(s, now)} /></View>
            <Button label="Set" onPress={applyClock} />
          </View>
        ) : null}
        {periodSec(s, now) >= periodLen(s, s.period) && running(s) ? <Text style={c.short}>0:00 — end of the {periodLong(s, s.period)}.</Text> : null}
        {!running(s) && periodStarted(s) && periodSec(s, now) < periodLen(s, s.period) ? (
          <View style={c.stopped} accessibilityRole="alert">
            <Text style={c.stoppedTxt}>⏸ Clock stopped (whistle)</Text>
            <Button label="▶ Resume" onPress={startStop} />
          </View>
        ) : null}
        {on.home !== base || on.away !== base || pulled.home || pulled.away ? (
          <Text style={c.strength} accessibilityRole="text">
            {on.home + (pulled.home ? 1 : 0)} v {on.away + (pulled.away ? 1 : 0)}
            {on.home > on.away ? ` · ${name('home')} power play` : on.away > on.home ? ` · ${name('away')} power play` : ''}
            {pulled.home ? ` · ${name('home')} net empty` : ''}{pulled.away ? ` · ${name('away')} net empty` : ''}
          </Text>
        ) : null}
        {boxRows.length ? (
          <View style={c.boxList} accessibilityLabel="Penalty box">
            {boxRows.map((r, i) => <Text key={i} style={[c.boxRow, { color: ink(r.sd) }]} numberOfLines={1}>⏱ {name(r.sd)} · {r.text}</Text>)}
          </View>
        ) : null}
      </View>

      {flowPanel ?? <View style={c.cols}>{sideCol('home')}{sideCol('away')}</View>}

      <EditList s={s} show={showEdit} setShow={setShowEdit} onRemove={remove} onEdit={edit} homeName={homeName} awayName={awayName} />
      {last ? <Button label="🏁 Final horn" accessibilityLabel="End the game (final horn)" variant="danger" disabled={!periodStarted(s)} onPress={() => void endPeriod()} /> : null}
      {last && !periodStarted(s) ? <Text style={c.gk}>Start {periodName(s, s.period)} first — the final horn unlocks once it’s under way.</Text> : null}
    </View>
  );
};

/** The scorer's "Correct the timeline" list: remove a moment, or re-enter it. */
function EditList({ s, show, setShow, onRemove, onEdit, homeName, awayName }: {
  s: IceHockeyState; show: boolean; setShow: (v: boolean) => void; onRemove: (e: IceEvent) => void; onEdit?: (e: IceEvent) => void; homeName: string; awayName: string;
}) {
  if (!s.events.length) return null;
  return (
    <View style={c.panel}>
      <Text style={[c.link, c.tap]} accessibilityRole="button" onPress={() => setShow(!show)}>{show ? 'Hide' : '✎ Correct the timeline'}</Text>
      {show ? [...s.events].reverse().slice(0, 40).map((e) => {
        const d = describeEvent(e);
        return (
          <View key={e.id} style={c.editRow}>
            <Text style={c.editWhen}>{eventWhen(s, e)}</Text>
            <Text style={c.editLabel} numberOfLines={2}>{d.icon} {d.label} · {e.side === 'home' ? homeName : awayName}{d.detail ? ` · ${d.detail}` : ''}</Text>
            {onEdit && (e.type === 'goal' || e.type === 'shot' || e.type === 'pen') ? <RowAction label="✎ Edit" tone="edit" a11y={`Edit ${d.label}`} onPress={() => onEdit(e)} /> : null}
            <RowAction label="✕" tone="remove" a11y={`Remove ${d.label}`} onPress={() => void confirmRemove(`${d.label} (${eventWhen(s, e)})`, () => onRemove(e),
              e.type === 'goal' ? 'The score, the assists and the penalty box re-adjust.' : undefined)} />
          </View>
        );
      }) : null}
    </View>
  );
}

/* ------------------------------- live views -------------------------------- */

const LiveClock: NonNullable<SportPlugin<IceHockeyState>['LiveClock']> = ({ state }) => {
  const s = state as IceHockeyState;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running(s)) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.clock?.since, s.ended]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = Date.now();
  const so = soScore(s);
  const label = s.ended ? (s.shootout ? `Final · SO ${so.home}–${so.away}` : s.otPeriods && !levelAtEnd(s) ? 'Final (OT)' : 'Final')
    : !periodStarted(s) ? (s.period === 1 ? '—' : `${periodName(s, s.period)} next`) : `${periodName(s, s.period)} ${clockFace(s, now)}`;
  let banner: React.ReactNode = null;
  if (!s.ended) {
    const sec = matchSec(s, now);
    const box = penaltyBox(s, sec);
    const on = skatersOn(s, box);
    const base = baseSkaters(s);
    const suspended = (['home', 'away'] as const).flatMap((sd) => box.running[sd].map((p) => ({ side: sd, name: p.who.name ?? 'Bench', left: mmss(partEnd(p) - sec) })));
    banner = <FieldBanner suspended={suspended} onField={on.home !== base || on.away !== base ? on : null} unit="skaters" />;
  }
  return (
    <View style={{ alignItems: 'center', gap: theme.spacing(1), flex: 1, minWidth: 0 }}>
      <View style={c.clockRow2}>
        <View style={[c.dot, { backgroundColor: running(s) ? theme.colors.danger : theme.colors.textMuted }]} />
        <Text style={c.clockSmall}>{label}</Text>
      </View>
      {banner ? <View style={{ alignSelf: 'stretch' }}>{banner}</View> : null}
    </View>
  );
};

/** Goals per period (and OT, SO), the live period highlighted. */
const IceHockeyScoreboard: NonNullable<SportPlugin<IceHockeyState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live }) => {
  const s = state as IceHockeyState;
  const n = Math.max(totalPeriods(s), s.period);
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
      home={{ name: homeName, color: homeColor ?? theme.colors.home, lead: String(r?.home ?? s.home), cells: cells('home') }}
      away={{ name: awayName, color: awayColor ?? theme.colors.away, lead: String(r?.away ?? s.away), cells: cells('away') }}
    />
  );
};

const LiveExtras: NonNullable<SportPlugin<IceHockeyState>['LiveExtras']> = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }) => {
  const s = state as IceHockeyState;
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Text style={c.h}>Timeline</Text>
      <LiveTimeline events={iceHockeyTimeline(s, { home: homeName, away: awayName })} homeColor={homeColor} awayColor={awayColor} emptyText="No goals or penalties yet." homeRoster={homeRoster} awayRoster={awayRoster} onPlayer={onPlayer} />
      <Text style={c.h}>Box score</Text>
      <MatchBoxScore sport="ice_hockey" source={iceHockeyBox(s, { homeRoster, awayRoster })} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} />
    </View>
  );
};

/* ------------------------------- named Undo -------------------------------- */

/** SD-115: "goal (PP) · Rao (2-1)", "minor 2′ tripping · Khan", "shot · Rao". */
export function iceHockeyUndoLabel(step: { type: string; prev: unknown; next: unknown } | null | undefined): string | null {
  if (!step) return null;
  const prev = step.prev as IceHockeyState | undefined, next = step.next as IceHockeyState | undefined;
  if (!prev?.events || !next?.events) return null;
  if (step.type === 'ASSIST2') {
    const g = next.events.find((e, i) => e.type === 'goal' && e.thirdName && !prev.events[i]?.thirdName);
    return g?.thirdName ? `second assist · ${g.thirdName}` : 'second assist';
  }
  if (step.type === 'CLOCK') return 'clock start / stop';
  if (step.type === 'SET_CLOCK') return 'clock set';
  if (step.type === 'END_PERIOD') return 'period end';
  if (step.type === 'XI') return 'line-up';
  if (step.type === 'SO') return 'shoot-out shot';
  if (next.events.length <= prev.events.length) return null;
  const e = next.events[next.events.length - 1];
  const who = e.playerName ?? (e.side === 'home' ? 'Home' : 'Away');
  switch (e.type) {
    case 'goal': { const t = goalTags(e); return `goal${t.length ? ` (${t.join(', ')})` : ''} · ${who} (${next.home}-${next.away})`; }
    case 'shot': return `shot · ${who}`;
    case 'pen': return `${PEN_LABEL[e.pen ?? 'minor'].toLowerCase()}${e.infraction ? ` ${e.infraction.toLowerCase()}` : ''} · ${who}`;
    default: return describeEvent(e).label.toLowerCase();
  }
}

/* --------------------------------- plugin ---------------------------------- */

export const iceHockeyPlugin: SportPlugin<IceHockeyState> = {
  id: 'ice_hockey',
  name: 'Ice hockey',
  icon: '🏒',
  archetype: 'goal-time',
  createInitialState: init,
  reducer,
  isComplete,
  result,
  summary: (s) => {
    const so = soScore(s);
    const r = result(s);
    return {
      homeScore: String(r?.home ?? s.home),
      awayScore: String(r?.away ?? s.away),
      statusLine: s.shootoutWinner
        ? `${s.shootoutWinner === 'home' ? 'Home' : 'Away'} win the shoot-out ${so.home}–${so.away}`
        : s.shootout ? `Shoot-out ${so.home}–${so.away}`
        : s.ended ? (s.otPeriods && !levelAtEnd(s) ? 'Final (OT)' : 'Final')
        : !periodStarted(s) && s.period > 1 ? `End of ${periodName(s, s.period - 1)}`
        : periodLong(s, s.period)[0].toUpperCase() + periodLong(s, s.period).slice(1),
      detailLine: [aggLine(s), s.shootout ? `Shoot-out · ${so.home}–${so.away}` : ''].filter(Boolean).join(' · ') || undefined,
      homeReds: s.events.filter((e) => e.type === 'pen' && ejects(e.pen) && e.side === 'home').length,
      awayReds: s.events.filter((e) => e.type === 'pen' && ejects(e.pen) && e.side === 'away').length,
    };
  },
  scoreLine: iceHockeyScoreLine,
  standingsUnits: (s) => standingsUnits(s),
  statTotals: iceHockeyTotals,
  tickerDetail: iceHockeyTickerDetail,
  tickerFlash: iceHockeyTickerFlash,
  undoLabel: iceHockeyUndoLabel,
  voice: { hints: ['goal {name} assist {name}', 'power play goal {name}', 'shot {name}', 'two minutes tripping {name}', 'time-out home', 'end period'], parse: iceHockeyVoice, ends: iceHockeyVoiceEnds },
  ScoringControls,
  LiveClock,
  Scoreboard: IceHockeyScoreboard,
  LiveExtras,
  formation: (perSide) => iceHockeyFormation(perSide),
  Court: IceRink,
  liveSettings: ICE_HOCKEY_LIVE_SETTINGS,
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'iihf', onCreate: true,
      options: [
        ...Object.entries(ICE_HOCKEY_PRESETS).map(([value, p]) => ({ value, label: p.label, set: p.set })),
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'periodMinutes', label: 'Minutes per period', type: 'number', default: 20, min: 1, max: 30, advanced: true },
    { key: 'skaters', label: 'Skaters a side (plus the goalie)', type: 'count', default: 5, min: 3, max: 6, advanced: true },
    {
      key: 'decider', label: 'If tied after regulation', type: 'choice', default: 'none',
      options: [
        { value: 'none', label: 'Tie stands' },
        { value: 'otso', label: 'Overtime, then a shoot-out (round robin)' },
        { value: 'playoff', label: 'Play-off overtime (sudden death)' },
        { value: 'so', label: 'Shoot-out straight away' },
      ],
      hint: 'tournaments set this by stage: groups → overtime + shoot-out, knockouts → play-off overtime',
    },
    { key: 'otMinutes', label: 'Overtime minutes (round robin)', type: 'number', default: 5, min: 0, max: 20, advanced: true, hint: 'IIHF / NHL: 5, 3 on 3' },
    { key: 'otSkaters', label: 'Overtime skaters (round robin)', type: 'count', default: 3, min: 3, max: 5, advanced: true },
    { key: 'poOtMinutes', label: 'Play-off overtime minutes', type: 'number', default: 10, min: 1, max: 20, advanced: true, hint: 'IIHF 10 (final 20), NHL 20' },
    { key: 'poOtSkaters', label: 'Play-off overtime skaters', type: 'count', default: 3, min: 3, max: 5, advanced: true },
    { key: 'poShootout', label: 'Shoot-out after play-off overtime', type: 'toggle', default: true, advanced: true, hint: 'IIHF yes; NHL plays more overtime until a goal' },
    { key: 'soRounds', label: 'Shoot-out shooters a side', type: 'count', default: 5, min: 1, max: 5, advanced: true, hint: 'IIHF 5, NHL 3' },
    { key: 'stopClock', label: 'Stop the clock on goals and penalties', type: 'toggle', default: true, advanced: true },
    { key: 'plusMinus', label: 'Track +/- (pick who was on the ice at each goal)', type: 'toggle', default: false, advanced: true },
    { key: 'allowTies', label: 'League games may end tied (no overtime)', type: 'toggle', default: false, advanced: true, hint: 'groups otherwise play overtime + a shoot-out' },
  ],
};

const c = StyleSheet.create({
  wrap: { gap: theme.spacing(3) },
  panel: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  row: { flexDirection: 'row', gap: theme.spacing(2), alignItems: 'flex-end' },
  flex: { flex: 1 },
  typeBtn: { flexBasis: '46%', flexGrow: 1 },
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
  strength: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800', textAlign: 'center' },
  boxList: { gap: 2 },
  boxRow: { fontSize: theme.font.small, fontWeight: '700' },
  flowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  cancel: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(1) },
  chip: { paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.inputBorder, minHeight: 44, justifyContent: 'center' },
  chipOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipTxt: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  chipTxtOn: { color: theme.colors.onFill },
  pchip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceAlt, maxWidth: '100%' },
  pchipOn: { backgroundColor: theme.colors.primary },
  pnum: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  pname: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', flexShrink: 1 },
  pnameOn: { color: theme.colors.onFill },
  skip: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: 'transparent' },
  skipTxt: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  soRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  soTeam: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', width: 110 },
  soDots: { color: theme.colors.text, fontSize: theme.font.body, letterSpacing: 1, flex: 1 },
  stopped: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), padding: theme.spacing(2), borderRadius: theme.radius.sm, backgroundColor: theme.colors.accent + '22', borderWidth: 1, borderColor: theme.colors.accent },
  stoppedTxt: { flex: 1, color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  /** SD-155: text links get a ≥ 44 pt tall target */
  tap: { minHeight: 44, paddingVertical: theme.spacing(3) },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  editWhen: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '800', width: 64 },
  editLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
});

