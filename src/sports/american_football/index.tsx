/**
 * American football plugin — SD-147. Flag football (IFAF 5-on-5, the first
 * preset) and tackle (NFL / college / high school). Archetype: goal / time on
 * a stoppable game clock counting DOWN (2 halves or 4 quarters), timeouts per
 * half, the NFL two-minute warning as an option. The pure rules live in
 * ./engine.ts; statTotals in ./totals.ts, the box score in ./box.ts.
 *
 * Fast for one scorer: SCORE-ONLY mode (default) is per side Touchdown (how +
 * scorer [+ passer], then the try), Field goal (tackle), Safety, Timeout.
 * PLAY-BY-PLAY mode (organiser / live setting) adds the drive — possession,
 * down & distance, ball spot — and a quick sheet: run, pass complete /
 * incomplete, sack, interception, fumble lost, punt, field goal, penalty
 * (a short list of common fouls), turnover on downs; a run / catch that
 * reaches the goal line is a touchdown by itself. Overtime follows the
 * organiser's rule (NFL / Kansas / flag conversions), the coin toss picked by
 * the scorer.
 *
 * Corrections: "Correct the timeline" removes or re-enters a past moment
 * (REMOVE_EVENT with the reversed credits, then the same flow stamped at the
 * original time; Cancel keeps the event — SD-114).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { ensureContrast } from '../../core/contrast';
import { Button, SelectChip, TextField } from '../../components/ui';
import { confirmMatchAction } from '../../components/ConfirmSheet';
import { LineScoreboard } from '../../components/LineScoreboard';
import { MatchBoxScore } from '../../components/BoxScore';
import { LiveTimeline } from '../LiveTimeline';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';
import {
  init, reducer, isComplete, result, matchSec, periodSec, periodLen, remainingSec, clockFace, periodName, periodLong, periodStarted, running,
  eventCredits, creditAttribution, credit, buildPlay, foulsFor, timeoutsLeft, isOT, clockless, isLast, downText, spotText, toGo, touchback,
  fgDistance, pointsOf, eventWhen, other, afScoreLine, totalPeriods,
  AF_PRESETS, AF_LIVE_SETTINGS,
  type AFEvent, type AFState, type Side, type TdHow, type TryKind, type Who, type Foul,
} from './engine';
import { afTotals } from './totals';
import { afBox } from './box';
import { afTimeline, afPlays, describeEvent, afUndoLabel } from './timeline';
import { afTickerDetail, afTickerFlash } from './ticker';
import { afFormation, AFField } from './field';
import { usePendingEdit } from '../usePendingEdit';
import { BackfillBar, RowAction, confirmRemove } from '../TimelineControls';
import { afVoice, afVoiceEnds, lastPasser } from './voice';

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const who = (p?: Player | null): Who | undefined => (p ? { id: p.id, name: p.fullName } : undefined);

/* ------------------------------ small pickers ------------------------------ */

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

/** Yards: one tap on a chip, or type any number and Go. */
function YardsPad({ chips, onPick, label = 'Yards', unit = 'yds' }: { chips: number[]; onPick: (n: number) => void; label?: string; unit?: string }) {
  const [v, setV] = useState('');
  const n = Number(v.trim());
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={c.grid}>
        {chips.map((x) => <SelectChip key={x} label={`${x > 0 ? '+' : ''}${x}`} accessibilityLabel={`${x} ${unit}`} active={false} onPress={() => onPick(x)} />)}
      </View>
      <View style={c.row}>
        <View style={c.flex}><TextField label={`${label} (other)`} value={v} onChange={setV} placeholder="e.g. 23 or -4" autoCapitalize="none" /></View>
        <Button label="Go" disabled={!v.trim() || !Number.isFinite(n)} onPress={() => { onPick(Math.round(n)); setV(''); }} />
      </View>
    </View>
  );
}

type Flow =
  | { mode: 'td'; side: Side; step: 'scorer' | 'passer'; how: TdHow; yards: string; scorer?: Player | null }
  | { mode: 'tryWho'; side: Side; kind: TryKind; good: boolean }
  | { mode: 'defTry'; side: Side }
  | { mode: 'fg'; side: Side; step: 'result' | 'kicker'; yards: string; good?: boolean }
  | { mode: 'safety'; side: Side }
  | { mode: 'eject'; side: Side }
  | { mode: 'tackle'; side: Side }
  | { mode: 'run'; side: Side; step: 'who' | 'yards'; p1?: Player | null }
  | { mode: 'pass'; side: Side; step: 'passer' | 'receiver' | 'yards'; p1?: Who; p2?: Player | null }
  | { mode: 'inc'; side: Side }
  | { mode: 'sack'; side: Side; step: 'who' | 'yards'; p2?: Player | null }
  | { mode: 'int'; side: Side; step: 'who' | 'spot'; p2?: Player | null }
  | { mode: 'fumble'; side: Side; step: 'who' | 'rec' | 'spot'; p1?: Player | null; p2?: Player | null }
  | { mode: 'punt'; side: Side; step: 'who' | 'yards' | 'ret'; p1?: Player | null; gross?: number }
  | { mode: 'penalty'; side: Side; step: 'foul' | 'yards'; foul?: Foul }
  | { mode: 'drive' }
  | { mode: 'kickoff'; side: Side };

/* -------------------------------- controls --------------------------------- */

