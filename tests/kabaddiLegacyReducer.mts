/**
 * FROZEN copy of the kabaddi reducer as it was before SD-03 (git 171c2f5,
 * src/sports/kabaddi/index.tsx). Test oracle only: the legacy-replay identity
 * tests replay the same logs through this and the current engine and require the
 * same team score / state. Do not "fix" this file.
 */
import { replayRaids, decideRaidShootout, type RaidOutcome } from '../src/sports/kabaddi/rules.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { KabaddiState } from '../src/sports/kabaddi/engine.ts';

const kabaddiCfg = (s: KabaddiState) => ({ teamSize: s.teamSize ?? 7, style: s.style ?? 'sanjeevani', proRules: s.proRules ?? true });
const raidsOf = (s: KabaddiState): RaidOutcome[] => s.raids ?? [];
const currentMinute = (_s: KabaddiState) => 0;

export const legacyReducer = (s: KabaddiState, a: ScoreAction): KabaddiState => {
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
    case 'START_SHOOTOUT':
      // Level after regulation/extra time → a 5-raid shootout (PKL tie-breaker).
      return s.home === s.away && !s.ended && !s.shootout ? { ...s, shootout: { home: [], away: [] }, startedAt: undefined } : s;
    case 'SHOOTOUT_RAID': {
      // One shootout raid: `points` scored (0 = failed/empty). The regulation
      // score stays tied; the shootout totals decide the winner.
      if (!s.shootout || s.ended || (a.side !== 'home' && a.side !== 'away')) return s;
      const p = Math.max(0, Math.floor(Number(a.payload?.points ?? 0)));
      const sh = { ...s.shootout, [a.side]: [...s.shootout[a.side], p] };
      const winner = decideRaidShootout(sh.home, sh.away);
      return {
        ...s,
        shootout: sh,
        ended: winner != null,
        startedAt: undefined,
        seq: s.seq + 1,
        events: [...s.events, { id: s.seq + 1, stamp: 'SO', icon: '🎯', label: `Shootout raid +${p}`, detail: who, side: a.side, kind: 'raid', points: p, playerName: who, minute, half: hf }],
      };
    }
    case 'END':
      return { ...s, ended: true, startedAt: undefined };
    default:
      return s;
  }
};
