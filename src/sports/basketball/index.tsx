/**
 * Basketball plugin — archetype: running-points, with the same live-event depth
 * as football: a per-quarter game clock, play-by-play timeline, player-attributed
 * baskets (1/2/3), rebounds, assists and fouls, and a live box score.
 *
 * The pure reducer can't read the clock, so the controls stamp each event's
 * quarter + minute via `payload`.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip } from '../../components/ui';
import { Timeline } from './Timeline';
import { BoxScore } from './BoxScore';
import { BB_META, type BBEvent } from './events';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';
import { basketballVoice } from '../voiceParsers';
import { courtFormation, makeCourt } from '../courts';

export interface BasketballState {
  home: number;
  away: number;
  quarter: number; // 1..4
  startedAt?: number; // clock for the current quarter
  events: BBEvent[];
  seq: number;
  ended: boolean;
  /** personal fouls that disqualify a player (format: foulsToFoulOut) */
  foulOutLimit: number;
  /** team fouls in a quarter that put the opponent in the bonus (format: foulsForBonus) */
  foulsForBonus: number;
  /** overtime period length in minutes (informational — the clock counts up) */
  overtimeMinutes: number;
  /** regulation periods before overtime: 4 quarters (default) or 2 halves */
  regPeriods: number;
  /** minutes per regulation period (informational — the clock counts up) */
  periodMinutes: number;
  /** first-to-N scoring (3×3 = 21); 0 = timed game decided by the clock */
  targetPoints: number;
  /** margin needed to clinch a first-to-N game (3×3 = win by 2) */
  winBy: number;
  /** shot-clock seconds (informational — not enforced by the manual clock) */
  shotClock: number;
}

const init = (config?: Record<string, unknown>): BasketballState => ({
  home: 0, away: 0, quarter: 1, events: [], seq: 0, ended: false,
  foulOutLimit: Number(config?.foulsToFoulOut ?? 5),
  foulsForBonus: Number(config?.foulsForBonus ?? 5),
  overtimeMinutes: Number(config?.overtimeMinutes ?? 5),
  regPeriods: Number(config?.regPeriods ?? 4),
  periodMinutes: Number(config?.periodMinutes ?? 10),
  targetPoints: Number(config?.targetPoints ?? 0),
  winBy: Number(config?.winBy ?? 2),
  shotClock: Number(config?.shotClock ?? 24),
});

/** Q1..Qn (or H1/H2 for a two-half game), then OT, OT2… for overtime periods. */
export const periodLabel = (q: number, regPeriods = 4): string =>
  q <= regPeriods ? `${regPeriods === 2 ? 'H' : 'Q'}${q}` : q === regPeriods + 1 ? 'OT' : `OT${q - regPeriods}`;

/** Fouls a player (by name) has committed so far — drives the foul-out rule. */
export const foulCount = (s: BasketballState, name?: string): number =>
  name ? s.events.filter((e) => e.type === 'foul' && e.playerName === name).length : 0;
/** A player is fouled out once they reach the limit. */
export const isFouledOut = (s: BasketballState, name?: string): boolean =>
  s.foulOutLimit > 0 && foulCount(s, name) >= s.foulOutLimit;
/** Team fouls committed by one side in the current quarter. */
export const teamFoulsThisQuarter = (s: BasketballState, side: 'home' | 'away'): number =>
  s.events.filter((e) => e.type === 'foul' && e.side === side && e.quarter === s.quarter).length;
/** A side is in the bonus (shoots free throws) once the OTHER side hits the team-foul limit this quarter. */
export const inBonus = (s: BasketballState, side: 'home' | 'away'): boolean =>
  s.foulsForBonus > 0 && teamFoulsThisQuarter(s, side === 'home' ? 'away' : 'home') >= s.foulsForBonus;

export function currentMinute(s: BasketballState): number {
  if (!s.startedAt) return 0;
  return Math.floor((Date.now() - s.startedAt) / 60000);
}