const ScoringControls: SportPlugin<AFState>['ScoringControls'] = ({
  state: liveState, dispatch: rawDispatch, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [], homeLineup = [], awayLineup = [],
}) => {
  // SD-114: Edit holds the removal until the re-entry commits (Cancel keeps the event).
  const { view: s, dispatch, begin: holdRemoval, cancel: dropHeldRemoval } = usePendingEdit(liveState, rawDispatch, reducer);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [editAt, setEditAt] = useState<{ sec: number; psec: number; period: number } | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [clockInput, setClockInput] = useState('');
  const [setting, setSetting] = useState(false);
  const [driveIn, setDriveIn] = useState<{ off: Side; spot: string; down: number; toGo: string }>({ off: 'home', spot: '25', down: 1, toGo: '10' });
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running(s)) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.clock.since, s.ended]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (flow === null && editAt) { setEditAt(null); dropHeldRemoval(); } }, [flow]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = Date.now();
  // NFL two-minute warning: stop the clock at 2:00 of the 2nd and 4th quarters
  const warnDue = s.twoMinute && running(s) && !isOT(s, s.period) && (s.periods === 4 ? s.period === 2 || s.period === 4 : true)
    && !s.warned.includes(s.period) && remainingSec(s, now) <= 120;
  useEffect(() => { if (warnDue) rawDispatch({ type: 'TWO_MIN', payload: { at: Date.now() } }); }, [warnDue]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = (sd: Side) => (sd === 'home' ? homeName : awayName);
  const color = (sd: Side) => (sd === 'home' ? homeColor ?? theme.colors.home : awayColor ?? theme.colors.away);
  /** team colour as TEXT on a panel: darkened / lightened to AA (SD-155) */
  const ink = (sd: Side) => ensureContrast(color(sd), theme.colors.surface);
  const rosterOf = (sd: Side) => (sd === 'home' ? homeRoster : awayRoster);
  const lineupOf = (sd: Side) => (sd === 'home' ? homeLineup : awayLineup);
  const byId = (sd: Side, id?: string, nm?: string): Player | undefined =>
    rosterOf(sd).find((p) => (id && p.id === id) || (!id && nm && p.fullName === nm)) ?? (id ? { id, fullName: nm ?? 'Player', sports: ['american_football'] } as Player : undefined);
  const ejected = (sd: Side) => new Set(s.events.filter((e) => e.type === 'eject' && e.side === sd && e.playerId).map((e) => e.playerId!));
  const players = (sd: Side): Player[] => {
    const out = ejected(sd);
    const lu = lineupOf(sd).filter((sl) => sl.playerId).map((sl) => byId(sd, sl.playerId, sl.playerName)).filter((p): p is Player => !!p);
    const seen = new Set<string>();
    return [...lu, ...rosterOf(sd)].filter((p) => !out.has(p.id) && (seen.has(p.id) ? false : (seen.add(p.id), true)));
  };

  const stamp = () => {
    const at = Date.now();
    return { uid: uid(), at, sec: editAt?.sec ?? matchSec(s, at), psec: editAt?.psec ?? periodSec(s, at), period: editAt?.period ?? s.period, ...(editAt ? { edit: true } : {}) };
  };
  const fire = (a: ScoreAction) => dispatch({ ...a, payload: { ...stamp(), ...a.payload } });

  /* ---- who is on the field ---- */
  const stampXi = () => {
    for (const sd of ['home', 'away'] as const) {
      const roster = rosterOf(sd);
      const ps = lineupOf(sd).filter((sl) => sl.playerId).map((sl) => ({ id: sl.playerId!, name: roster.find((p) => p.id === sl.playerId)?.fullName ?? sl.playerName ?? '' }));
      if (!ps.length || JSON.stringify(ps) === JSON.stringify(s.xi?.[sd]?.players ?? [])) continue;
      dispatch({ type: 'XI', payload: { team: sd, players: ps } });
    }
  };

  /* ---- recorders ---- */
  const scoreTd = (sd: Side, how: TdHow, scorer: Player | null, passer: Player | null, yardsText: string) => {
    const y = yardsText.trim() ? Math.round(Number(yardsText)) : undefined;
    const yards = y != null && Number.isFinite(y) && y >= 0 ? y : undefined;
    fire({ type: 'TD', side: sd, payload: { how, ...(yards != null ? { yards } : {}) },
      ...credit({ type: 'td', how, yards, playerId: scorer?.id, playerName: scorer?.fullName, ...(how === 'pass' && passer ? { secondId: passer.id, secondName: passer.fullName } : {}) }) });
    setFlow(null);
  };
  const recordTry = (sd: Side, kind: TryKind, good: boolean, p: Player | null) => {
    fire({ type: 'TRY', side: sd, payload: { kind, good }, ...credit({ type: 'try', kind, good, playerId: p?.id, playerName: p?.fullName }) });
    setFlow(null);
  };
  const recordFg = (sd: Side, good: boolean, yardsText: string, p: Player | null) => {
    const y = Math.round(Number(yardsText));
    fire({ type: 'FG', side: sd, payload: { good, ...(yardsText.trim() && Number.isFinite(y) && y > 0 ? { yards: y } : {}) }, ...credit({ type: 'fg', good, playerId: p?.id, playerName: p?.fullName }) });
    setFlow(null);
  };
  const play = (sd: Side, inp: Parameters<typeof buildPlay>[2]) => {
    const a = buildPlay(s, sd, inp, stamp());
    dispatch(a);
    // a tackle / flag pull after a gain, when tracked
    if (s.trackTackles && a.type === 'PLAY' && (inp.play === 'run' || inp.play === 'pass')) setFlow({ mode: 'tackle', side: other(sd) });
    else setFlow(null);
  };

  /* ---- correct the timeline ---- */
  const removalActions = (e: AFEvent): ScoreAction[] => {
    const cr = eventCredits(e);
    return [{ type: 'REMOVE_EVENT', side: e.side, payload: { id: e.id }, attribution: creditAttribution(cr.first, -1), attribution2: creditAttribution(cr.second, -1) }];
  };
  const remove = (e: AFEvent) => { for (const a of removalActions(e)) dispatch(a); };
  const editable = (e: AFEvent) => e.type === 'td' || e.type === 'fg' || e.type === 'safety' || e.type === 'try';
  const edit = (e: AFEvent) => {
    if (!editable(e)) { remove(e); return; }
    holdRemoval(removalActions(e));
    setEditAt({ sec: e.sec, psec: e.psec, period: e.period });
    setShowEdit(false);
    if (e.type === 'td') setFlow({ mode: 'td', side: e.side, step: 'scorer', how: e.how ?? 'run', yards: e.yards != null ? String(e.yards) : '' });
    else if (e.type === 'fg') setFlow({ mode: 'fg', side: e.side, step: 'result', yards: e.yards ? String(e.yards) : '' });
    else if (e.type === 'safety') setFlow({ mode: 'safety', side: e.side });
    else if (e.type === 'try') setFlow({ mode: 'tryWho', side: e.side, kind: e.kind ?? 'kick', good: !!e.good });
  };

  /* ---- clock ---- */
  const startStop = () => {
    const at = Date.now();
    if (running(s)) { dispatch({ type: 'CLOCK', payload: { run: false, at } }); return; }
    if (s.period === 1 && !periodStarted(s)) stampXi();
    dispatch({ type: 'CLOCK', payload: { run: true, at } });
  };
  const last = isLast(s);
  // SD-106: ending a period / the game asks first (ConfirmSheet).
  const endPeriod = async () => {
    if (!periodStarted(s)) return;
    const score = `${s.home}-${s.away}`;
    const ok = last ? await confirmMatchAction('fullTime', { score }) : await confirmMatchAction('endPeriod', { period: periodName(s, s.period), score });
    if (!ok) return;
    if (last) stampXi();
    dispatch({ type: 'END_PERIOD', payload: { at: Date.now() } });
  };
  const applyClock = () => {
    const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(clockInput.trim());
    if (!m) return;
    dispatch({ type: 'SET_CLOCK', payload: { remaining: Number(m[1]) * 60 + Number(m[2] ?? 0), at: Date.now() } });
    setSetting(false); setClockInput('');
  };

  /* ---- after the final whistle ---- */
  if (s.ended) {
    return (
      <View style={c.wrap}>
        <View style={c.panel}>
          <Text style={c.h}>Final · {s.home}–{s.away}{s.plan.includes('ot') ? ' (OT)' : ''}</Text>
          <Text style={c.meta}>{s.home === s.away ? 'Tie.' : `${name(s.home > s.away ? 'home' : 'away')} win.`} Use “Correct the timeline” below to fix a moment.</Text>
        </View>
        <EditList s={s} show={showEdit} setShow={setShowEdit} onRemove={remove} homeName={homeName} awayName={awayName} />
      </View>
    );
  }

  const flag = s.variant === 'flag';
  const pbp = s.mode === 'pbp';
  const d = s.drive;
  const ot = isOT(s, s.period);
  // overtime: whose possession it is now (alternating from the coin toss)
  const otOffence: Side | undefined = ot && s.otFirst ? (s.otPoss.length % 2 === 0 ? s.otFirst : other(s.otPoss[s.otPoss.length - 1])) : undefined;

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
      case 'td': {
        const sd = flow.side;
        if (flow.step === 'passer') return (
          <View style={c.panel}>{head('Touchdown pass — thrown by', sd)}
            <PlayerGrid players={players(sd).filter((p) => p.id !== flow.scorer?.id)} onPick={(p) => scoreTd(sd, 'pass', flow.scorer ?? null, p, flow.yards)}
              skip={{ label: 'Skip passer', onPress: () => scoreTd(sd, 'pass', flow.scorer ?? null, null, flow.yards) }} />
          </View>
        );
        const hows: [TdHow, string][] = [['run', 'Run'], ['pass', 'Pass'], ['int', 'Interception return'], ['fumble', 'Fumble return'], ...(flag ? [] : [['punt', 'Punt return'], ['kick', 'Kickoff return']] as [TdHow, string][])];
        const next = (p: Player | null) => (flow.how === 'pass' ? setFlow({ ...flow, scorer: p, step: 'passer' }) : scoreTd(sd, flow.how, p, null, flow.yards));
        return (
          <View style={c.panel}>{head('Touchdown (6)', sd)}
            <View style={c.grid}>{hows.map(([h, l]) => <SelectChip key={h} label={l} active={flow.how === h} onPress={() => setFlow({ ...flow, how: h })} />)}</View>
            <TextField label="Yards (optional)" value={flow.yards} onChange={(v) => setFlow({ ...flow, yards: v })} placeholder="e.g. 24" autoCapitalize="none" />
            <Text style={c.small}>Who scored?</Text>
            <PlayerGrid players={players(sd)} onPick={next} skip={{ label: 'Team (no scorer)', onPress: () => next(null) }} />
          </View>
        );
      }
      case 'tryWho': {
        const sd = flow.side;
        const t = flow.kind === 'kick' ? 'Extra point kicker' : `${flow.kind === 'two' ? '2' : '1'}-point conversion — who scored?`;
        return (
          <View style={c.panel}>{head(t, sd)}
            <PlayerGrid players={players(sd)} onPick={(p) => recordTry(sd, flow.kind, flow.good, p)} skip={{ label: 'Skip player', onPress: () => recordTry(sd, flow.kind, flow.good, null) }} />
          </View>
        );
      }
      case 'defTry': {
        const sd = flow.side;
        const go = (p: Player | null) => { fire({ type: 'DEF_TRY', side: sd, ...credit({ type: 'defTry', playerId: p?.id, playerName: p?.fullName }) }); setFlow(null); };
        return (
          <View style={c.panel}>{head('Defence returns the try (2)', sd)}
            <PlayerGrid players={players(sd)} onPick={go} skip={{ label: 'Skip player', onPress: () => go(null) }} />
          </View>
        );
      }
      case 'fg': {
        const sd = flow.side;
        if (flow.step === 'result') return (
          <View style={c.panel}>{head('Field goal (3)', sd)}
            <TextField label="Distance in yards (optional)" value={flow.yards} onChange={(v) => setFlow({ ...flow, yards: v })} placeholder="e.g. 32" autoCapitalize="none" />
            <View style={c.row}>
              <Button label="✓ Good" color={color(sd)} style={c.flex} onPress={() => setFlow({ ...flow, good: true, step: 'kicker' })} />
              <Button label="✗ No good" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, good: false, step: 'kicker' })} />
            </View>
          </View>
        );
        return (
          <View style={c.panel}>{head(`Field goal ${flow.good ? 'good' : 'no good'} — kicker`, sd)}
            <PlayerGrid players={players(sd)} onPick={(p) => recordFg(sd, !!flow.good, flow.yards, p)} skip={{ label: 'Skip kicker', onPress: () => recordFg(sd, !!flow.good, flow.yards, null) }} />
          </View>
        );
      }
      case 'safety': {
        const sd = flow.side;
        const go = (p: Player | null) => { fire({ type: 'SAFETY', side: sd, ...credit({ type: 'safety', playerId: p?.id, playerName: p?.fullName }) }); setFlow(null); };
        return (
          <View style={c.panel}>{head('Safety (2) — made by', sd)}
            <PlayerGrid players={players(sd)} onPick={go} skip={{ label: 'Skip player', onPress: () => go(null) }} />
          </View>
        );
      }
      case 'eject': {
        const sd = flow.side;
        return (
          <View style={c.panel}>{head('Ejection (disqualified)', sd)}
            <PlayerGrid players={players(sd)} onPick={(p) => { fire({ type: 'EJECT', side: sd, ...credit({ type: 'eject', playerId: p.id, playerName: p.fullName }) }); setFlow(null); }} />
            <Text style={c.meta}>The player takes no further part. Your discipline settings decide any ban.</Text>
          </View>
        );
      }
      case 'tackle': {
        const sd = flow.side;
        return (
          <View style={c.panel}>{head(flag ? 'Flag pulled by' : 'Tackle by', sd)}
            <PlayerGrid players={players(sd)} onPick={(p) => { dispatch({ type: 'TACKLE', side: sd, payload: stamp(), ...credit({ type: 'tackle', playerId: p.id, playerName: p.fullName }) }); setFlow(null); }}
              skip={{ label: 'Skip', onPress: () => setFlow(null) }} />
          </View>
        );
      }
      case 'run': {
        const sd = flow.side;
        if (flow.step === 'who') return (
          <View style={c.panel}>{head('Run — ball carrier', sd)}
            <PlayerGrid players={players(sd)} onPick={(p) => setFlow({ ...flow, p1: p, step: 'yards' })} skip={{ label: 'Skip carrier', onPress: () => setFlow({ ...flow, p1: null, step: 'yards' }) }} />
          </View>
        );
        return (
          <View style={c.panel}>{head(`Run${flow.p1 ? ` · ${flow.p1.fullName}` : ''} — yards gained`, sd)}
            <YardsPad chips={[-3, -1, 0, 1, 2, 3, 4, 5, 6, 8, 10, 15]} onPick={(y) => play(sd, { play: 'run', yards: y, p1: who(flow.p1) })} />
          </View>
        );
      }
      case 'pass': {
        const sd = flow.side;
        if (flow.step === 'passer') return (
          <View style={c.panel}>{head('Pass complete — passer', sd)}
            <PlayerGrid players={players(sd)} onPick={(p) => setFlow({ ...flow, p1: who(p), step: 'receiver' })} skip={{ label: 'Skip passer', onPress: () => setFlow({ ...flow, p1: undefined, step: 'receiver' }) }} />
          </View>
        );
        if (flow.step === 'receiver') return (
          <View style={c.panel}>{head('Pass complete — caught by', sd)}
            <Text style={c.meta}>Passer: {flow.p1?.name ?? '—'} · <Text style={c.linkInline} accessibilityRole="button" onPress={() => setFlow({ ...flow, step: 'passer' })}>change</Text></Text>
            <PlayerGrid players={players(sd).filter((p) => p.id !== flow.p1?.id)} onPick={(p) => setFlow({ ...flow, p2: p, step: 'yards' })} skip={{ label: 'Skip receiver', onPress: () => setFlow({ ...flow, p2: null, step: 'yards' }) }} />
          </View>
        );
        return (
          <View style={c.panel}>{head(`Pass to ${flow.p2?.fullName ?? '?'} — yards`, sd)}
            <YardsPad chips={[-2, 0, 3, 5, 7, 8, 10, 12, 15, 20, 25, 30]} onPick={(y) => play(sd, { play: 'pass', yards: y, p1: flow.p1, p2: who(flow.p2) })} />
          </View>
        );
      }
      case 'sack': {
        const sd = flow.side;
        if (flow.step === 'who') return (
          <View style={c.panel}>{head(flag ? 'Sack (flag pulled behind the line) — by' : 'Sack — by', other(sd))}
            <PlayerGrid players={players(other(sd))} onPick={(p) => setFlow({ ...flow, p2: p, step: 'yards' })} skip={{ label: 'Skip player', onPress: () => setFlow({ ...flow, p2: null, step: 'yards' }) }} />
          </View>
        );
        return (
          <View style={c.panel}>{head('Sack — yards lost', sd)}
            <YardsPad chips={[-1, -2, -3, -4, -5, -6, -7, -8, -10]} onPick={(y) => play(sd, { play: 'sack', yards: -Math.abs(y), p2: who(flow.p2) })} label="Yards lost" />
          </View>
        );
      }
      case 'int': {
        const sd = flow.side;
        const def = other(sd);
        if (flow.step === 'who') return (
          <View style={c.panel}>{head('Interception — by', def)}
            <PlayerGrid players={players(def)} onPick={(p) => setFlow({ ...flow, p2: p, step: 'spot' })} skip={{ label: 'Skip player', onPress: () => setFlow({ ...flow, p2: null, step: 'spot' }) }} />
          </View>
        );
        return (
          <View style={c.panel}>{head(`${name(def)} ball — on their own`, def)}
            <SpotPad s={s} onPick={(sp) => play(sd, { play: 'int', p1: lastPasser(s, sd), p2: who(flow.p2), newSpot: sp })} />
            <Button label="🏈 Returned for a touchdown" variant="ghost" onPress={() => {
              dispatch(buildPlay(s, sd, { play: 'int', p1: lastPasser(s, sd), p2: who(flow.p2) }, stamp()));
              setFlow({ mode: 'td', side: def, step: 'scorer', how: 'int', yards: '' });
            }} />
          </View>
        );
      }
      case 'fumble': {
        const sd = flow.side;
        const def = other(sd);
        if (flow.step === 'who') return (
          <View style={c.panel}>{head('Fumble lost — who fumbled', sd)}
            <PlayerGrid players={players(sd)} onPick={(p) => setFlow({ ...flow, p1: p, step: 'rec' })} skip={{ label: 'Skip player', onPress: () => setFlow({ ...flow, p1: null, step: 'rec' }) }} />
          </View>
        );
        if (flow.step === 'rec') return (
          <View style={c.panel}>{head('Recovered by', def)}
            <PlayerGrid players={players(def)} onPick={(p) => setFlow({ ...flow, p2: p, step: 'spot' })} skip={{ label: 'Skip player', onPress: () => setFlow({ ...flow, p2: null, step: 'spot' }) }} />
          </View>
        );
        return (
          <View style={c.panel}>{head(`${name(def)} ball — on their own`, def)}
            <SpotPad s={s} onPick={(sp) => play(sd, { play: 'fumble', p1: who(flow.p1), p2: who(flow.p2), newSpot: sp })} />
            <Button label="🏈 Returned for a touchdown" variant="ghost" onPress={() => {
              dispatch(buildPlay(s, sd, { play: 'fumble', p1: who(flow.p1), p2: who(flow.p2) }, stamp()));
              setFlow({ mode: 'td', side: def, step: 'scorer', how: 'fumble', yards: '' });
            }} />
          </View>
        );
      }
      case 'punt': {
        const sd = flow.side;
        if (flow.step === 'who') return (
          <View style={c.panel}>{head('Punt — punter', sd)}
            <PlayerGrid players={players(sd)} onPick={(p) => setFlow({ ...flow, p1: p, step: 'yards' })} skip={{ label: 'Skip punter', onPress: () => setFlow({ ...flow, p1: null, step: 'yards' }) }} />
          </View>
        );
        if (flow.step === 'yards') return (
          <View style={c.panel}>{head('Punt — distance', sd)}
            <YardsPad chips={[30, 35, 38, 40, 42, 45, 48, 50, 55]} onPick={(y) => setFlow({ ...flow, gross: Math.abs(y), step: 'ret' })} label="Punt yards" />
          </View>
        );
        return (
          <View style={c.panel}>{head('Punt — return yards', other(sd))}
            <YardsPad chips={[0, 3, 5, 8, 10, 15, 20]} onPick={(r) => play(sd, { play: 'punt', yards: flow.gross ?? 40, p1: who(flow.p1), ret: r })} label="Return yards" />
            <Button label="Touchback / downed in the end zone" variant="ghost" onPress={() => play(sd, { play: 'punt', yards: flow.gross ?? 40, p1: who(flow.p1), newSpot: 20 })} />
            <Button label="🏈 Returned for a touchdown" variant="ghost" onPress={() => {
              dispatch(buildPlay(s, sd, { play: 'punt', yards: flow.gross ?? 40, p1: who(flow.p1) }, stamp()));
              setFlow({ mode: 'td', side: other(sd), step: 'scorer', how: 'punt', yards: '' });
            }} />
          </View>
        );
      }
      case 'penalty': {
        const sd = flow.side;
        if (flow.step === 'foul') return (
          <View style={c.panel}>{head('Penalty (accepted)', sd)}
            <Text style={c.small}>On the offence ({name(sd)})</Text>
            <View style={c.grid}>{foulsFor(s).filter((f) => f.on === 'off').map((f) => <SelectChip key={f.key} label={`${f.label} · ${f.yards}`} active={false} onPress={() => setFlow({ ...flow, foul: f, step: 'yards' })} />)}</View>
            <Text style={c.small}>On the defence ({name(other(sd))})</Text>
            <View style={c.grid}>{foulsFor(s).filter((f) => f.on === 'def').map((f) => <SelectChip key={f.key} label={`${f.label} · ${f.yards}`} active={false} onPress={() => setFlow({ ...flow, foul: f, step: 'yards' })} />)}</View>
            <Text style={c.meta}>A declined penalty: just don’t record it. Yardages are the usual ones for your rules — change them on the next step.</Text>
          </View>
        );
        const f = flow.foul!;
        const on = f.on === 'off' ? sd : other(sd);
        const go = (y: number) => play(sd, { play: 'penalty', yards: Math.abs(y), foul: f.label, on, autoFirst: f.autoFirst, lossOfDown: f.lossOfDown });
        return (
          <View style={c.panel}>{head(`${f.label} · on ${name(on)}`)}
            <Text style={c.meta}>{f.autoFirst ? 'Automatic first down. ' : ''}{f.lossOfDown ? 'Loss of down. ' : ''}Half the distance to the goal at most.</Text>
            <Button label={`Accept · ${f.yards} yards`} color={color(on)} onPress={() => go(f.yards)} />
            <YardsPad chips={[5, 10, 15]} onPick={go} label="Other yardage" />
          </View>
        );
      }
      case 'drive':
        return (
          <View style={c.panel}>{head('📍 Place the ball')}
            <View style={c.row}>
              {(['home', 'away'] as const).map((sd) => <SelectChip key={sd} label={`${name(sd)} ball`} active={driveIn.off === sd} onPress={() => setDriveIn({ ...driveIn, off: sd })} />)}
            </View>
            <View style={c.row}>
              {Array.from({ length: s.downs }, (_, i) => i + 1).map((n) => <SelectChip key={n} label={`Down ${n}`} active={driveIn.down === n} onPress={() => setDriveIn({ ...driveIn, down: n })} />)}
            </View>
            <View style={c.row}>
              <View style={c.flex}><TextField label={`Ball on (own yard line, 1–${s.field - 1})`} value={driveIn.spot} onChange={(v) => setDriveIn({ ...driveIn, spot: v })} autoCapitalize="none" /></View>
              <View style={c.flex}><TextField label="Yards to go" value={driveIn.toGo} onChange={(v) => setDriveIn({ ...driveIn, toGo: v })} autoCapitalize="none" /></View>
            </View>
            <Button label="Set" onPress={() => { dispatch({ type: 'SET_DRIVE', payload: { off: driveIn.off, down: driveIn.down, spot: Number(driveIn.spot) || 25, ...(driveIn.toGo.trim() ? { toGo: Number(driveIn.toGo) } : {}) } }); setFlow(null); }} />
          </View>
        );
      case 'kickoff': {
        const rec = flow.side;
        const tb = touchback(s);
        const spots = [...new Set([tb, 20, 25, 30, 35, 40])].sort((a, b) => a - b);
        return (
          <View style={c.panel}>{head(`Kickoff — ${name(rec)} start on their own`, rec)}
            <View style={c.grid}>{spots.map((sp) => <SelectChip key={sp} label={sp === tb ? `${sp} (touchback)` : String(sp)} active={false} onPress={() => { fire({ type: 'PLAY', side: rec, payload: { play: 'kickoff', newSpot: sp } }); setFlow(null); }} />)}</View>
            <SpotPad s={s} onPick={(sp) => { fire({ type: 'PLAY', side: rec, payload: { play: 'kickoff', newSpot: sp } }); setFlow(null); }} chips={[]} />
            <Button label="🏈 Returned for a touchdown" variant="ghost" onPress={() => setFlow({ mode: 'td', side: rec, step: 'scorer', how: 'kick', yards: '' })} />
          </View>
        );
      }
    }
  })();

  /* ---- the try after a touchdown (state-driven: voice and buttons alike) ---- */
  const tryPanel = s.pendingTry && !flow ? (() => {
    const sd = s.pendingTry;
    const opts: { label: string; kind: TryKind; good: boolean; a11y?: string }[] = flag
      ? [{ label: '✓ 1 pt (5 yd)', kind: 'one', good: true, a11y: '1-point conversion good' }, { label: '✗ 1 pt', kind: 'one', good: false, a11y: '1-point conversion failed' },
        { label: '✓ 2 pts (12 yd)', kind: 'two', good: true, a11y: '2-point conversion good' }, { label: '✗ 2 pts', kind: 'two', good: false, a11y: '2-point conversion failed' }]
      : [{ label: '✓ Kick good', kind: 'kick', good: true, a11y: 'Extra point kick good' }, { label: '✗ Kick no good', kind: 'kick', good: false, a11y: 'Extra point kick no good' },
        { label: '✓ 2-pt good', kind: 'two', good: true, a11y: '2-point conversion good' }, { label: '✗ 2-pt failed', kind: 'two', good: false, a11y: '2-point conversion failed' }];
    return (
      <View style={[c.panel, { borderColor: color(sd), borderWidth: 2 }]}>
        <Text style={[c.h, { color: ink(sd) }]}>Try · {name(sd)}</Text>
        <View style={c.grid}>
          {opts.map((o) => (
            <Button key={o.label} label={o.label} accessibilityLabel={o.a11y} variant={o.good ? 'primary' : 'ghost'} color={o.good ? color(sd) : undefined} style={c.half}
              onPress={() => (o.good ? setFlow({ mode: 'tryWho', side: sd, kind: o.kind, good: true }) : recordTry(sd, o.kind, false, null))} />
          ))}
        </View>
        <View style={c.row}>
          <Button label={`↩ ${name(other(sd))} return it (2)`} accessibilityLabel="Defence returns the try for 2 points" variant="ghost" style={c.flex} onPress={() => setFlow({ mode: 'defTry', side: other(sd) })} />
          <Button label="No try" variant="ghost" style={c.flex} onPress={() => fire({ type: 'TRY', side: sd, payload: { kind: flag ? 'one' : 'kick', good: false, none: true } })} />
        </View>
      </View>
    );
  })() : null;

  /* ---- play-by-play: the drive and the quick sheet ---- */
  const drivePanel = pbp && !flow && !s.pendingTry ? (() => {
    if (ot && s.decider === 'flag') return null;
    if (!d) {
      if (s.kickBy && !flag) {
        const rec = other(s.kickBy);
        return (
          <View style={c.panel}>
            <Text style={c.h}>Kickoff · {name(s.kickBy)} kick to {name(rec)}</Text>
            <Button label={`${name(rec)} ball · touchback (own ${touchback(s)})`} color={color(rec)} onPress={() => fire({ type: 'PLAY', side: rec, payload: { play: 'kickoff', newSpot: touchback(s) } })} />
            <Button label="Returned — set where" variant="ghost" onPress={() => setFlow({ mode: 'kickoff', side: rec })} />
          </View>
        );
      }
      return (
        <View style={c.panel}>
          <Text style={c.h}>{flag ? 'Who has the ball?' : 'Who receives the kickoff?'}</Text>
          <View style={c.row}>
            {(['home', 'away'] as const).map((sd) => (
              <Button key={sd} label={name(sd)} color={color(sd)} style={c.flex} onPress={() => (flag
                ? dispatch({ type: 'SET_DRIVE', payload: { off: sd, spot: s.flagStart } })
                : setFlow({ mode: 'kickoff', side: sd }))} />
            ))}
          </View>
          <Text style={c.meta}>{flag ? `Each possession starts on the team’s own ${s.flagStart}-yard line.` : 'After the coin toss / at the start of the half.'}</Text>
        </View>
      );
    }
    const sd = d.off;
    const pct = Math.max(0, Math.min(100, (d.spot / s.field) * 100));
    const linePct = Math.max(0, Math.min(100, (d.line / s.field) * 100));
    const ballCol = color(sd);
    return (
      <View style={c.panel}>
        <View style={c.flowHead}>
          <Text style={[c.h, { color: ink(sd) }]} accessibilityLiveRegion="polite">🏈 {name(sd)} · {downText(s, d)}</Text>
          <Text style={c.cancel} accessibilityRole="button" accessibilityLabel="Place the ball" onPress={() => { setDriveIn({ off: d.off, spot: String(d.spot), down: d.down, toGo: String(toGo(d)) }); setFlow({ mode: 'drive' }); }}>📍 Set</Text>
        </View>
        <Text style={c.meta}>Ball on {spotText(s, d.spot)} · {d.line >= s.field ? 'goal to go' : `line to gain ${spotText(s, d.line)}`}</Text>
        <View style={c.fieldBar} accessibilityLabel={`Ball on ${spotText(s, d.spot)}`}>
          <View style={[c.fieldFill, { width: `${pct}%`, backgroundColor: ballCol }]} />
          <View style={[c.lineMark, { left: `${linePct}%` }]} />
        </View>
        <View style={c.grid}>
          <Button label="🏃 Run" color={ballCol} style={c.third} onPress={() => setFlow({ mode: 'run', side: sd, step: 'who' })} />
          <Button label="🎯 Pass ✓" accessibilityLabel="Pass complete" color={ballCol} style={c.third} onPress={() => {
            const qb = lastPasser(s, sd);
            setFlow(qb ? { mode: 'pass', side: sd, step: 'receiver', p1: qb } : { mode: 'pass', side: sd, step: 'passer' });
          }} />
          <Button label="✗ Incomplete" accessibilityLabel="Pass incomplete" variant="ghost" style={c.third} onPress={() => {
            const qb = lastPasser(s, sd);
            if (qb) play(sd, { play: 'inc', p1: qb }); else setFlow({ mode: 'inc', side: sd });
          }} />
          <Button label="💥 Sack" variant="ghost" style={c.third} onPress={() => setFlow({ mode: 'sack', side: sd, step: 'who' })} />
          <Button label="🔄 Interception" variant="ghost" style={c.third} onPress={() => setFlow({ mode: 'int', side: sd, step: 'who' })} />
          <Button label="🏈 Fumble lost" variant="ghost" style={c.third} onPress={() => setFlow({ mode: 'fumble', side: sd, step: 'who' })} />
          {!flag ? <Button label="🦶 Punt" variant="ghost" style={c.third} onPress={() => setFlow({ mode: 'punt', side: sd, step: 'who' })} /> : null}
          {!flag ? <Button label="🥅 Field goal" variant="ghost" style={c.third} onPress={() => setFlow({ mode: 'fg', side: sd, step: 'result', yards: String(fgDistance(s, d.spot)) })} /> : null}
          <Button label="🚩 Penalty" variant="ghost" style={c.third} onPress={() => setFlow({ mode: 'penalty', side: sd, step: 'foul' })} />
          <Button label="⛔ Turnover on downs" variant="ghost" style={c.third} onPress={() => play(sd, { play: 'downs' })} />
        </View>
      </View>
    );
  })() : null;

  const sideCol = (sd: Side) => (
    <View key={sd} style={c.col}>
      <Text style={[c.team, { color: ink(sd) }]} numberOfLines={1}>{name(sd)}</Text>
      <Button label="🏈 Touchdown" color={color(sd)} onPress={() => setFlow({ mode: 'td', side: sd, step: 'scorer', how: 'run', yards: '' })} />
      {!flag ? <Button label="🥅 Field goal" variant="ghost" onPress={() => setFlow({ mode: 'fg', side: sd, step: 'result', yards: '' })} /> : null}
      <Button label="🛡️ Safety (2)" accessibilityLabel={`Safety, 2 points to ${name(sd)}`} variant="ghost" onPress={() => setFlow({ mode: 'safety', side: sd })} />
    </View>
  );

  // overtime: coin toss / whose possession
  const otPanel = ot && !flow ? (
    <View style={c.panel}>
      <Text style={c.h}>{periodLong(s, s.period)} · {s.decider === 'nfl' || s.decider === 'nfl_playoff' ? 'both teams get the ball, then next score wins'
        : s.decider === 'flag' ? 'one conversion try each, until one leads' : `each team from the ${s.otSpot}, until one leads`}</Text>
      {!s.otFirst ? (
        <>
          <Text style={c.meta}>After the coin toss — who has the ball first?</Text>
          <View style={c.row}>
            {(['home', 'away'] as const).map((sd) => <Button key={sd} label={`${name(sd)} first`} color={color(sd)} style={c.flex} onPress={() => dispatch({ type: 'OT_FIRST', payload: { first: sd } })} />)}
          </View>
        </>
      ) : otOffence ? (
        <>
          <Text style={[c.meta, { color: ink(otOffence) }]}>Possession: {name(otOffence)} ({s.otPoss.length % 2 === 0 ? 'first' : 'second'} of this round)</Text>
          {s.decider === 'flag' && !s.pendingTry ? (
            <View style={c.grid}>
              {(['one', 'two'] as const).map((k) => (
                <React.Fragment key={k}>
                  <Button label={`✓ ${k === 'one' ? '1 pt' : '2 pts'}`} accessibilityLabel={`${k === 'one' ? '1-point' : '2-point'} try good`} color={color(otOffence)} style={c.half} onPress={() => setFlow({ mode: 'tryWho', side: otOffence, kind: k, good: true })} />
                  <Button label={`✗ ${k === 'one' ? '1 pt' : '2 pts'}`} accessibilityLabel={`${k === 'one' ? '1-point' : '2-point'} try failed`} variant="ghost" style={c.half} onPress={() => recordTry(otOffence, k, false, null)} />
                </React.Fragment>
              ))}
            </View>
          ) : !s.pendingTry ? (
            <Button label={`⛔ ${name(otOffence)}: no score — possession over`} accessibilityLabel={`${name(otOffence)} possession over without a score`} variant="ghost" onPress={() => fire({ type: 'POSS_END', side: otOffence })} />
          ) : null}
        </>
      ) : null}
    </View>
  ) : null;

  const len = periodLen(s, s.period);
  const noClock = clockless(s, s.period);
  return (
    <View style={c.wrap}>
      {editAt ? <BackfillBar at={eventWhen(s, { period: editAt.period, psec: editAt.psec })} onLive={() => setFlow(null)} /> : null}
      <View style={c.panel}>
        <View style={c.clockRow}>
          <View style={{ flex: 1 }}>
            <Text style={c.small}>{periodLong(s, s.period)}</Text>
            <Text style={[c.clock, !noClock && remainingSec(s, now) === 0 && periodStarted(s) ? { color: theme.colors.danger } : null]}>{noClock ? 'No clock' : clockFace(s, now)}</Text>
          </View>
          {!noClock ? <Button label={running(s) ? '⏸ Stop' : periodStarted(s) ? '▶ Resume' : s.period === 1 ? '▶ Kickoff' : `▶ Start ${periodName(s, s.period)}`} variant={running(s) ? 'ghost' : 'primary'} onPress={startStop} /> : null}
        </View>
        <View style={c.row}>
          {/* the game's end sits at the bottom of the controls (SD-106) */}
          {!last ? <Button label={`⏭ End ${periodName(s, s.period)}`} variant="ghost" style={c.flex} disabled={!periodStarted(s)} onPress={() => void endPeriod()} /> : null}
          {!noClock ? <Button label="⏱ Set clock" variant="ghost" style={c.flex} onPress={() => setSetting((v) => !v)} /> : null}
        </View>
        {setting ? (
          <View style={c.row}>
            <View style={c.flex}><TextField label="Time left (m:ss)" value={clockInput} onChange={setClockInput} placeholder={clockFace(s, now)} autoCapitalize="none" /></View>
            <Button label="Set" onPress={applyClock} />
          </View>
        ) : null}
        {s.warned.includes(s.period) && !isOT(s, s.period) ? <Text style={c.short}>Two-minute warning given</Text> : null}
        {!noClock && len && remainingSec(s, now) === 0 && periodStarted(s) ? <Text style={c.short}>Time is up — end the {periodName(s, s.period)} when the play is over.</Text> : null}
        <View style={c.row}>
          {(['home', 'away'] as const).map((sd) => {
            const left = timeoutsLeft(s, sd);
            return (
              <Button key={sd} label={`⏸ ${name(sd)} TO · ${left} left`} accessibilityLabel={`Timeout ${name(sd)}, ${left} left`} variant="ghost" style={c.flex} disabled={left <= 0}
                onPress={() => fire({ type: 'TIMEOUT', side: sd })} />
            );
          })}
        </View>
      </View>

      {otPanel}
      {flowPanel ?? tryPanel ?? drivePanel}
      {!flowPanel && !tryPanel && !(ot && s.decider === 'flag') ? <View style={c.cols}>{sideCol('home')}{sideCol('away')}</View> : null}
      {!flowPanel ? (
        <View style={c.row}>
          {(['home', 'away'] as const).map((sd) => <Button key={sd} label={`🚫 Ejection · ${name(sd)}`} variant="ghost" style={c.flex} onPress={() => setFlow({ mode: 'eject', side: sd })} />)}
        </View>
      ) : null}

      <EditList s={s} show={showEdit} setShow={setShowEdit} onRemove={remove} onEdit={edit} homeName={homeName} awayName={awayName} />
      {last ? <Button label="🏁 End of game" variant="danger" disabled={!periodStarted(s)} onPress={() => void endPeriod()} /> : null}
      {last && !periodStarted(s) ? <Text style={c.gk}>Start {periodName(s, s.period)} first — End of game unlocks once it’s under way.</Text> : null}
    </View>
  );
};

