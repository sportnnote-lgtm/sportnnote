/**
 * SD-05 — basketball FIBA rules: team-foul penalty from the 5th foul, technicals
 * as team fouls (FIBA, not NBA), overtime team fouls carrying over from Q4,
 * FIBA win 2 / loss 1 for NEW tournaments only, the full-court "+1" as a free
 * throw, and legacy replay identity against a frozen copy of the old engine.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  init, reducer, teamFoulsThisQuarter, inBonus, type BasketballState,
} from '../src/sports/basketball/engine.ts';
import {
  legacyInit, legacyReducer, legacyTeamFouls, legacyInBonus,
} from './basketballLegacyReducer.mts';
import {
  teamStandings, standingsConfigFromFormat, newTournamentFormats, withNewTournamentPoints, standingsPresets,
} from '../src/data/standings.ts';
import { basketballVoice } from '../src/sports/voiceParsers.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { Match, Player } from '../src/core/types.ts';

type Side = 'home' | 'away';
const run = (s: BasketballState, ...as: ScoreAction[]) => as.reduce(reducer, s);
const foul = (side: Side, who: string, foulType = 'personal'): ScoreAction =>
  ({ type: 'FOUL', side, payload: { foulType }, attribution: { playerId: who, stat: 'fouls', playerName: who } });
const fouls = (side: Side, n: number, foulType = 'personal') =>
  Array.from({ length: n }, (_, i) => foul(side, `P${i % 5}`, foulType));

// The format fields the presets in src/sports/basketball/index.tsx write (that
// file imports React Native, so the preset values are checked as text below).
const FIBA = { regPeriods: 4, foulsToFoulOut: 5, foulsForBonus: 4, techIsTeamFoul: true, otFoulsCarry: true };
const NBA = { regPeriods: 4, foulsToFoulOut: 6, foulsForBonus: 4, techIsTeamFoul: false, otFoulsCarry: false };
const OLD_FIBA = { regPeriods: 4, foulsToFoulOut: 5, foulsForBonus: 5 }; // what pre-SD-05 matches stored

describe('SD-05 — presets', () => {
  const src = readFileSync(new URL('../src/sports/basketball/index.tsx', import.meta.url), 'utf8');
  const preset = (v: string) => src.split('\n').find((l) => l.includes(`value: '${v}'`)) ?? '';
  test('FIBA / NBA / school: penalty after 4 team fouls; FIBA-family flags', () => {
    assert.match(preset('fiba'), /foulsForBonus: 4, techIsTeamFoul: true, otFoulsCarry: true/);
    assert.match(preset('school'), /foulsForBonus: 4, techIsTeamFoul: true, otFoulsCarry: true/);
    assert.match(preset('nba'), /foulsForBonus: 4, techIsTeamFoul: false, otFoulsCarry: false/);
    assert.match(preset('ncaa'), /foulsForBonus: 6/);
    assert.match(preset('3x3'), /foulsForBonus: 6/);
  });
  test('new matches default to 4 / technicals count / OT carries over', () => {
    assert.match(src, /key: 'foulsForBonus'[^\n]*default: 4/);
    assert.match(src, /key: 'techIsTeamFoul'[^\n]*default: true/);
    assert.match(src, /key: 'otFoulsCarry'[^\n]*default: true/);
  });
});

describe('SD-05 — team-foul penalty from the 5th foul', () => {
  test('FIBA: 4 fouls → not yet; the 5th foul is shot as free throws', () => {
    const four = run(init(FIBA), ...fouls('away', 3));
    assert.equal(inBonus(four, 'home'), false);
    const s = run(four, foul('away', 'P3')); // 4th team foul
    assert.equal(teamFoulsThisQuarter(s, 'away'), 4);
    assert.equal(inBonus(s, 'home'), true, 'every further (5th+) foul gives free throws');
    assert.equal(inBonus(s, 'away'), false);
  });
  test('resets at the next quarter', () => {
    const s = run(init(FIBA), ...fouls('away', 4), { type: 'NEXT_QUARTER' });
    assert.equal(teamFoulsThisQuarter(s, 'away'), 0);
    assert.equal(inBonus(s, 'home'), false);
  });
  test('an old match that stored foulsForBonus 5 keeps its old threshold', () => {
    const s = run(init(OLD_FIBA), ...fouls('away', 4));
    assert.equal(inBonus(s, 'home'), false);
    assert.equal(inBonus(run(s, foul('away', 'P4')), 'home'), true);
  });
});

describe('SD-05 — technical fouls', () => {
  const log = [...fouls('away', 3), foul('away', 'P4', 'technical')];
  test('FIBA: a technical is a team foul (4th → penalty)', () => {
    const s = run(init(FIBA), ...log);
    assert.equal(teamFoulsThisQuarter(s, 'away'), 4);
    assert.equal(inBonus(s, 'home'), true);
  });
  test('NBA preset: technicals are not team fouls', () => {
    const s = run(init(NBA), ...log);
    assert.equal(teamFoulsThisQuarter(s, 'away'), 3);
    assert.equal(inBonus(s, 'home'), false);
  });
  test('legacy config (no flag): technicals excluded as before', () => {
    assert.equal(teamFoulsThisQuarter(run(init(OLD_FIBA), ...log), 'away'), 3);
    assert.equal(teamFoulsThisQuarter(run(init(), ...log), 'away'), 3);
  });
});

describe('SD-05 — overtime team fouls', () => {
  const toOT = (cfg: Record<string, unknown>) => run(
    init(cfg),
    { type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' }, // → Q4
    ...fouls('away', 3), // 3 team fouls in Q4
    { type: 'START_OVERTIME' }, // 0-0 → OT
  );
  test('FIBA: OT fouls count with Q4 (3 carried + 1 in OT = penalty)', () => {
    const ot = toOT(FIBA);
    assert.equal(ot.quarter, 5);
    assert.equal(teamFoulsThisQuarter(ot, 'away'), 3);
    const s = run(ot, foul('away', 'P3'));
    assert.equal(teamFoulsThisQuarter(s, 'away'), 4);
    assert.equal(inBonus(s, 'home'), true);
    // …and a second OT keeps counting from the same total.
    const ot2 = run(s, { type: 'START_OVERTIME' });
    assert.equal(ot2.quarter, 6);
    assert.equal(teamFoulsThisQuarter(ot2, 'away'), 4);
  });
  test('NBA preset and legacy configs: each OT starts from 0', () => {
    assert.equal(teamFoulsThisQuarter(toOT(NBA), 'away'), 0);
    assert.equal(teamFoulsThisQuarter(toOT(OLD_FIBA), 'away'), 0);
  });
  test('earlier quarters never carry (only the last regulation period)', () => {
    const s = run(init(FIBA), ...fouls('away', 4), { type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' }, { type: 'START_OVERTIME' });
    assert.equal(teamFoulsThisQuarter(s, 'away'), 0); // the 4 fouls were in Q1
  });
});

describe('SD-05 — standings: FIBA 2-1 for new tournaments only', () => {
  const bm = (h: string, a: string, hs: number, as: number): Match =>
    ({ id: `${h}-${a}`, sport: 'basketball', status: 'completed', startsAt: '', score: { home: hs, away: as },
      winner: hs > as ? 'home' : 'away', homeTeam: { id: h, name: h }, awayTeam: { id: a, name: a }, state: null }) as unknown as Match;
  const ms = [bm('A', 'B', 70, 60), bm('B', 'C', 55, 50), bm('C', 'A', 80, 75)];
  const pts = (fmt: Record<string, unknown> | undefined) =>
    Object.fromEntries(teamStandings(ms, 'basketball', standingsConfigFromFormat('basketball', fmt)).map((r) => [r.teamId, r.points]));

  test('a new tournament stores win 2 / loss 1 → a loss is worth 1', () => {
    const fmts = newTournamentFormats(['basketball', 'football'], { basketball: { preset: 'fiba' } });
    // SD-17 extended D1: the FIBA preset also stores its forfeit loss and tie-break chain.
    assert.deepEqual(fmts.basketball, { winPoints: 2, drawPoints: 1, lossPoints: 1, forfeitLossPoints: 0, tieBreak: 'h2h,h2hDiff,h2hFor,diff,for,lots', tieRestart: true, preset: 'fiba' });
    assert.equal(fmts.football?.winPoints, 3, 'football now gets its own D1 preset (SD-17)');
    const cfg = standingsConfigFromFormat('basketball', fmts.basketball);
    assert.equal(cfg.win, 2); assert.equal(cfg.loss, 1);
    assert.deepEqual(pts(fmts.basketball), { A: 3, B: 3, C: 3 });
  });
  test('an existing tournament (no stored points keys) keeps 2-1-0', () => {
    const old = { preset: 'fiba', foulsForBonus: 5 };
    assert.equal(standingsConfigFromFormat('basketball', old).loss, 0);
    assert.deepEqual(pts(old), { A: 2, B: 2, C: 2 });
    assert.equal(standingsConfigFromFormat('basketball', undefined).loss, 0);
  });
  test('the organiser\'s own choice wins (Simple 2-1-0 preset)', () => {
    const simple = standingsPresets('basketball').find((p) => p.label === 'Simple 2-1-0')!;
    const fmt = withNewTournamentPoints('basketball', { ...simple.set });
    assert.equal(standingsConfigFromFormat('basketball', fmt).loss, 0);
    const own = newTournamentFormats(['basketball'], { basketball: { lossPoints: 0 } }).basketball!;
    assert.equal(own.winPoints, 2); assert.equal(own.lossPoints, 0);
  });
});

describe('SD-05 — full-court "+1" is a free throw', () => {
  const asha = { id: 'p-asha', fullName: 'Asha Rao' } as Player;
  const ctx = (s: BasketballState) => ({ state: s, homeName: 'Home', awayName: 'Away', homeRoster: [asha], awayRoster: [] });
  // What the "+1 FT" button / the FT panel's "Made" dispatch for a shooter.
  const madeFT: ScoreAction = { type: 'FREE_THROW', side: 'home', payload: { made: true },
    attribution: { playerId: asha.id, stat: 'points', by: 1, playerName: asha.fullName, extra: { freeThrowsMade: 1, freeThrowsAtt: 1 } } };

  test('and-one: the basket + the free throw = 3, logged as a FG and a made FT', () => {
    const s = run(init(FIBA), { type: 'SCORE', side: 'home', payload: { points: 2 }, attribution: { playerId: asha.id, stat: 'points', by: 2, playerName: asha.fullName } }, madeFT);
    assert.equal(s.home, 3);
    assert.deepEqual(s.events.map((e) => [e.type, e.points]), [['score', 2], ['freethrow', 1]]);
  });
  test('spoken "one" in a full-court game → a made free throw with FTM/FTA', () => {
    const acts = basketballVoice('one Asha', ctx(init(FIBA)))!;
    assert.equal(acts[0].type, 'FREE_THROW');
    assert.deepEqual(acts[0].attribution?.extra, { freeThrowsMade: 1, freeThrowsAtt: 1 });
    // "and one" is still the 2-point basket; "three" still 3.
    assert.deepEqual(basketballVoice('and one Asha', ctx(init(FIBA)))![0].payload, { points: 2 });
    assert.deepEqual(basketballVoice('three Asha', ctx(init(FIBA)))![0].payload, { points: 3 });
  });
  test('3×3 (first to 21) keeps the 1-point basket', () => {
    const acts = basketballVoice('one Asha', ctx(init({ targetPoints: 21, regPeriods: 1 })))!;
    assert.equal(acts[0].type, 'SCORE');
    assert.deepEqual(acts[0].payload, { points: 1 });
  });
});

describe('SD-05 — legacy replay identity (frozen pre-SD-05 engine)', () => {
  // Deterministic pseudo-random old logs: every action type the old UI sent,
  // including technicals, overtime and removals.
  function oldLog(seed: number, cfg?: Record<string, unknown>): ScoreAction[] {
    let x = seed;
    const rnd = (n: number) => { x = (x * 1103515245 + 12345) % 2147483648; return x % n; };
    const out: ScoreAction[] = [{ type: 'KICKOFF', payload: { at: 1 } }];
    const types = ['personal', 'shooting', 'technical', 'flagrant', 'offensive'];
    let q = 1;
    for (let i = 0; i < 160; i++) {
      const side: Side = rnd(2) ? 'home' : 'away';
      const who = `${side}-${rnd(7)}`;
      const r = rnd(20);
      const stamp = { quarter: q, minute: rnd(10) };
      if (r < 6) out.push({ type: 'SCORE', side, payload: { points: 1 + rnd(3), ...stamp }, attribution: { playerId: who, stat: 'points', by: 2, playerName: who } });
      else if (r < 9) out.push({ type: 'FREE_THROW', side, payload: { made: rnd(2) === 1, ...stamp }, attribution: { playerId: who, stat: 'points', playerName: who } });
      else if (r < 14) out.push({ type: 'FOUL', side, payload: { foulType: types[rnd(5)], ...stamp }, attribution: { playerId: who, stat: 'fouls', playerName: who } });
      else if (r === 14) out.push({ type: 'REBOUND', side, payload: { reboundType: rnd(2) ? 'off' : 'def', ...stamp }, attribution: { playerId: who, stat: 'rebounds', playerName: who } });
      else if (r === 15) out.push({ type: 'REMOVE_EVENT', side, payload: { id: 1 + rnd(i + 1) } });
      else if (r === 16) out.push({ type: 'TIMEOUT', side, payload: stamp });
      else if (r === 17 && i % 30 === 0) { out.push({ type: 'NEXT_QUARTER' }); q = Math.min(q + 1, 4); }
      else if (r === 18) out.push({ type: 'EJECT', side, payload: stamp, attribution: { playerId: who, stat: 'ejections', playerName: who } });
      else out.push({ type: 'STEAL', side, payload: stamp, attribution: { playerId: who, stat: 'steals', playerName: who } });
    }
    // Overtime tail: to Q4, level the score, then OT (twice) with fouls.
    out.push({ type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' });
    const pre = out.reduce(legacyReducer, legacyInit(cfg));
    if (pre.home !== pre.away) out.push({ type: 'SCORE', side: pre.home < pre.away ? 'home' : 'away', payload: { points: Math.abs(pre.home - pre.away) } });
    out.push({ type: 'START_OVERTIME' });
    for (let i = 0; i < 6; i++) out.push(foul(rnd(2) ? 'home' : 'away', `x${rnd(9)}`, types[rnd(5)]));
    out.push({ type: 'START_OVERTIME' });
    for (let i = 0; i < 12; i++) out.push(foul(rnd(2) ? 'home' : 'away', `x${rnd(9)}`, types[rnd(5)]));
    return out;
  }
  // Configs old matches actually stored: the old FIBA / NBA / NCAA / 3×3 / School
  // presets, a bare one, and none at all.
  const OLD_CONFIGS: (Record<string, unknown> | undefined)[] = [
    undefined, {},
    { playersPerSide: 5, substitutes: 5, regPeriods: 4, periodMinutes: 10, foulsToFoulOut: 5, foulsForBonus: 5, overtimeMinutes: 5, targetPoints: 0, winBy: 2, shotClock: 24, timeouts: 5 },
    { playersPerSide: 5, substitutes: 5, regPeriods: 4, periodMinutes: 12, foulsToFoulOut: 6, foulsForBonus: 5, overtimeMinutes: 5, targetPoints: 0, winBy: 2, shotClock: 24, timeouts: 7 },
    { playersPerSide: 5, substitutes: 7, regPeriods: 2, periodMinutes: 20, foulsToFoulOut: 5, foulsForBonus: 7, overtimeMinutes: 5, targetPoints: 0, winBy: 2, shotClock: 30, timeouts: 4 },
    { playersPerSide: 3, substitutes: 1, regPeriods: 1, periodMinutes: 10, foulsToFoulOut: 0, foulsForBonus: 7, overtimeMinutes: 0, targetPoints: 21, winBy: 1, shotClock: 12, timeouts: 1 },
    { playersPerSide: 5, substitutes: 5, foulsToFoulOut: 5, foulsForBonus: 5 }, // demo seed (mockData)
  ];
  test('same state and same team fouls / bonus at every step', () => {
    let checked = 0;
    let reachedOT = 0;
    for (const cfg of OLD_CONFIGS) {
      for (let seed = 1; seed <= 12; seed++) {
        let cur = init(cfg);
        let old = legacyInit(cfg);
        assert.deepEqual(cur, old);
        const log = oldLog(seed, cfg);
        for (const a of log) {
          cur = reducer(cur, a);
          old = legacyReducer(old, a);
          for (const side of ['home', 'away'] as const) {
            assert.equal(teamFoulsThisQuarter(cur, side), legacyTeamFouls(old, side));
            assert.equal(inBonus(cur, side), legacyInBonus(old, side));
          }
          checked++;
        }
        assert.deepEqual(cur, old, `cfg ${JSON.stringify(cfg)} seed ${seed}`);
        if (!old.ended && old.quarter > old.regPeriods) reachedOT++;
      }
    }
    assert.ok(checked > 10000);
    assert.ok(reachedOT >= 50, `overtime exercised in ${reachedOT} logs`);
  });
});
