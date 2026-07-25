/**
 * Kabaddi plugin — archetype: raid. Two timed halves with a running clock.
 * Raid and tackle points are attributed to players and logged to the timeline
 * with the match minute.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip, TextField, textStyles } from '../../components/ui';
import { LiveTimeline } from '../LiveTimeline';
import type { LiveEvent } from '../liveEvents';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';
import { kabaddiVoice } from '../voiceParsers';
import { courtFormation, makeCourt } from '../courts';
import { replayRaids, type RaidOutcome, type KabaddiStyle } from './rules';

export interface KabaddiState {
  home: number;
  away: number;
  half: 1 | 2 | 3 | 4; // 3 & 4 = extra-time halves (tie-breaker)
  startedAt?: number;
  /** minutes per half (format: halfMinutes) */
  halfMinutes: number;
  /** minutes per extra-time half (format: extraTimeMinutes) */
  extraTimeMinutes: number;
  /** how a level result is settled: draw stands / extra time then Golden Raid /
   *  Golden Raid straightaway (format: decider) */
  decider: 'none' | 'extra_time' | 'golden_raid';
  /** sudden-death Golden Raid under way — the next point wins the match */
  goldenRaid: boolean;
  /** substitutions allowed per side (format: substitutes) */
  maxSubs: number;
  subsUsed: { home: number; away: number };
  /** names taken off — they can't be credited points once subbed out */
  subbedOff: { home: string[]; away: string[] };
  /** Pro-Kabaddi raid model (guided outcomes replayed for out-counts & revival). */
  style: KabaddiStyle;
  teamSize: number;
  proRules: boolean;
  raids: RaidOutcome[];
  /** players currently off the mat (out) per side */
  out: { home: number; away: number };
  /** consecutive empty raids per side (3rd is do-or-die) */
  emptyRaids: { home: number; away: number };
  events: LiveEvent[];
  seq: number;
  ended: boolean;
}

const init = (config?: Record<string, unknown>): KabaddiState => ({
  home: 0, away: 0, half: 1,
  halfMinutes: Number(config?.halfMinutes ?? 20),
  extraTimeMinutes: Number(config?.extraTimeMinutes ?? 5),
  decider: (config?.decider as KabaddiState['decider']) ?? 'extra_time',
  goldenRaid: false,
  maxSubs: Number(config?.substitutes ?? 0),
  subsUsed: { home: 0, away: 0 },
  subbedOff: { home: [], away: [] },
  style: (config?.style as KabaddiStyle) ?? 'sanjeevani',
  teamSize: Number(config?.playersPerSide ?? 7),
  proRules: Boolean(config?.proRules ?? true),
  raids: [],
  out: { home: 0, away: 0 },
  emptyRaids: { home: 0, away: 0 },
  events: [], seq: 0, ended: false,
});

// Defensive against state persisted before the Pro-Kabaddi fields existed.
const kabaddiCfg = (s: KabaddiState) => ({ teamSize: s.teamSize ?? 7, style: s.style ?? 'sanjeevani', proRules: s.proRules ?? true });
const raidsOf = (s: KabaddiState) => s.raids ?? [];

/** 1st/2nd half, then the two extra-time halves. */
export const halfLabel = (h: number): string =>
  h === 1 ? '1st Half' : h === 2 ? '2nd Half' : h === 3 ? 'Extra Time · 1st' : 'Extra Time · 2nd';

export function currentMinute(s: KabaddiState): number {
  const hm = s.halfMinutes, et = s.extraTimeMinutes;
  const base = s.half === 1 ? 0 : s.half === 2 ? hm : s.half === 3 ? 2 * hm : 2 * hm + et;
  if (!s.startedAt) return base;
  return base + Math.floor((Date.now() - s.startedAt) / 60000);
}