/** Where a new offence starts: chips on its own yard line, or type it. */
function SpotPad({ s, onPick, chips }: { s: AFState; onPick: (spot: number) => void; chips?: number[] }) {
  const [v, setV] = useState('');
  const list = chips ?? (s.variant === 'flag' ? [5, 10, 15, 20, 25] : [10, 20, 25, 30, 35, 40, 50]);
  const n = Math.round(Number(v));
  return (
    <View style={{ gap: theme.spacing(2) }}>
      {list.length ? <View style={c.grid}>{list.map((x) => <SelectChip key={x} label={`Own ${x}`} active={false} onPress={() => onPick(x)} />)}</View> : null}
      <View style={c.row}>
        <View style={c.flex}><TextField label={`Own yard line (1–${s.field - 1})`} value={v} onChange={setV} placeholder="e.g. 28" autoCapitalize="none" /></View>
        <Button label="Go" disabled={!v.trim() || !(n >= 1 && n < s.field)} onPress={() => { onPick(n); setV(''); }} />
      </View>
    </View>
  );
}

/** The scorer's "Correct the timeline" list: remove a moment, or re-enter it. */
function EditList({ s, show, setShow, onRemove, onEdit, homeName, awayName }: {
  s: AFState; show: boolean; setShow: (v: boolean) => void; onRemove: (e: AFEvent) => void; onEdit?: (e: AFEvent) => void; homeName: string; awayName: string;
}) {
  if (!s.events.length) return null;
  return (
    <View style={c.panel}>
      <Text style={c.link} accessibilityRole="button" onPress={() => setShow(!show)}>{show ? 'Hide' : '✎ Correct the timeline'}</Text>
      {show ? [...s.events].reverse().slice(0, 40).map((e) => {
        const d = describeEvent(e, s);
        const when = eventWhen(s, e);
        return (
          <View key={e.id} style={c.editRow}>
            <Text style={c.editWhen}>{when}</Text>
            <Text style={c.editLabel} numberOfLines={2}>{d.icon} {d.label} · {e.side === 'home' ? homeName : awayName}{d.detail ? ` · ${d.detail}` : ''}</Text>
            {onEdit && (e.type === 'td' || e.type === 'fg' || e.type === 'safety' || e.type === 'try') ? <RowAction label="✎ Edit" tone="edit" a11y={`Edit ${d.label}`} onPress={() => onEdit(e)} /> : null}
            <RowAction label="✕" tone="remove" a11y={`Remove ${d.label}`} onPress={() => void confirmRemove(`${d.label} (${when})`, () => onRemove(e),
              pointsOf(e) ? 'The score and player stats re-adjust.' : e.type === 'play' ? 'The ball isn’t moved back — use 📍 Set to place it.' : undefined)} />
          </View>
        );
      }) : null}
    </View>
  );
}