const push = (s: BasketballState, e: Omit<BBEvent, 'id' | 'quarter'>, quarter: number): BasketballState => ({
  ...s,
  seq: s.seq + 1,
  events: [...s.events, { ...e, id: s.seq + 1, quarter }],
});

const reducer = (s: BasketballState, a: ScoreAction): BasketballState => {
  if (s.ended && a.type !== 'END') return s;
  const minute = Number(a.payload?.minute ?? currentMinute(s));
  const quarter = Number(a.payload?.quarter ?? s.quarter);
  const name = a.attribution?.playerName;
  switch (a.type) {
    case 'KICKOFF':
      return { ...s, startedAt: Number(a.payload?.at) };
    case 'SCORE': {
      if (!a.side) return s;
      // a disqualified player takes no further part
      if (isFouledOut(s, name)) return s;
      const pts = Number(a.payload?.points ?? 0);
      const scored = { ...s, [a.side]: s[a.side] + pts } as BasketballState;
      const logged = push(scored, { minute, type: 'score', side: a.side, playerName: name, points: pts }, quarter);
      // First-to-N games (3×3 to 21, streetball): reaching the target with the
      // required margin ends the game immediately.
      const opp = a.side === 'home' ? 'away' : 'home';
      if (logged.targetPoints > 0 && logged[a.side] >= logged.targetPoints && logged[a.side] - logged[opp] >= logged.winBy) {
        return { ...logged, ended: true, startedAt: undefined };
      }
      return logged;
    }
    case 'REBOUND':
      return a.side && !isFouledOut(s, name) ? push(s, { minute, type: 'rebound', side: a.side, playerName: name }, quarter) : s;
    case 'ASSIST':
      return a.side && !isFouledOut(s, name) ? push(s, { minute, type: 'assist', side: a.side, playerName: name }, quarter) : s;
    case 'FOUL':
      // count the foul, but never beyond the limit (already fouled out)
      return a.side && !isFouledOut(s, name) ? push(s, { minute, type: 'foul', side: a.side, playerName: name }, quarter) : s;
    case 'REMOVE_EVENT': {
      // Surgically remove one logged play, reversing its effect on the score.
      // Its stat line is reversed by the negative attribution on this action.
      const id = Number(a.payload?.id);
      const ev = s.events.find((e) => e.id === id);
      if (!ev) return s;
      const next = { ...s, events: s.events.filter((e) => e.id !== id) } as BasketballState;
      return ev.type === 'score' ? { ...next, [ev.side]: Math.max(0, next[ev.side] - (ev.points ?? 0)) } as BasketballState : next;
    }
    case 'NEXT_QUARTER':
      return s.quarter < s.regPeriods ? { ...s, quarter: s.quarter + 1, startedAt: undefined } : s;
    case 'START_OVERTIME':
      // A game level at the end of regulation (or an OT period) plays another
      // overtime period; the running score carries over. Repeats until decided.
      return s.home === s.away ? { ...s, quarter: s.quarter + 1, startedAt: undefined } : s;
    case 'END':
      return { ...s, ended: true, startedAt: undefined };
    default:
      return s;
  }
};

/* ------------------------------- Controls ---------------------------------- */

const Row = ({ label, roster, onPick, disabledFor }: { label: string; roster: Player[]; onPick: (p: Player) => void; disabledFor?: (p: Player) => boolean }) => (
  <View style={{ gap: theme.spacing(2) }}>
    <Text style={ctrl.label}>{label}</Text>
    {roster.length > 0 ? (
      <View style={ctrl.chips}>
        {roster.map((p) => (
          <SelectChip key={p.id} label={p.fullName} active={false} disabled={disabledFor?.(p)} onPress={() => onPick(p)} />
        ))}
      </View>
    ) : (
      <Text style={ctrl.meta}>No roster set.</Text>
    )}
  </View>
);