const reducer = (s: KabaddiState, a: ScoreAction): KabaddiState => {
  if (s.ended && a.type !== 'END') return s;
  const minute = Number(a.payload?.minute ?? currentMinute(s));
  const hf = Number(a.payload?.half ?? s.half);
  const who = a.attribution?.playerName;
  const pts = Number(a.payload?.points ?? 1);
  const pushPt = (type: 'RAID' | 'TACKLE'): KabaddiState => {
    if (!a.side) return s;
    // a player who's been subbed off takes no further part
    if (who && s.subbedOff[a.side].includes(who)) return s;
    const gr = s.goldenRaid; // sudden death: this point decides the match
    const kind = type === 'RAID' ? 'raid' : 'tackle';
    const scored = { ...s, [a.side]: s[a.side] + pts } as KabaddiState;
    return {
      ...scored,
      ...(gr ? { ended: true, startedAt: undefined } : null),
      seq: s.seq + 1,
      events: [...s.events, { id: s.seq + 1, stamp: gr ? 'GR' : `${minute}'`, icon: gr ? '⚡' : type === 'RAID' ? '🤼' : '🛡️', label: gr ? `Golden Raid — ${kind} +${pts}` : type === 'RAID' ? `Raid +${pts}` : `Tackle +${pts}`, detail: who, side: a.side, kind, points: pts, playerName: who, minute, half: hf }],
    };
  };
  switch (a.type) {
    case 'KICKOFF':
      return { ...s, startedAt: Number(a.payload?.at) };
    case 'RAID':
      return pushPt('RAID');
    case 'TACKLE':
      return pushPt('TACKLE');
    case 'RAID_OUTCOME': {
      // Guided raid: touches / bonus / raider-out → the engine (replayed for
      // correct revival, super tackle, do-or-die & all-out) sets the new score.
      if (!a.side) return s;
      if (who && s.subbedOff[a.side].includes(who)) return s;
      const outcome: RaidOutcome = {
        side: a.side,
        touches: Math.max(0, Math.floor(Number(a.payload?.touches ?? 0))),
        bonus: Boolean(a.payload?.bonus),
        raiderOut: Boolean(a.payload?.raiderOut),
      };
      const cfg = kabaddiCfg(s);
      const before = replayRaids(raidsOf(s), cfg);
      const raids = [...raidsOf(s), outcome];
      const after = replayRaids(raids, cfg);
      const gr = s.goldenRaid;
      const scored = after.home !== before.home || after.away !== before.away;
      const finish = after.allOutEnded || (gr && scored);
      const detail = [
        outcome.touches ? `${outcome.touches} touch${outcome.touches === 1 ? '' : 'es'}` : null,
        outcome.bonus ? 'bonus' : null,
        outcome.raiderOut ? 'raider out' : null,
      ].filter(Boolean).join(' · ') || 'empty raid';
      return {
        ...s,
        home: s.home + (after.home - before.home),
        away: s.away + (after.away - before.away),
        out: after.out, emptyRaids: after.emptyRaids, raids,
        ended: s.ended || finish,
        startedAt: finish ? undefined : s.startedAt,
        seq: s.seq + 1,
        events: [...s.events, { id: s.seq + 1, stamp: gr ? 'GR' : `${minute}'`, icon: gr ? '⚡' : '🤼', label: gr ? `Golden Raid — ${detail}` : `Raid — ${detail}`, detail: who, side: a.side, kind: 'raid', points: (after.home - before.home) || (after.away - before.away), playerName: who, minute, half: hf }],
      };
    }
    case 'SUB': {
      if (!a.side || s.subsUsed[a.side] >= s.maxSubs) return s;
      const offName = String(a.payload?.offName ?? '');
      const onName = String(a.payload?.onName ?? '');
      if (!offName || !onName) return s;
      return {
        ...s,
        seq: s.seq + 1,
        events: [...s.events, { id: s.seq + 1, stamp: `${minute}'`, icon: '🔄', label: 'Substitution', detail: `${onName} ⬆  ${offName} ⬇`, side: a.side, kind: 'sub', playerName: offName, minute, half: hf }],
        subsUsed: { ...s.subsUsed, [a.side]: s.subsUsed[a.side] + 1 },
        subbedOff: { ...s.subbedOff, [a.side]: [...s.subbedOff[a.side], offName] },
      };
    }
    case 'REMOVE_EVENT': {
      // Surgically remove one logged moment, reversing its score (raid/tackle) or
      // its substitution. The stat line is reversed by this action's attribution.
      const id = Number(a.payload?.id);
      const ev = s.events.find((e) => e.id === id);
      if (!ev || !ev.side) return s;
      const events = s.events.filter((e) => e.id !== id);
      // A guided raid → drop its raid entry & replay, so revival / super tackle /
      // all-out all reverse correctly (its net point effect isn't just ev.points).
      if (ev.kind === 'raid' && raidsOf(s).length) {
        const ordinal = s.events.filter((e) => e.kind === 'raid').findIndex((e) => e.id === id);
        if (ordinal >= 0 && ordinal < raidsOf(s).length) {
          const cfg = kabaddiCfg(s);
          const before = replayRaids(raidsOf(s), cfg);
          const raids = raidsOf(s).filter((_, i) => i !== ordinal);
          const after = replayRaids(raids, cfg);
          return { ...s, events, raids, home: Math.max(0, s.home + (after.home - before.home)), away: Math.max(0, s.away + (after.away - before.away)), out: after.out, emptyRaids: after.emptyRaids };
        }
      }
      let next = { ...s, events } as KabaddiState;
      if (ev.kind === 'raid' || ev.kind === 'tackle') next = { ...next, [ev.side]: Math.max(0, next[ev.side] - (ev.points ?? 0)) } as KabaddiState;
      else if (ev.kind === 'sub' && ev.playerName) next = { ...next, subsUsed: { ...next.subsUsed, [ev.side]: Math.max(0, next.subsUsed[ev.side] - 1) }, subbedOff: { ...next.subbedOff, [ev.side]: next.subbedOff[ev.side].filter((n) => n !== ev.playerName) } };
      return next;
    }
    case 'NEXT_HALF':
      // 1→2 (regulation) and 3→4 (extra time).
      return s.half === 1 ? { ...s, half: 2, startedAt: undefined } : s.half === 3 ? { ...s, half: 4, startedAt: undefined } : s;
    case 'START_EXTRA_TIME':
      // Level after regulation → two extra-time halves.
      return s.home === s.away && s.half === 2 && !s.ended && s.decider === 'extra_time' ? { ...s, half: 3, startedAt: undefined } : s;
    case 'START_GOLDEN_RAID':
      // Level after regulation or extra time → sudden-death Golden Raid.
      return s.home === s.away && !s.ended ? { ...s, goldenRaid: true, startedAt: undefined } : s;
    case 'END':
      return { ...s, ended: true, startedAt: undefined };
    default:
      return s;
  }
};