/* ------------------------------- live views -------------------------------- */

const LiveClock: NonNullable<SportPlugin<AFState>['LiveClock']> = ({ state }) => {
  const s = state as AFState;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running(s)) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.clock?.since, s.ended]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = Date.now();
  const face = clockFace(s, now);
  const label = s.ended ? (s.plan.includes('ot') ? 'Final (OT)' : 'Final')
    : !periodStarted(s) ? (s.period === 1 ? '—' : `${periodName(s, s.period)} next`) : `${periodName(s, s.period)}${face ? ` ${face}` : ''}`;
  return (
    <View style={{ alignItems: 'center', gap: theme.spacing(1), flex: 1, minWidth: 0 }}>
      <View style={c.clockRow2}>
        <View style={[c.dot, { backgroundColor: running(s) ? theme.colors.danger : theme.colors.textMuted }]} />
        <Text style={c.clockSmall}>{label}</Text>
      </View>
      {!s.ended && s.drive ? <Text style={c.meta} numberOfLines={1}>{downText(s, s.drive, true)}</Text> : null}
    </View>
  );
};

/** Points per quarter / half (and overtime), the live period highlighted. */
const AFScoreboard: NonNullable<SportPlugin<AFState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live }) => {
  const s = state as AFState;
  const n = Math.max(totalPeriods(s), s.period);
  const columns = Array.from({ length: n }, (_, i) => ({ label: periodName(s, i + 1), highlight: !s.ended && i + 1 === s.period }));
  const pts = (sd: Side, p: number) => s.events.filter((e) => e.side === sd && e.period === p).reduce((a, e) => a + pointsOf(e), 0);
  const cells = (sd: Side) => Array.from({ length: n }, (_, i) => (i + 1 <= s.period || s.ended ? String(pts(sd, i + 1)) : ''));
  const r = result(s);
  return (
    <LineScoreboard
      live={live}
      clock={<LiveClock state={s} />}
      leadLabel="PTS"
      columns={columns}
      winner={r && r.winner !== 'draw' ? r.winner : undefined}
      home={{ name: homeName, color: homeColor ?? theme.colors.home, lead: String(s.home), cells: cells('home') }}
      away={{ name: awayName, color: awayColor ?? theme.colors.away, lead: String(s.away), cells: cells('away') }}
    />
  );
};

