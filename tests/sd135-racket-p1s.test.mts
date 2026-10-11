/**
 * SD-135 — racket P1s from audit 2: pickleball change-ends cue + rally-doubles
 * server identity, squash Stroke / No let as one-tap decisions + 90 s cue,
 * tennis ITF doubles preset + DF box column, padel one-tap Ace coverage
 * (no false zeros) + 1st / 2nd serve tracking. Everything new is derived or
 * rides on new optional keys — legacy logs replay with the same fingerprints.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './racketLogs.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as padel from '../src/sports/padel/engine.ts';
import { makeRallyEngine, rallyInputs, serveSpot, serverId, type RallyState } from '../src/sports/rallyEngine.ts';
import { pickleballCue, squashCue, cueMarkers, rallyCueOf } from '../src/sports/courtCues.ts';
import { pointInputs } from '../src/sports/rallyEdit.ts';
import { serveStats, serveCareerKeys } from '../src/sports/serveStats.ts';
import { detailCoverage, detailKeys, detailRows, hasServeDetail } from '../src/sports/pointDetail.ts';
import { rallyTotals, padelTotals } from '../src/sports/racketTotals.ts';
import { tennisBox, rallyBox, padelBox } from '../src/sports/boxSources.ts';
import { readFileSync } from 'node:fs';

type Side = 'home' | 'away';
const P = (side: Side, payload?: Record<string, unknown>): ScoreAction => ({ type: 'POINT', side, ...(payload ? { payload } : {}) });
const FS = (side: Side, extra: Record<string, unknown> = {}): ScoreAction => ({ type: 'SET_FIRST_SERVER', payload: { side, ...extra } });
const run = <S,>(r: (s: S, a: ScoreAction) => S, s: S, as: ScoreAction[]) => as.reduce(r, s);
const pts = (sides: string) => [...sides].map((c) => P(c === 'h' ? 'home' : 'away'));
const R = { home: ['h1', 'h2'], away: ['a1', 'a2'] };

const PICKLE = makeRallyEngine({ id: 'pickleball', icon: '🥒', sideOutValue: 'sideout', sideOutLabel: 'Side-out', defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 } });
const SQUASH = makeRallyEngine({ id: 'squash', icon: '⚫', sideOutValue: 'english', sideOutLabel: 'Hand-out', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });

// ------------------------------------------------------------ pickleball --

describe('SD-135 · pickleball change-ends cue (USA Pickleball)', () => {
  const cueAfter = (cfg: Record<string, unknown>, log: ScoreAction[]) => pickleballCue(run(PICKLE.reducer, PICKLE.init(cfg), [FS('home', { alt: true }), ...log]));

  test('ends change after each game', () => {
    const c = cueAfter({}, pts('h'.repeat(11)));
    assert.equal(c?.kind, 'ends');
    assert.match(c!.text, /between games/);
  });
  test('no cue mid-game outside the deciding game', () => {
    assert.equal(cueAfter({}, pts('hhhhhh')), null);
  });
  test('deciding game to 11: at 6 (first side to reach it), once', () => {
    const log = [...pts('h'.repeat(11)), ...pts('a'.repeat(11))];
    assert.equal(cueAfter({}, [...log, ...pts('hhhhh')]), null);
    const c = cueAfter({}, [...log, ...pts('hhhhhh')]);
    assert.match(c!.text, /6 in the deciding game/);
    assert.equal(cueAfter({}, [...log, ...pts('hhhhhha')]), null);
    // the trailing side reaching 6 later doesn't fire again
    assert.equal(cueAfter({}, [...log, ...pts('hhhhhhaaaaaa')]), null);
  });
  test('single game to 15 → 8; to 21 → 11', () => {
    assert.match(cueAfter({ pointsPerGame: 15, gamesToWin: 1 }, pts('a'.repeat(8)))!.text, /8 in the game/);
    assert.equal(cueAfter({ pointsPerGame: 15, gamesToWin: 1 }, pts('a'.repeat(7))), null);
    assert.match(cueAfter({ pointsPerGame: 21, gamesToWin: 1 }, pts('h'.repeat(11)))!.text, /11 in the game/);
  });
  test('side-out: the cue sits right after the point, not on later side-outs', () => {
    const so = { scoring: 'sideout', gamesToWin: 1 };
    // home serves (0-0-2): six straight points → 6-0
    const at6 = cueAfter(so, pts('hhhhhh'));
    assert.match(at6!.text, /6 in the game/);
    // a fault by home's server: a 'rally' event, score unchanged → no cue
    assert.equal(cueAfter(so, [...pts('hhhhhh'), P('away')]), null);
  });
  test('timeline markers: one per game end and one at 6 in the decider', () => {
    const s = run(PICKLE.reducer, PICKLE.init({}), [FS('home', { alt: true }), ...pts('h'.repeat(11)), ...pts('a'.repeat(11)), ...pts('hhhhhhh')]);
    const cleared = PICKLE.reducer(s, { type: 'EDIT_LOG', payload: { points: [] } });
    const m = cueMarkers(PICKLE.reducer, cleared, rallyInputs(s.events), pickleballCue, s.events);
    assert.equal(m.length, 3);
    assert.equal(rallyCueOf('pickleball'), pickleballCue);
  });
});

describe('SD-135 · pickleball rally-scoring doubles server (USAP provisional rally scoring)', () => {
  const start = (extra: Record<string, unknown> = { alt: true, pos: 2 }) => PICKLE.reducer(PICKLE.init({}), FS('home', extra));
  const who = (s: RallyState) => `${serverId(s, R)}@${serveSpot(s).court}`;

  test('the same player keeps serving through a run, alternating courts', () => {
    let s = start();
    assert.equal(s.rallyPos, true);
    const seen = [who(s)];
    for (const a of pts('hhh')) { s = PICKLE.reducer(s, a); seen.push(who(s)); }
    assert.deepEqual(seen, ['h1@right', 'h1@left', 'h1@right', 'h1@left']);
  });
  test('the receiving team wins: no switch — the player in the parity court serves', () => {
    // home 1-0 (h1 switched to the left, h2 right); away wins → away 1: a2 is
    // still in the left court (no switch) and serves from the left
    let s = run(PICKLE.reducer, start(), pts('ha'));
    assert.equal(who(s), 'a2@left');
    // away keeps winning on its serve: a2 keeps serving, switching courts
    s = run(PICKLE.reducer, s, pts('aa'));
    assert.equal(who(s), 'a2@left');
    // home wins back at 1-3 as the receiver: no switch; home score 2 (even) →
    // the right court, where h2 has stood since home's one switch
    s = PICKLE.reducer(s, P('home'));
    assert.equal(who(s), 'h2@right');
  });
  test('serve stats credit the right server', () => {
    const s = run(PICKLE.reducer, start(), pts('hhhaaah'));
    const st = serveStats('pickleball', s, R)!;
    assert.equal(st.match.players.h1?.srvPlayed, 4); // 3 won + 1 lost
    assert.equal(st.match.players.h2, undefined);
    assert.equal(st.match.players.a2?.srvPlayed, 3); // 2 won (on own serve) + 1 lost
    assert.equal(serveCareerKeys(st, 'home', 'h2').srvPlayed ?? 0, 0);
  });
  test('older matches (no pos flag) keep the SD-06 naming', () => {
    let s = start({ alt: true });
    assert.equal(s.rallyPos, undefined);
    s = PICKLE.reducer(s, P('home'));
    assert.equal(who(s), 'h2@right');
  });
  test('legacy pickleball logs replay with the same fingerprint', () => {
    const a = run(PICKLE.reducer, PICKLE.init({}), L.PICKLEBALL_RALLY_LOG);
    const b = run(PICKLE.reducer, start(), L.PICKLEBALL_RALLY_LOG);
    assert.equal(L.fingerprint(a as never, ['current', 'games', 'gamesWon', 'ended']), L.fingerprint(b as never, ['current', 'games', 'gamesWon', 'ended']));
  });
});

// ---------------------------------------------------------------- squash --

describe('SD-135 · squash Stroke / No let one-tap + 90 s cue', () => {
  const sq = (cfg: Record<string, unknown> = {}) => SQUASH.reducer(SQUASH.init(cfg), FS('home'));

  test('Stroke → X scores X a point and records the decision with detail off', () => {
    const s = run(SQUASH.reducer, sq(), [P('away', { pd: { how: 'stroke' } }), P('home', { pd: { how: 'nolet' } })]);
    assert.deepEqual(s.current, { home: 1, away: 1 });
    assert.equal(s.pointDetail, undefined);
    const pd = s.events.filter((e) => e.pd).map((e) => `${e.side}:${e.pd!.how}`);
    assert.deepEqual(pd, ['away:stroke', 'home:nolet']);
    assert.equal(detailCoverage('squash', s), 'quick');
  });
  test('English scoring: a stroke to the receiver is a hand-out carrying the decision', () => {
    const s = run(SQUASH.reducer, sq({ scoring: 'english', pointsPerGame: 9, winBy: 1 }), [P('away', { pd: { how: 'stroke' } })]);
    assert.deepEqual(s.current, { home: 0, away: 0 });
    assert.equal(s.serving, 'away');
    assert.equal(s.events.at(-1)?.kind, 'rally');
    assert.equal(s.events.at(-1)?.pd?.how, 'stroke');
  });
  test('totals: decisions written, winners / errors stay untracked (no false zeros)', () => {
    const s = run(SQUASH.reducer, sq(), [P('away', { pd: { how: 'stroke' } }), ...pts('hhh'), P('home', { pd: { how: 'nolet' } })]);
    const t = rallyTotals(s, L.ctxOf({ home: ['h1'], away: ['a1'] }) as never, 'squash');
    assert.equal(t.a1.stats.strokesWon, 1);
    assert.equal(t.h1.stats.strokesConceded, 1);
    assert.equal(t.a1.stats.noLets, 1);
    assert.equal('winners' in t.h1.stats, false);
    assert.equal('unforcedErrors' in t.a1.stats, false);
    assert.deepEqual(detailKeys('squash', true), ['strokesWon', 'strokesConceded', 'noLets']);
    // the panel shows only the decision rows
    assert.deepEqual(detailRows('squash', s.events, undefined, false).map((r) => r.key), ['strokesWon', 'noLets']);
    // the box has no W / UE / FE columns
    const box = rallyBox(s, {}, 'squash').data('all');
    assert.equal('winners' in (box.home.rows[0]?.stats ?? {}), false);
  });
  test('detail mode on: still a full-detail match', () => {
    const s = run(SQUASH.reducer, SQUASH.init({ pointDetail: true }), [FS('home'), P('away', { pd: { how: 'stroke' } })]);
    assert.equal(detailCoverage('squash', s), 'full');
    const t = rallyTotals(s, L.ctxOf({ home: ['h1'], away: ['a1'] }) as never, 'squash');
    assert.equal(t.h1.stats.winners, 0);
  });
  test('the replayed log keeps the decision (timeline correction)', () => {
    const s = run(SQUASH.reducer, sq(), [P('away', { pd: { how: 'stroke' } }), ...pts('hh')]);
    const r = SQUASH.reducer(s, { type: 'EDIT_LOG', payload: { points: rallyInputs(s.events) } });
    assert.equal(r.events.filter((e) => e.pd?.how === 'stroke').length, 1);
    assert.deepEqual(r.current, s.current);
  });
  test('90 s between games, shown once (not mid-game)', () => {
    const s = run(SQUASH.reducer, sq(), pts('h'.repeat(11)));
    assert.match(squashCue(s)!.text, /90 s between games/);
    assert.equal(squashCue(SQUASH.reducer(s, P('away'))), null);
    assert.equal(rallyCueOf('squash'), squashCue);
  });
  test('legacy squash log replays unchanged', () => {
    const s = run(SQUASH.reducer, SQUASH.init({}), L.SQUASH_LOG);
    assert.deepEqual(s.games, [[11, 9], [8, 11], [11, 6], [7, 11], [12, 10]]);
  });
});

// ---------------------------------------------------------------- tennis --

describe('SD-135 · tennis ITF doubles preset + DF box column', () => {
  test('the preset: no-ad, set tiebreaks, a 10-point match tiebreak for the 3rd set', () => {
    // the plugin (RN) can't load in node: read the preset's `set` from source
    const src = readFileSync(new URL('../src/sports/tennis/index.tsx', import.meta.url), 'utf8');
    const m = /value: 'itf_dbl'[^\n]*set: (\{[^}]*\})/.exec(src);
    assert.ok(m, 'itf_dbl preset exists');
    const set = Function(`return (${m![1]})`)() as Record<string, unknown>;
    const s = tennis.init({ ...set, playersPerSide: 2 });
    assert.equal(s.noAd, true);
    assert.equal(s.finalSetTiebreak, 10);
    assert.equal(s.setsToWin, 2);
    // 6-4, 4-6 → a match tiebreak to 10 decides
    const after = run(tennis.reducer, s, [FS('home'), ...L.tSet(6, 4), ...L.tSet(4, 6), ...L.tbPts('home', 10)]);
    assert.equal(after.ended, true);
    assert.deepEqual(after.sets.at(-1), [10, 0]);
  });
  test('box score DF column counts the faulting server', () => {
    let s = run(tennis.reducer, tennis.init(), [FS('home')]);
    const df: ScoreAction = { type: 'POINT', side: 'away', payload: { df: true }, attribution2: { playerId: 'h1', playerName: 'Hana', stat: 'doubleFaults', side: 'home' } as never };
    s = run(tennis.reducer, s, [df, { type: 'POINT', side: 'home', attribution: { playerId: 'h1', playerName: 'Hana', stat: 'points' } }, df]);
    const ctx = { homeRoster: [{ id: 'h1', fullName: 'Hana' }], awayRoster: [{ id: 'a1', fullName: 'Ana' }] } as never;
    const d = tennisBox(s, ctx).data('all');
    assert.equal(d.home.rows.find((r) => r.name === 'Hana')?.stats.doubleFaults, 2);
    // a match with no marked double fault: column stays hidden (no key)
    const plain = tennisBox(run(tennis.reducer, tennis.init(), L.TENNIS_BO3), ctx).data('all');
    assert.equal(plain.home.rows.some((r) => 'doubleFaults' in r.stats), false);
  });
});

// ----------------------------------------------------------------- padel --

describe('SD-135 · padel Ace coverage + 1st / 2nd serve', () => {
  const ace = (side: Side) => P(side, { pd: { how: 'ace' } });
  test('an ace-only match is "quick": aces written, winners / errors untracked', () => {
    const s = run(padel.reducer, padel.init({ playersPerSide: 1 }), [FS('home'), ace('home'), P('home'), P('away')]);
    assert.equal(detailCoverage('padel', s), 'quick');
    const t = padelTotals(s, L.ctxOf({ home: ['h1'], away: ['a1'] }) as never);
    assert.equal(t.h1.stats.aces, 1);
    assert.equal(t.a1.stats.aces, 0);
    assert.equal('winners' in t.h1.stats, false);
    assert.equal('forcedErrors' in t.a1.stats, false);
    const box = padelBox(s, { homeRoster: [{ id: 'h1', fullName: 'H' }], awayRoster: [{ id: 'a1', fullName: 'A' }] } as never).data('all');
    assert.equal('winners' in box.home.rows[0].stats, false);
  });
  test('1st / 2nd serve: padel offers it and the serve figures follow', () => {
    assert.equal(hasServeDetail('padel'), true);
    let s = padel.reducer(padel.init({ playersPerSide: 1 }), FS('home'));
    s = padel.reducer(s, { type: 'SET_DETAIL', payload: { serveDetail: true } });
    s = run(padel.reducer, s, [P('home'), P('away'), { type: 'POINT_DETAIL', payload: { serve: 2 } }, P('away', { df: true })]);
    const served = s.events.filter((e) => e.serve).map((e) => e.serve);
    assert.deepEqual(served, [1, 2, 2]);
    const st = serveStats('padel', s, { home: ['h1'], away: ['a1'] })!;
    assert.equal(st.serveTracked, true);
    const k = serveCareerKeys(st, 'home', 'h1');
    assert.equal(k.srv1Pts, 3);
    assert.equal(k.srv1In, 1);
    // timeline correction keeps each point's serve
    const r = padel.reducer(s, { type: 'EDIT_LOG', payload: { points: pointInputs(s.events) } });
    assert.deepEqual(r.events.filter((e) => e.serve).map((e) => e.serve), [1, 2, 2]);
    assert.equal(r.serveDetail, true);
  });
  test('legacy padel log replays with the same fingerprint (no serve keys)', () => {
    const s = run(padel.reducer, padel.init(), L.PADEL_TWO_SETS);
    assert.equal(s.events.some((e) => e.serve), false);
    assert.equal(L.fingerprint(s as never, L.TENNIS_KEYS), L.fingerprint(run(padel.reducer, padel.init(), L.PADEL_TWO_SETS) as never, L.TENNIS_KEYS));
  });
});