const ScoringControls: SportPlugin<BasketballState>['ScoringControls'] = ({
  state,
  dispatch,
  homeName,
  awayName,
  homeRoster = [],
  awayRoster = [],
}) => {
  const [sel, setSel] = useState<{ home?: Player; away?: Player }>({});
  // Timeline correction: edit one past play in place, or backfill a missed one.
  const [showEdit, setShowEdit] = useState(false);
  const [edit, setEdit] = useState<BBEvent | null>(null); // the play being re-entered
  const [editSel, setEditSel] = useState<Player | null>(null); // scorer chosen while editing a basket
  const [backfillQ, setBackfillQ] = useState<number | null>(null); // stamp new plays into this quarter

  // While editing, stamp the re-entered play at the original moment; while
  // backfilling, at the chosen quarter; otherwise live.
  const stampFor = () =>
    edit ? { quarter: edit.quarter, minute: edit.minute } : backfillQ != null ? { quarter: backfillQ, minute: 0 } : { quarter: state.quarter, minute: currentMinute(state) };
  const fire = (action: ScoreAction) =>
    dispatch({ ...action, payload: { ...action.payload, ...stampFor() } });

  const score = (side: 'home' | 'away', pts: number) => {
    const p = sel[side];
    fire({
      type: 'SCORE',
      side,
      payload: { points: pts },
      attribution: p ? { playerId: p.id, stat: 'points', by: pts, playerName: p.fullName } : undefined,
    });
  };
  const stat = (side: 'home' | 'away', type: string, key: string, p: Player) =>
    fire({ type, side, attribution: { playerId: p.id, stat: key, playerName: p.fullName } });

  // ----- Correct the timeline: remove / edit one specific past play -----
  const STAT_KEY: Record<string, string> = { rebound: 'rebounds', assist: 'assists', foul: 'fouls' };
  const rosterId = (nm?: string) => [...homeRoster, ...awayRoster].find((p) => p.fullName === nm)?.id;
  const removeEvent = (e: BBEvent) => {
    const pid = rosterId(e.playerName);
    const attribution = pid
      ? e.type === 'score'
        ? { playerId: pid, stat: 'points', by: -(e.points ?? 0), playerName: e.playerName }
        : STAT_KEY[e.type]
          ? { playerId: pid, stat: STAT_KEY[e.type], by: -1, playerName: e.playerName }
          : undefined
      : undefined;
    dispatch({ type: 'REMOVE_EVENT', side: e.side, payload: { id: e.id }, attribution });
  };
  // Edit = remove the old play, then re-enter it stamped at the same moment so
  // the score and every player tally re-adjust to match.
  const editEvent = (e: BBEvent) => { removeEvent(e); setShowEdit(false); setEditSel(null); setEdit(e); };
  const commitEdit = (p: Player, points?: number) => {
    if (!edit) return;
    if (edit.type === 'score') fire({ type: 'SCORE', side: edit.side, payload: { points }, attribution: { playerId: p.id, stat: 'points', by: points, playerName: p.fullName } });
    else fire({ type: edit.type.toUpperCase(), side: edit.side, attribution: { playerId: p.id, stat: STAT_KEY[edit.type], playerName: p.fullName } });
    setEdit(null); setEditSel(null);
  };

  // Foul-out enforcement (format: foulsToFoulOut). A disqualified player is
  // greyed out everywhere and can't be credited further actions.
  const fouledOut = (p: Player) => isFouledOut(state, p.fullName);
  const fouledOutNames = [...homeRoster, ...awayRoster].filter(fouledOut).map((p) => p.fullName);
  // Team-foul bonus (format: foulsForBonus): once a side reaches the team-foul
  // limit in a quarter, the opponent shoots free throws.
  const homeBonus = inBonus(state, 'home');
  const awayBonus = inBonus(state, 'away');

  // Shown while any overtime period is live (quarter 5+).
  const otBanner = state.quarter > state.regPeriods ? (
    <View style={ctrl.otBanner}>
      <Text style={ctrl.otTitle}>🏀 OVERTIME{state.quarter > 5 ? ` ${state.quarter - 4}` : ''}</Text>
      <Text style={ctrl.otMeta}>{state.overtimeMinutes}-minute period · score carries over · still level ⇒ another OT</Text>
    </View>
  ) : null;

  if (!state.startedAt && !state.ended && !edit) {
    return (
      <View style={{ gap: theme.spacing(3) }}>
        {otBanner}
        <Text style={ctrl.meta}>Tip off {periodLabel(state.quarter, state.regPeriods)} to start the clock.</Text>
        <Button label={`▶ Start ${periodLabel(state.quarter, state.regPeriods)}`} onPress={() => dispatch({ type: 'KICKOFF', payload: { at: Date.now() } })} />
      </View>
    );
  }

  // In-place edit of one past play: re-pick the player (and points, for a basket)
  // stamped at the original moment. The old play was already reversed on entry.
  if (edit) {
    const roster = edit.side === 'home' ? homeRoster : awayRoster;
    const nm = edit.side === 'home' ? homeName : awayName;
    return (
      <View style={ctrl.editPanel}>
        <View style={ctrl.editHead}>
          <Text style={ctrl.label}>✎ Re-enter {BB_META[edit.type].label} — {nm}</Text>
          <Button label="Cancel" variant="ghost" onPress={() => { setEdit(null); setEditSel(null); }} />
        </View>
        <Text style={ctrl.editBanner}>Re-entering the Q{edit.quarter} {edit.minute}&apos; moment — your pick replaces the old one.</Text>
        <Text style={ctrl.meta}>{edit.type === 'score' ? 'Who scored?' : 'Which player?'}</Text>
        <View style={ctrl.chips}>
          {roster.map((p) => (
            <SelectChip key={p.id} label={p.fullName} active={editSel?.id === p.id} disabled={fouledOut(p)}
              onPress={() => (edit.type === 'score' ? setEditSel(p) : commitEdit(p))} />
          ))}
        </View>
        {edit.type === 'score' && editSel && (
          <View style={ctrl.row}>
            {[1, 2, 3].map((n) => (
              <Button key={n} label={`+${n}`} variant={edit.side} style={ctrl.flex} onPress={() => commitEdit(editSel, n)} />
            ))}
          </View>
        )}
      </View>
    );
  }

  const ScoreSide = ({ side, name, variant }: { side: 'home' | 'away'; name: string; variant: 'home' | 'away' }) => {
    const roster = side === 'home' ? homeRoster : awayRoster;
    const selected = sel[side];
    return (
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>🏀 Basket — {name}{selected ? ` · ${selected.fullName}` : ''}</Text>
        {roster.length > 0 && (
          <View style={ctrl.chips}>
            {roster.map((p) => (
              <SelectChip key={p.id} label={fouledOut(p) ? `${p.fullName} 🚫` : p.fullName} active={selected?.id === p.id} disabled={fouledOut(p)}
                onPress={() => setSel((s) => ({ ...s, [side]: selected?.id === p.id ? undefined : p }))} />
            ))}
          </View>
        )}
        <View style={ctrl.row}>
          {[1, 2, 3].map((n) => (
            <Button key={n} label={`+${n}`} variant={variant} style={ctrl.flex} onPress={() => score(side, n)} />
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={{ gap: theme.spacing(4) }}>
      {otBanner}
      {fouledOutNames.length > 0 && (
        <Text style={ctrl.fouledOut}>🚫 Fouled out ({state.foulOutLimit} fouls): {fouledOutNames.join(', ')}</Text>
      )}
      {(homeBonus || awayBonus) && (
        <Text style={ctrl.bonus}>
          🎯 BONUS · {homeBonus ? homeName : awayName} shoots free throws ({state.foulsForBonus} team fouls on {homeBonus ? awayName : homeName} this quarter)
        </Text>
      )}
      <ScoreSide side="home" name={homeName} variant="home" />
      <ScoreSide side="away" name={awayName} variant="away" />

      {(homeBonus || awayBonus) && (
        <View style={ctrl.row}>
          {homeBonus && <Button label={`🎯 Free throw +1 — ${homeName}`} variant="home" style={ctrl.flex} onPress={() => score('home', 1)} />}
          {awayBonus && <Button label={`🎯 Free throw +1 — ${awayName}`} variant="away" style={ctrl.flex} onPress={() => score('away', 1)} />}
        </View>
      )}

      <Row label={`🔁 Rebound — ${homeName}`} roster={homeRoster} onPick={(p) => stat('home', 'REBOUND', 'rebounds', p)} disabledFor={fouledOut} />
      <Row label={`🔁 Rebound — ${awayName}`} roster={awayRoster} onPick={(p) => stat('away', 'REBOUND', 'rebounds', p)} disabledFor={fouledOut} />
      <Row label={`🅰️ Assist — ${homeName}`} roster={homeRoster} onPick={(p) => stat('home', 'ASSIST', 'assists', p)} disabledFor={fouledOut} />
      <Row label={`🅰️ Assist — ${awayName}`} roster={awayRoster} onPick={(p) => stat('away', 'ASSIST', 'assists', p)} disabledFor={fouledOut} />
      <Row label={`🟨 Foul — ${homeName}`} roster={homeRoster} onPick={(p) => stat('home', 'FOUL', 'fouls', p)} disabledFor={fouledOut} />
      <Row label={`🟨 Foul — ${awayName}`} roster={awayRoster} onPick={(p) => stat('away', 'FOUL', 'fouls', p)} disabledFor={fouledOut} />

      {/* ⏪ Backfill a play the scorer missed earlier — stamp it into a past quarter. */}
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>⏪ Backfill a missed play</Text>
        {backfillQ == null ? (
          <>
            <Text style={ctrl.meta}>Missed a basket or foul earlier? Pick the quarter — everything you log is stamped there until you go back to live.</Text>
            <View style={ctrl.chips}>
              {Array.from({ length: Math.min(state.quarter, 8) }, (_, i) => i + 1).map((q) => (
                <SelectChip key={q} label={periodLabel(q, state.regPeriods)} active={false} onPress={() => setBackfillQ(q)} />
              ))}
            </View>
          </>
        ) : (
          <View style={ctrl.addedBox}>
            <Text style={ctrl.label}>⏪ Backfilling into {periodLabel(backfillQ, state.regPeriods)}</Text>
            <Text style={ctrl.meta}>Every play you log now is stamped in {periodLabel(backfillQ, state.regPeriods)}. Log it above, then go back to live.</Text>
            <Button label="Back to live scoring" variant="ghost" onPress={() => setBackfillQ(null)} />
          </View>
        )}
      </View>

      {/* 🗓 Correct the timeline — remove or edit one specific past play. */}
      {state.events.length > 0 && (
        <View style={{ gap: theme.spacing(2) }}>
          <View style={ctrl.editHead}>
            <Text style={ctrl.label}>🗓 Correct the timeline</Text>
            <Button label={showEdit ? 'Done' : 'Edit'} variant="ghost" onPress={() => setShowEdit((v) => !v)} />
          </View>
          {showEdit && (
            <View style={{ gap: theme.spacing(1) }}>
              <Text style={ctrl.meta}>Tap Edit to re-pick the player/points (stamped at the same moment — every tally re-adjusts), or Remove to delete it.</Text>
              {[...state.events].sort((a, b) => b.quarter - a.quarter || b.minute - a.minute || b.id - a.id).map((e) => (
                <View key={e.id} style={ctrl.editRow}>
                  <Text style={ctrl.editMin}>{periodLabel(e.quarter, state.regPeriods)}</Text>
                  <Text style={ctrl.editLabel} numberOfLines={1}>{BB_META[e.type].icon} {BB_META[e.type].label}{e.type === 'score' ? ` +${e.points}` : ''}{e.playerName ? ` — ${e.playerName}` : ''}</Text>
                  <Text style={ctrl.editEdit} onPress={() => editEvent(e)}>✎ Edit</Text>
                  <Text style={ctrl.editRemove} onPress={() => removeEvent(e)}>✕</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {state.quarter < state.regPeriods ? (
        <Button label={`End ${periodLabel(state.quarter, state.regPeriods)} →`} onPress={() => dispatch({ type: 'NEXT_QUARTER' })} />
      ) : state.home === state.away ? (
        // Level at the end of Q4 or an OT period → play (another) overtime; a draw
        // stays possible for formats that allow one.
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={ctrl.meta}>Scores level ({state.home}–{state.away}) at the end of {periodLabel(state.quarter, state.regPeriods)}.</Text>
          <Button label={`🏀 Start Overtime (${periodLabel(state.quarter + 1, state.regPeriods)})`} onPress={() => dispatch({ type: 'START_OVERTIME' })} />
          <Button label="End as a draw" variant="ghost" onPress={() => dispatch({ type: 'END' })} />
        </View>
      ) : (
        <Button label="🏁 End Match" variant="danger" onPress={() => dispatch({ type: 'END' })} />
      )}
    </View>
  );
};

/* ------------------------------ Live panel --------------------------------- */

const LiveClock: NonNullable<SportPlugin<BasketballState>['LiveClock']> = ({ state }) => {
  const s = state as BasketballState;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!s.startedAt || s.ended) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.startedAt, s.ended]);

  const running = !!s.startedAt && !s.ended;
  const per = periodLabel(s.quarter, s.regPeriods);
  const label = s.ended ? (s.quarter > s.regPeriods ? `Final · ${per}` : 'Final') : !s.startedAt ? `${per} ·` : `${per} · ${currentMinute(s)}'`;
  return (
    <View style={ctrl.clockRow}>
      <View style={[ctrl.liveDot, { backgroundColor: running ? theme.colors.danger : theme.colors.textMuted }]} />
      <Text style={ctrl.clockTime}>{label}</Text>
    </View>
  );
};

const LiveExtras: NonNullable<SportPlugin<BasketballState>['LiveExtras']> = ({
  state,
  homeName,
  awayName,
  homeColor,
  awayColor,
  homeRoster,
  awayRoster,
}) => {
  const s = state as BasketballState;
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Text style={ctrl.label}>Play-by-play</Text>
      <Timeline events={s.events} homeColor={homeColor} awayColor={awayColor} />
      <Text style={ctrl.label}>Box score</Text>
      <BoxScore events={s.events} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} homeColor={homeColor} awayColor={awayColor} />
    </View>
  );
};

export const basketballPlugin: SportPlugin<BasketballState> = {
  id: 'basketball',
  name: 'Basketball',
  icon: '🏀',
  archetype: 'running-points',
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  summary: (s) => ({
    homeScore: String(s.home),
    awayScore: String(s.away),
    statusLine: s.ended ? (s.quarter > s.regPeriods ? `Final · ${periodLabel(s.quarter, s.regPeriods)}` : 'Final') : periodLabel(s.quarter, s.regPeriods),
  }),
  ScoringControls,
  LiveClock,
  LiveExtras,
  formation: () => courtFormation('basketball'),
  Court: makeCourt('basketball'),
  voice: { hints: ['two {name}', 'three {name}', 'rebound {name}', 'foul {name}'], parse: basketballVoice },
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'fiba',
      options: [
        { value: 'fiba', label: 'FIBA (4×10)', set: { playersPerSide: 5, substitutes: 5, regPeriods: 4, periodMinutes: 10, foulsToFoulOut: 5, foulsForBonus: 5, overtimeMinutes: 5, targetPoints: 0, winBy: 2, shotClock: 24 } },
        { value: 'nba', label: 'NBA (4×12)', set: { playersPerSide: 5, substitutes: 5, regPeriods: 4, periodMinutes: 12, foulsToFoulOut: 6, foulsForBonus: 5, overtimeMinutes: 5, targetPoints: 0, winBy: 2, shotClock: 24 } },
        { value: 'ncaa', label: 'NCAA (2×20 halves)', set: { playersPerSide: 5, substitutes: 7, regPeriods: 2, periodMinutes: 20, foulsToFoulOut: 5, foulsForBonus: 7, overtimeMinutes: 5, targetPoints: 0, winBy: 2, shotClock: 30 } },
        { value: '3x3', label: '3×3 (first to 21)', set: { playersPerSide: 3, substitutes: 1, regPeriods: 1, periodMinutes: 10, foulsToFoulOut: 0, foulsForBonus: 7, overtimeMinutes: 0, targetPoints: 21, winBy: 1, shotClock: 12 } },
        { value: '2v2', label: '2v2 (first to 15)', set: { playersPerSide: 2, substitutes: 1, regPeriods: 1, periodMinutes: 10, foulsToFoulOut: 0, foulsForBonus: 7, overtimeMinutes: 0, targetPoints: 15, winBy: 2, shotClock: 0 } },
        { value: '1v1', label: '1v1 (first to 11)', set: { playersPerSide: 1, substitutes: 0, regPeriods: 1, periodMinutes: 10, foulsToFoulOut: 0, foulsForBonus: 0, overtimeMinutes: 0, targetPoints: 11, winBy: 2, shotClock: 0 } },
        { value: 'school', label: 'School (4×8)', set: { playersPerSide: 5, substitutes: 7, regPeriods: 4, periodMinutes: 8, foulsToFoulOut: 5, foulsForBonus: 5, overtimeMinutes: 4, targetPoints: 0, winBy: 2, shotClock: 24 } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'playersPerSide', label: 'Players per side', type: 'count', default: 5, min: 1, max: 11, hint: '5 standard · 3 for 3×3' },
    {
      key: 'regPeriods', label: 'Period structure', type: 'choice', default: 4, advanced: true,
      options: [
        { value: 4, label: '4 quarters' },
        { value: 2, label: '2 halves' },
        { value: 1, label: 'Single period (3×3)' },
      ],
    },
    { key: 'periodMinutes', label: 'Minutes per period', type: 'number', default: 10, min: 1, max: 24, advanced: true },
    { key: 'targetPoints', label: 'First-to-N points', type: 'number', default: 0, min: 0, max: 50, advanced: true, hint: '0 = timed game · 21 for 3×3/streetball' },
    { key: 'substitutes', label: 'Substitutes per side', type: 'count', default: 5, min: 0, max: 11, advanced: true },
    { key: 'foulsToFoulOut', label: 'Fouls to foul out', type: 'number', default: 5, min: 0, max: 10, advanced: true, hint: '0 = no foul-out (3×3)' },
    { key: 'foulsForBonus', label: 'Team fouls for bonus', type: 'number', default: 5, min: 1, max: 10, advanced: true, hint: 'opponent shoots free throws after this many team fouls' },
    { key: 'overtimeMinutes', label: 'Overtime length (min)', type: 'number', default: 5, min: 1, max: 10, advanced: true, hint: 'played when tied after regulation; repeats until decided' },
    { key: 'shotClock', label: 'Shot clock (sec)', type: 'number', default: 24, min: 0, max: 35, advanced: true, hint: 'shown for reference' },
  ],
};

const ctrl = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing(2) },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  liveDot: { width: 9, height: 9, borderRadius: 5 },
  clockTime: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '900', letterSpacing: 1 },
  fouledOut: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '800' },
  bonus: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  otBanner: { backgroundColor: theme.colors.primary + '1A', borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.primary, padding: theme.spacing(3), gap: theme.spacing(1) },
  otTitle: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '900', letterSpacing: 0.5 },
  otMeta: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  editPanel: { gap: theme.spacing(3), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(4) },
  editHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editBanner: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700', backgroundColor: theme.colors.accent + '22', padding: theme.spacing(2), borderRadius: theme.radius.sm },
  addedBox: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  editMin: { color: theme.colors.accent, fontWeight: '800', width: 40, fontSize: theme.font.small },
  editLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
  editEdit: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  editRemove: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '800' },
});