const LiveExtras: NonNullable<SportPlugin<AFState>['LiveExtras']> = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }) => {
  const s = state as AFState;
  const plays = s.mode === 'pbp' ? afPlays(s, 15) : [];
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Text style={c.h}>Scoring summary</Text>
      <LiveTimeline events={afTimeline(s)} homeColor={homeColor} awayColor={awayColor} emptyText="No scores yet." homeRoster={homeRoster} awayRoster={awayRoster} onPlayer={onPlayer} />
      {plays.length ? (
        <>
          <Text style={c.h}>Play by play</Text>
          {plays.map((p) => (
            <View key={p.id} style={c.editRow}>
              <Text style={c.editWhen}>{p.when}</Text>
              <Text style={c.editLabel}>{p.side === 'home' ? homeName : awayName} · {p.text}</Text>
            </View>
          ))}
        </>
      ) : null}
      <Text style={c.h}>Box score</Text>
      <MatchBoxScore sport="american_football" source={afBox(s, { homeRoster, awayRoster, homeName, awayName })} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} />
    </View>
  );
};

/* --------------------------------- plugin ---------------------------------- */

export const americanFootballPlugin: SportPlugin<AFState> = {
  id: 'american_football',
  name: 'American football',
  icon: '🏈',
  archetype: 'goal-time',
  createInitialState: init,
  reducer,
  isComplete,
  result,
  summary: (s) => ({
    homeScore: String(s.home),
    awayScore: String(s.away),
    statusLine: s.ended ? (s.plan.includes('ot') ? 'Final (OT)' : 'Final')
      : !periodStarted(s) && s.period > 1 ? ((s.periods === 4 ? s.period === 3 : s.period === 2) ? 'Half-time' : `End of ${periodName(s, s.period - 1)}`)
      : periodLong(s, s.period)[0].toUpperCase() + periodLong(s, s.period).slice(1),
    detailLine: s.drive && !s.ended ? downText(s, s.drive, true) : undefined,
  }),
  scoreLine: afScoreLine,
  statTotals: afTotals,
  undoLabel: afUndoLabel,
  tickerDetail: afTickerDetail,
  tickerFlash: afTickerFlash,
  voice: {
    hints: ['touchdown {name}', 'touchdown pass {name} from {name} 24', 'extra point good', 'two point good {name}', 'field goal good 32 {name}', 'safety home', 'timeout away', 'pass complete to {name} for 12', 'run {name} for 5', 'end quarter'],
    parse: afVoice, ends: afVoiceEnds,
  },
  ScoringControls,
  LiveClock,
  Scoreboard: AFScoreboard,
  LiveExtras,
  formation: (perSide) => afFormation(perSide),
  Court: AFField,
  liveSettings: AF_LIVE_SETTINGS,
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'flag', onCreate: true,
      options: [
        ...Object.entries(AF_PRESETS).map(([value, p]) => ({ value, label: p.label, set: p.set })),
        { value: 'custom', label: 'Custom' },
      ],
    },
    {
      key: 'mode', label: 'Scoring detail', type: 'choice', default: 'score', onCreate: true,
      options: [
        { value: 'score', label: 'Scores only (fast)' },
        { value: 'pbp', label: 'Play by play (downs, yards, stats)' },
      ],
    },
    { key: 'variant', label: 'Game', type: 'choice', default: 'flag', advanced: true, options: [{ value: 'flag', label: 'Flag (no contact)' }, { value: 'tackle', label: 'Tackle' }] },
    { key: 'playersPerSide', label: 'Players per side', type: 'count', default: 5, min: 4, max: 11, advanced: true },
    { key: 'periods', label: 'Periods', type: 'choice', default: 2, advanced: true, options: [{ value: 2, label: '2 halves' }, { value: 4, label: '4 quarters' }] },
    { key: 'periodMinutes', label: 'Minutes per half / quarter', type: 'number', default: 20, min: 1, max: 30, advanced: true },
    { key: 'timeoutsPerHalf', label: 'Timeouts per team per half', type: 'number', default: 2, min: 0, max: 5, advanced: true, hint: 'NFL / NCAA / NFHS: 3 · IFAF flag: 2 (verify)' },
    { key: 'twoMinute', label: 'Two-minute warning (NFL)', type: 'toggle', default: false, advanced: true, hint: 'the clock stops at 2:00 of the 2nd and 4th quarters' },
    { key: 'trackTackles', label: 'Ask who made the tackle / flag pull (play by play)', type: 'toggle', default: false, advanced: true },
    {
      key: 'decider', label: 'If tied at the end of regulation', type: 'choice', default: 'flag',
      options: [
        { value: 'none', label: 'The tie stands' },
        { value: 'standard', label: 'Standard for these rules' },
        { value: 'flag', label: 'Flag: conversion tries' },
        { value: 'kansas', label: 'Kansas (NFHS / college)' },
        { value: 'nfl', label: 'NFL regular season (may tie)' },
        { value: 'nfl_playoff', label: 'NFL playoffs' },
      ],
      hint: 'flag: one try each (1 from the 5 / 2 from the 12) until one leads · Kansas: one possession each from the 10 (college 25) · NFL: 10 min, both get the ball, then sudden death · a knockout game always needs a winner',
    },
    { key: 'otSpot', label: 'Kansas overtime: start yards from goal', type: 'number', default: 10, min: 1, max: 50, advanced: true, hint: 'NFHS 10 · NCAA 25' },
    { key: 'otMinutes', label: 'NFL overtime minutes', type: 'number', default: 10, min: 1, max: 15, advanced: true },
    {
      key: 'flagTurnover', label: 'Flag: after a failed series the other team starts', type: 'choice', default: 'own5', advanced: true,
      options: [{ value: 'own5', label: 'On its own 5-yard line' }, { value: 'spot', label: 'Where the ball was dead' }],
    },
  ],
};