const Row = ({ label, roster, onPick, onTeam }: { label: string; roster: Player[]; onPick: (p: Player) => void; onTeam?: () => void }) => (
  <View style={{ gap: theme.spacing(2) }}>
    <Text style={ctrl.label}>{label}</Text>
    <View style={ctrl.chips}>
      {roster.map((p) => <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => onPick(p)} />)}
      {/* Team point — no named player (friendly whose players aren't on the app yet). */}
      {onTeam && <SelectChip label={roster.length ? '＋ Team' : '＋ Team point (no players yet)'} active={false} onPress={onTeam} />}
    </View>
  </View>
);

const ScoringControls: SportPlugin<KabaddiState>['ScoringControls'] = ({ state, dispatch, homeName, awayName, homeRoster = [], awayRoster = [] }) => {
  const [sub, setSub] = useState<{ side: 'home' | 'away'; off?: Player } | null>(null);
  // Timeline correction: edit one past moment in place, or backfill a missed one.
  const [showEdit, setShowEdit] = useState(false);
  const [edit, setEdit] = useState<LiveEvent | null>(null); // the raid/tackle being re-entered
  const [backfillText, setBackfillText] = useState('');
  const [backfillMin, setBackfillMin] = useState<number | null>(null);
  // Guided raid capture: who raided, how many touched, bonus, was the raider caught.
  const [raidFlow, setRaidFlow] = useState<{ side: 'home' | 'away'; raider?: Player; touches: number; bonus: boolean; tackled: boolean } | null>(null);

  const hm = state.halfMinutes, et = state.extraTimeMinutes;
  const halfFromMin = (m: number): 1 | 2 | 3 | 4 => (m < hm ? 1 : m < 2 * hm ? 2 : m < 2 * hm + et ? 3 : 4);
  // While editing, stamp at the original moment; while backfilling, at the past
  // minute (its half derived); otherwise live.
  const stampFor = () =>
    edit ? { minute: edit.minute ?? 0, half: edit.half ?? state.half } : backfillMin != null ? { minute: backfillMin, half: halfFromMin(backfillMin) } : { minute: currentMinute(state), half: state.half };
  const fire = (action: ScoreAction) => dispatch({ ...action, payload: { ...action.payload, ...stampFor() } });
  const pt = (type: string, side: 'home' | 'away', stat: string, p: Player) =>
    fire({ type, side, attribution: { playerId: p.id, stat, playerName: p.fullName } });
  // Team point — no named player (keeps the scoreline correct without a roster).
  const teamPt = (type: 'RAID' | 'TACKLE', side: 'home' | 'away') => fire({ type, side });
  // Pro-Kabaddi live figures, defensive against pre-upgrade state.
  const kOut = state.out ?? { home: 0, away: 0 };
  const kTeamSize = state.teamSize ?? 7;
  const kEmpty = state.emptyRaids ?? { home: 0, away: 0 };

  // ----- Correct the timeline: remove / edit one specific past moment -----
  const STAT_KEY: Record<string, string> = { raid: 'raidPoints', tackle: 'tacklePoints' };
  const rosterId = (nm?: string) => [...homeRoster, ...awayRoster].find((p) => p.fullName === nm)?.id;
  const removeEvent = (e: LiveEvent) => {
    const pid = rosterId(e.playerName);
    const attribution = pid && e.kind && STAT_KEY[e.kind]
      ? { playerId: pid, stat: STAT_KEY[e.kind], by: -(e.points ?? 1), playerName: e.playerName }
      : undefined;
    dispatch({ type: 'REMOVE_EVENT', side: e.side, payload: { id: e.id }, attribution });
  };
  // Edit (raid/tackle only) = remove the old point, then re-credit it to the
  // re-picked player, stamped at the same moment — score & tallies re-adjust.
  const editEvent = (e: LiveEvent) => { removeEvent(e); setShowEdit(false); setEdit(e); };
  const commitEdit = (p: Player) => {
    if (!edit || !edit.side || !edit.kind) return;
    fire({ type: edit.kind.toUpperCase(), side: edit.side, payload: { points: edit.points ?? 1 }, attribution: { playerId: p.id, stat: STAT_KEY[edit.kind], by: edit.points ?? 1, playerName: p.fullName } });
    setEdit(null);
  };

  // Players subbed off this match take no further part.
  const offNames = (side: 'home' | 'away') => state.subbedOff[side];
  const onField = (side: 'home' | 'away', roster: Player[]) => roster.filter((p) => !offNames(side).includes(p.fullName));
  const rosterFor = (side: 'home' | 'away') => (side === 'home' ? homeRoster : awayRoster);
  const subsLeft = (side: 'home' | 'away') => state.maxSubs - state.subsUsed[side];

  if (!state.startedAt && !state.ended && !state.goldenRaid && !edit) {
    const startLabel = state.half === 1 ? '▶ Start match' : state.half === 2 ? '▶ Start 2nd half' : `▶ Start ${halfLabel(state.half)}`;
    const startHint = state.half === 1 ? 'Start the match to run the clock.' : state.half === 2 ? 'Half time.' : state.half === 3 ? 'Extra time — first half.' : 'Extra time — second half.';
    return (
      <View style={{ gap: theme.spacing(3) }}>
        <Text style={ctrl.meta}>{startHint}</Text>
        <Button label={startLabel} onPress={() => dispatch({ type: 'KICKOFF', payload: { at: Date.now() } })} />
      </View>
    );
  }

  // Substitution flow (format: substitutes) — pick who comes off, then who comes on.
  if (sub) {
    const sideName = sub.side === 'home' ? homeName : awayName;
    const offOpts = onField(sub.side, rosterFor(sub.side));
    const onOpts = rosterFor(sub.side).filter((p) => p.id !== sub.off?.id && !offNames(sub.side).includes(p.fullName));
    return (
      <View style={ctrl.subPanel}>
        <View style={ctrl.subHead}>
          <Text style={ctrl.label}>🔄 Substitution — {sideName}</Text>
          <Button label="Cancel" variant="ghost" onPress={() => setSub(null)} />
        </View>
        {!sub.off ? (
          <>
            <Text style={ctrl.meta}>Who comes off? (takes no further part)</Text>
            <View style={ctrl.chips}>
              {offOpts.map((p) => <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => setSub({ ...sub, off: p })} />)}
            </View>
          </>
        ) : (
          <>
            <Text style={ctrl.meta}>Who comes on for {sub.off.fullName}?</Text>
            {onOpts.length > 0 ? (
              <View style={ctrl.chips}>
                {onOpts.map((p) => (
                  <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => {
                    fire({ type: 'SUB', side: sub.side, payload: { offName: sub.off!.fullName, onName: p.fullName } });
                    setSub(null);
                  }} />
                ))}
              </View>
            ) : <Text style={textStyles.muted}>No available substitute in the squad.</Text>}
          </>
        )}
      </View>
    );
  }

  // In-place edit of one past raid/tackle: re-pick the player, stamped at the
  // original moment. The old point was already reversed on entry.
  if (edit) {
    const roster = onField(edit.side!, edit.side === 'home' ? homeRoster : awayRoster);
    const nm = edit.side === 'home' ? homeName : awayName;
    return (
      <View style={ctrl.subPanel}>
        <View style={ctrl.subHead}>
          <Text style={ctrl.label}>✎ Re-enter {edit.kind === 'tackle' ? 'Tackle' : 'Raid'} point — {nm}</Text>
          <Button label="Cancel" variant="ghost" onPress={() => setEdit(null)} />
        </View>
        <Text style={ctrl.editBanner}>Re-entering the {edit.minute}&apos; moment — your pick replaces the old one.</Text>
        <Text style={ctrl.meta}>Who got the point?</Text>
        <View style={ctrl.chips}>
          {roster.map((p) => <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => commitEdit(p)} />)}
        </View>
      </View>
    );
  }

  const tied = state.home === state.away;
  return (
    <View style={{ gap: theme.spacing(4) }}>
      {state.goldenRaid && (
        <View style={ctrl.grBanner}>
          <Text style={ctrl.grTitle}>⚡ GOLDEN RAID — SUDDEN DEATH</Text>
          <Text style={ctrl.grMeta}>Scores level {state.home}–{state.away}. The next point wins it — log the raid or tackle that decides the match.</Text>
        </View>
      )}
      {/* On-mat status: players in = teamSize − out; do-or-die once 2 empty raids. */}
      <View style={ctrl.matRow}>
        <Text style={ctrl.matChip}>🟢 {homeName} on mat: {kTeamSize - kOut.home}/{kTeamSize}</Text>
        <Text style={ctrl.matChip}>🟢 {awayName} on mat: {kTeamSize - kOut.away}/{kTeamSize}</Text>
      </View>

      {!raidFlow ? (
        <View style={ctrl.row}>
          <Button label={`🤼 ${homeName} raiding`} variant="home" style={ctrl.flex} onPress={() => setRaidFlow({ side: 'home', touches: 0, bonus: false, tackled: false })} />
          <Button label={`🤼 ${awayName} raiding`} variant="away" style={ctrl.flex} onPress={() => setRaidFlow({ side: 'away', touches: 0, bonus: false, tackled: false })} />
        </View>
      ) : (
        <View style={ctrl.raidPanel}>
          <View style={ctrl.subHead}>
            <Text style={ctrl.label}>🤼 {raidFlow.side === 'home' ? homeName : awayName} raiding</Text>
            <Button label="Cancel" variant="ghost" onPress={() => setRaidFlow(null)} />
          </View>
          {(state.proRules ?? true) && kEmpty[raidFlow.side] >= 2 && (
            <Text style={ctrl.doOrDie}>⚠ DO-OR-DIE raid — the raider is out if this raid scores nothing.</Text>
          )}
          {onField(raidFlow.side, raidFlow.side === 'home' ? homeRoster : awayRoster).length > 0 && (
            <>
              <Text style={ctrl.meta}>Raider (optional)</Text>
              <View style={ctrl.chips}>
                {onField(raidFlow.side, raidFlow.side === 'home' ? homeRoster : awayRoster).map((p) => (
                  <SelectChip key={p.id} label={p.fullName} active={raidFlow.raider?.id === p.id} onPress={() => setRaidFlow({ ...raidFlow, raider: p })} />
                ))}
              </View>
            </>
          )}
          <Text style={ctrl.meta}>Defenders touched (they go out)</Text>
          <View style={ctrl.chips}>
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <SelectChip key={n} label={String(n)} active={raidFlow.touches === n} onPress={() => setRaidFlow({ ...raidFlow, touches: n })} />
            ))}
          </View>
          <View style={ctrl.row}>
            <SelectChip label={`Bonus point: ${raidFlow.bonus ? 'Yes' : 'No'}`} active={raidFlow.bonus} onPress={() => setRaidFlow({ ...raidFlow, bonus: !raidFlow.bonus })} />
            <SelectChip label={`Raider tackled: ${raidFlow.tackled ? 'Yes' : 'No'}`} active={raidFlow.tackled} onPress={() => setRaidFlow({ ...raidFlow, tackled: !raidFlow.tackled })} />
          </View>
          <Button
            label="✓ Record raid"
            onPress={() => {
              fire({ type: 'RAID_OUTCOME', side: raidFlow.side, attribution: raidFlow.raider ? { playerId: raidFlow.raider.id, stat: 'raidPoints', playerName: raidFlow.raider.fullName } : undefined, payload: { touches: raidFlow.touches, bonus: raidFlow.bonus, raiderOut: raidFlow.tackled } });
              setRaidFlow(null);
            }}
          />
        </View>
      )}

      {state.maxSubs > 0 && !state.goldenRaid && (
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={ctrl.label}>🔄 Substitutions</Text>
          <View style={ctrl.chips}>
            <Button label={`${homeName} (${subsLeft('home')} left)`} variant="ghost" style={ctrl.flex} disabled={subsLeft('home') <= 0} onPress={() => setSub({ side: 'home' })} />
            <Button label={`${awayName} (${subsLeft('away')} left)`} variant="ghost" style={ctrl.flex} disabled={subsLeft('away') <= 0} onPress={() => setSub({ side: 'away' })} />
          </View>
        </View>
      )}

      {/* ⏪ Backfill a point the scorer missed earlier — stamp it at a past minute. */}
      {!state.goldenRaid && (
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={ctrl.label}>⏪ Backfill an earlier moment</Text>
          {backfillMin == null ? (
            <>
              <Text style={ctrl.meta}>Missed a raid or tackle? Enter a past minute — everything you log is stamped there until you go back to live.</Text>
              <View style={ctrl.chips}>
                <View style={ctrl.flex}><TextField label="" value={backfillText} onChange={setBackfillText} placeholder="minute, e.g. 12" autoCapitalize="none" /></View>
                <Button label="Backfill" variant="ghost" disabled={backfillText.trim() === ''} onPress={() => setBackfillMin(Math.max(0, Math.floor(Number(backfillText)) || 0))} />
              </View>
            </>
          ) : (
            <View style={ctrl.addedBox}>
              <Text style={ctrl.label}>⏪ Backfilling at {backfillMin}&apos; ({halfLabel(halfFromMin(backfillMin))})</Text>
              <Text style={ctrl.meta}>Every point you log now is stamped at {backfillMin}&apos;. Log it above, then go back to live.</Text>
              <Button label="Back to live scoring" variant="ghost" onPress={() => { setBackfillMin(null); setBackfillText(''); }} />
            </View>
          )}
        </View>
      )}

      {/* 🗓 Correct the timeline — remove or edit one specific past moment. */}
      {!state.goldenRaid && state.events.length > 0 && (
        <View style={{ gap: theme.spacing(2) }}>
          <View style={ctrl.subHead}>
            <Text style={ctrl.label}>🗓 Correct the timeline</Text>
            <Button label={showEdit ? 'Done' : 'Edit'} variant="ghost" onPress={() => setShowEdit((v) => !v)} />
          </View>
          {showEdit && (
            <View style={{ gap: theme.spacing(1) }}>
              <Text style={ctrl.meta}>Tap Edit on a raid/tackle to re-pick the player (stamped at the same minute — the score & tallies re-adjust), or Remove to delete it.</Text>
              {[...state.events].sort((a, b) => (b.minute ?? 0) - (a.minute ?? 0) || b.id - a.id).map((e) => (
                <View key={e.id} style={ctrl.editRow}>
                  <Text style={ctrl.editMin}>{e.stamp}</Text>
                  <Text style={ctrl.editLabel} numberOfLines={1}>{e.icon} {e.label}{e.detail ? ` — ${e.detail}` : ''}</Text>
                  {(e.kind === 'raid' || e.kind === 'tackle') && <Text style={ctrl.editEdit} onPress={() => editEvent(e)}>✎ Edit</Text>}
                  <Text style={ctrl.editRemove} onPress={() => removeEvent(e)}>✕</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {state.goldenRaid ? (
        <Button label="End as a tie" variant="ghost" onPress={() => dispatch({ type: 'END' })} />
      ) : state.half === 1 ? (
        <Button label="End 1st Half →" onPress={() => dispatch({ type: 'NEXT_HALF' })} />
      ) : state.half === 3 ? (
        <Button label="End Extra Time · 1st half →" onPress={() => dispatch({ type: 'NEXT_HALF' })} />
      ) : tied ? (
        // Level after the 2nd half or extra time → the tie-breaker the organizer
        // chose (draw stands / extra time then Golden Raid / Golden Raid direct).
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={ctrl.meta}>Scores level ({state.home}–{state.away}) at the end of {halfLabel(state.half)}.
            {state.decider === 'none' ? ' This match can end level.' : ''}</Text>
          {state.decider !== 'none' && (
            <Button label="⚡ Golden Raid — sudden death" onPress={() => dispatch({ type: 'START_GOLDEN_RAID' })} />
          )}
          {state.decider === 'extra_time' && state.half === 2 && (
            <Button label={`Extra time (2 × ${state.extraTimeMinutes} min)`} variant="ghost" onPress={() => dispatch({ type: 'START_EXTRA_TIME' })} />
          )}
          <Button label="End as a tie" variant="ghost" onPress={() => dispatch({ type: 'END' })} />
        </View>
      ) : (
        <Button label="🏁 End Match" variant="danger" onPress={() => dispatch({ type: 'END' })} />
      )}
    </View>
  );
};

const LiveClock: NonNullable<SportPlugin<KabaddiState>['LiveClock']> = ({ state }) => {
  const s = state as KabaddiState;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!s.startedAt || s.ended) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.startedAt, s.ended]);
  const running = !!s.startedAt && !s.ended;
  const label = s.ended
    ? (s.goldenRaid ? 'FT · GR' : s.half > 2 ? 'FT · ET' : 'FT')
    : s.goldenRaid ? '⚡ GR'
    : !s.startedAt ? (s.half === 1 ? '—' : 'HT')
    : `${currentMinute(s)}'`;
  return (
    <View style={ctrl.clockRow}>
      <View style={[ctrl.liveDot, { backgroundColor: running ? theme.colors.danger : theme.colors.textMuted }]} />
      <Text style={ctrl.clockTime}>{label}</Text>
    </View>
  );
};

const LiveExtras: NonNullable<SportPlugin<KabaddiState>['LiveExtras']> = ({ state, homeColor, awayColor }) => {
  const s = state as KabaddiState;
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Text style={ctrl.label}>Timeline</Text>
      <LiveTimeline events={s.events} homeColor={homeColor} awayColor={awayColor} emptyText="No raids yet." />
    </View>
  );
};

export const kabaddiPlugin: SportPlugin<KabaddiState> = {
  id: 'kabaddi',
  name: 'Kabaddi',
  icon: '🤼',
  archetype: 'raid',
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  summary: (s) => ({
    homeScore: String(s.home),
    awayScore: String(s.away),
    statusLine: s.ended
      ? (s.goldenRaid ? 'Full Time · Golden Raid' : s.half > 2 ? 'Full Time · Extra Time' : 'Full Time')
      : s.goldenRaid ? '⚡ Golden Raid'
      : s.half <= 2 ? `Half ${s.half}` : halfLabel(s.half),
  }),
  ScoringControls,
  LiveClock,
  LiveExtras,
  formation: () => courtFormation('kabaddi'),
  Court: makeCourt('kabaddi'),
  voice: { hints: ['raid Kiran', 'tackle Kiran', 'raid away'], parse: kabaddiVoice },
  formatFields: [
    {
      key: 'preset', label: 'Rule set', type: 'preset', default: 'pro',
      options: [
        { value: 'pro', label: 'Standard / Pro (7 · 2×20)', set: { playersPerSide: 7, substitutes: 5, halfMinutes: 20, extraTimeMinutes: 5, decider: 'extra_time', style: 'sanjeevani', proRules: true } },
        { value: 'circle', label: 'Circle style (7 · 2×15)', set: { playersPerSide: 7, substitutes: 5, halfMinutes: 15, extraTimeMinutes: 5, decider: 'golden_raid', style: 'sanjeevani', proRules: false } },
        { value: 'school', label: 'School (7 · 2×10)', set: { playersPerSide: 7, substitutes: 5, halfMinutes: 10, extraTimeMinutes: 5, decider: 'extra_time', style: 'sanjeevani', proRules: false } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'playersPerSide', label: 'Players per side', type: 'count', default: 7, min: 1, max: 11 },
    {
      key: 'style', label: 'Revival style', type: 'choice', default: 'sanjeevani',
      options: [
        { value: 'sanjeevani', label: 'Sanjeevani (revival)' },
        { value: 'amar', label: 'Amar (points only)' },
        { value: 'gaminee', label: 'Gaminee (all-out ends)' },
      ],
    },
    {
      key: 'decider', label: 'If level at full time', type: 'choice', default: 'extra_time',
      options: [
        { value: 'none', label: 'Draw stands' },
        { value: 'extra_time', label: 'Extra time, then Golden Raid' },
        { value: 'golden_raid', label: 'Golden Raid straightaway' },
      ],
    },
    { key: 'proRules', label: 'Pro rules (do-or-die, super tackle, bonus)', type: 'toggle', default: true, advanced: true },
    { key: 'substitutes', label: 'Substitutes per side', type: 'count', default: 5, min: 0, max: 11, advanced: true },
    { key: 'halfMinutes', label: 'Minutes per half', type: 'number', default: 20, min: 5, max: 30, advanced: true },
    { key: 'extraTimeMinutes', label: 'Extra-time half (min)', type: 'number', default: 5, min: 1, max: 15, advanced: true, hint: 'used only for the “extra time” decider' },
  ],
};

const ctrl = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  row: { flexDirection: 'row', gap: theme.spacing(2) },
  flex: { flex: 1 },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  subPanel: { gap: theme.spacing(3), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(4) },
  raidPanel: { gap: theme.spacing(3), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.primary, padding: theme.spacing(4) },
  matRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  matChip: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3) },
  doOrDie: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '800' },
  subHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  liveDot: { width: 9, height: 9, borderRadius: 5 },
  clockTime: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '900', letterSpacing: 1 },
  grBanner: { backgroundColor: theme.colors.primary + '1A', borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.primary, padding: theme.spacing(3), gap: theme.spacing(1) },
  grTitle: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '900', letterSpacing: 0.5 },
  grMeta: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  editBanner: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700', backgroundColor: theme.colors.accent + '22', padding: theme.spacing(2), borderRadius: theme.radius.sm },
  addedBox: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  editMin: { color: theme.colors.accent, fontWeight: '800', width: 40, fontSize: theme.font.small },
  editLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
  editEdit: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  editRemove: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '800' },
});