const c = StyleSheet.create({
  wrap: { gap: theme.spacing(3) },
  panel: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  row: { flexDirection: 'row', gap: theme.spacing(2), alignItems: 'flex-end', flexWrap: 'wrap' },
  flex: { flex: 1, minWidth: 120 },
  half: { flexBasis: '46%', flexGrow: 1 },
  third: { flexBasis: '30%', flexGrow: 1 },
  cols: { flexDirection: 'row', gap: theme.spacing(2) },
  col: { flex: 1, gap: theme.spacing(2), minWidth: 0 },
  team: { fontSize: theme.font.small, fontWeight: '800', textAlign: 'center' },
  h: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800', flexShrink: 1 },
  small: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  clock: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '900', fontVariant: ['tabular-nums'] },
  clockRow2: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  clockSmall: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '900', fontVariant: ['tabular-nums'] },
  dot: { width: 9, height: 9, borderRadius: 5 },
  gk: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', textAlign: 'center' },
  short: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '800', textAlign: 'center' },
  flowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  cancel: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', paddingHorizontal: theme.spacing(2), paddingVertical: theme.spacing(3), minHeight: 44 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  pchip: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), minHeight: 44, paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceAlt, maxWidth: '100%' },
  pnum: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  pname: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', flexShrink: 1 },
  skip: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: 'transparent' },
  skipTxt: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  fieldBar: { height: 14, borderRadius: 7, backgroundColor: theme.colors.surfaceAlt, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border },
  fieldFill: { height: '100%', opacity: 0.85 },
  lineMark: { position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: theme.colors.accent },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800', paddingVertical: theme.spacing(3), minHeight: 44 },
  linkInline: { color: theme.colors.primary, fontWeight: '800' },
  editRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  editWhen: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '800', width: 64 },
  editLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
});
