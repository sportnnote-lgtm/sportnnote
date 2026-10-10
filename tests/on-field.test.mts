/**
 * SD-29 (GEN-19) — the time-on-field / on-court tracker.
 *
 * Standards:
 * - FIFA / Opta minutes played: regulation minutes (90, +30 with extra time);
 *   added time is not counted. A red card ends a player's time and leaves the
 *   side a player down for the rest of the match.
 * - FIBA box score: MIN, and +/- = team points minus opponent points while
 *   the player was on court. A player who fouls out / is ejected is replaced.
 * - FIVB: per-set figures divide by the sets the player played (was on court in).
 * - FIH Rules of Hockey 14: green card = 2 minutes, yellow = at least 5
 *   (umpire's choice, 5–10), red = permanent; the team plays a player short
 *   meanwhile, the player returns automatically.
 * - IHF Rules of the Game 16: a 2-minute suspension; a disqualification leaves
 *   the team short for 2 minutes, then a team-mate may come on.
 * - Kabaddi (AKFI / IKF): yellow = 2-minute suspension; red = rest of the match.
 * Old logs replay to exactly their old state (frozen oracles).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { trackField, fieldAt, suspensionEvent, timeLeft, FIELD_RULES, type FieldEvent, type FieldLog } from '../src/sports/onField.ts';
import type { Suspension } from '../src/sports/statSchema.ts';
import { aggregateValue, statDefIn } from '../src/sports/statSchema.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { init as fbInit, reducer as fbReducer, type FootballState } from '../src/sports/football/engine.ts';
import { keeperTotals } from '../src/sports/football/keepers.ts';
import { footballTotals, footballLiveField, footballField } from '../src/sports/football/fieldTime.ts';
import { init as fbLegacyInit, reducer as fbLegacyReducer } from './footballLegacyEngine.mts';
import { init as bkInit, reducer as bkReducer, type BasketballState } from '../src/sports/basketball/engine.ts';
import { basketballTotals, boxFieldByName } from '../src/sports/basketball/fieldTime.ts';
import { legacyInit as bkLegacyInit, legacyReducer as bkLegacyReducer } from './basketballLegacyReducer.mts';
import { init as vbInit, reducer as vbReducer, type VolleyballState } from '../src/sports/volleyball/engine.ts';
import { volleyballTotals } from '../src/sports/volleyball/fieldTime.ts';
import { legacyInit as vbLegacyInit, legacyReducer as vbLegacyReducer } from './volleyballLegacyReducer.mts';
import { planStatSync } from '../src/data/statSync.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { StatLine } from '../src/core/types.ts';

type Side = 'home' | 'away';
const W = (id: string) => ({ id, name: id.toUpperCase() });
const log = (home: string[], away: string[], events: FieldEvent[], end: number): FieldLog =>
  ({ starters: { home: home.map(W), away: away.map(W) }, events, end });
const of = (r: ReturnType<typeof trackField>, id: string) => r.players.find((p) => p.id === id)!;

/* --------------------------------- generic -------------------------------- */

describe('SD-29 · generic tracker: subs, reds, minutes, +/-', () => {
  test('a sub at 60: starter 60, sub 30; untouched players the full 90', () => {
    const r = trackField(log(['a', 'b'], ['x'], [{ kind: 'sub', t: 60, side: 'home', off: W('a'), on: W('c') }], 90));
    assert.equal(of(r, 'a').minutes, 60);
    assert.equal(of(r, 'c').minutes, 30);
    assert.equal(of(r, 'b').minutes, 90);
    assert.equal(of(r, 'a').started, true);
    assert.equal(of(r, 'c').started, false);
    assert.deepEqual(r.onField.home.map((p) => p.id), ['b', 'c']);
  });
  test('a red card ends the player\'s time and leaves the side short for good', () => {
    const r = trackField(log(['a', 'b'], ['x'], [{ kind: 'off', t: 20, side: 'home', who: W('a') }], 90));
    assert.equal(of(r, 'a').minutes, 20);
    assert.equal(of(r, 'a').sentOff, true);
    assert.deepEqual(r.short, { home: 1, away: 0 });
    // a sent-off player can't come back on
    const r2 = trackField(log(['a', 'b'], [], [{ kind: 'off', t: 20, side: 'home', who: W('a') }, { kind: 'sub', t: 30, side: 'home', off: W('b'), on: W('a') }], 90));
    assert.equal(of(r2, 'a').minutes, 20);
  });
  test('rolling subs: off and back on — two spells, minutes add up', () => {
    const r = trackField(log(['a'], [], [
      { kind: 'sub', t: 10, side: 'home', off: W('a'), on: W('b') },
      { kind: 'sub', t: 25, side: 'home', off: W('b'), on: W('a') },
    ], 40));
    assert.equal(of(r, 'a').minutes, 25);
    assert.equal(of(r, 'a').spells.length, 2);
    assert.equal(of(r, 'b').minutes, 15);
  });
  test('+/-: points for minus against while on; a sub at the same moment is applied first (log order)', () => {
    const r = trackField(log(['a', 'b'], ['x'], [
      { kind: 'score', t: 5, side: 'home', points: 2 },
      { kind: 'score', t: 8, side: 'away', points: 3 },
      { kind: 'sub', t: 10, side: 'home', off: W('a'), on: W('c') },
      { kind: 'score', t: 10, side: 'home', points: 2 },
      { kind: 'score', t: 12, side: 'away', points: 1 },
    ], 20));
    assert.equal(of(r, 'a').plusMinus, -1); // +2 −3
    assert.equal(of(r, 'b').plusMinus, 0); // +2 −3 +2 −1
    assert.equal(of(r, 'c').plusMinus, 1); // +2 −1
    assert.equal(of(r, 'x').plusMinus, 0);
  });
  test('names resolve to ids seen elsewhere (older name-only events)', () => {
    const r = trackField(log(['a'], [], [{ kind: 'sub', t: 30, side: 'home', off: { name: 'A' }, on: { name: 'B' } }], 90));
    assert.equal(of(r, 'a').minutes, 30);
    assert.equal(r.players.find((p) => p.name === 'B')?.id, undefined);
    assert.equal(r.players.find((p) => p.name === 'B')?.minutes, 60);
  });
  test('periods: a player is in each period he was on the field in (sets played)', () => {
    const r = trackField(log(['a', 'b'], [], [
      { kind: 'period', t: 10, period: 2 },
      { kind: 'sub', t: 12, side: 'home', off: W('b'), on: W('c') },
      { kind: 'period', t: 20, period: 3 },
      { kind: 'sub', t: 20, side: 'home', off: W('c'), on: W('b') },
    ], 30));
    assert.deepEqual(of(r, 'a').periods, [1, 2, 3]);
    assert.deepEqual(of(r, 'b').periods, [1, 2, 3]);
    assert.deepEqual(of(r, 'c').periods, [2, 3]); // on at the start of set 3, then off
  });
});

describe('SD-29 · timed suspensions end automatically', () => {
  test('a 2-minute suspension: off at 10, back at 12; the side short meanwhile', () => {
    const l = log(['a', 'b'], ['x'], [{ kind: 'suspend', t: 10, side: 'home', who: W('a'), minutes: 2 }], 20);
    const mid = fieldAt(l, 11);
    assert.deepEqual(mid.short, { home: 1, away: 0 });
    assert.equal(mid.suspended[0].id, 'a');
    assert.equal(mid.suspended[0].until, 12);
    assert.equal(timeLeft(mid.suspended[0].until, 10.6), '1:24');
    const after = fieldAt(l, 12);
    assert.deepEqual(after.short, { home: 0, away: 0 });
    assert.equal(after.suspended.length, 0);
    assert.ok(after.onField.home.some((p) => p.id === 'a'));
    const end = trackField(l);
    assert.equal(of(end, 'a').minutes, 18);
    assert.equal(of(end, 'a').suspendedMinutes, 2);
    assert.equal(of(end, 'a').suspensions, 1);
  });
  test('+/- skips the suspended player; a goal at the expiry minute counts for him', () => {
    const r = trackField(log(['a', 'b'], ['x'], [
      { kind: 'suspend', t: 10, side: 'home', who: W('a'), minutes: 2 },
      { kind: 'score', t: 11, side: 'away', points: 1 },
      { kind: 'score', t: 12, side: 'home', points: 1 },
    ], 20));
    assert.equal(of(r, 'a').plusMinus, 1);
    assert.equal(of(r, 'b').plusMinus, 0);
  });
  test('a second suspension while still off is served after the first', () => {
    const r = fieldAt(log(['a'], [], [
      { kind: 'suspend', t: 10, side: 'home', who: W('a'), minutes: 2 },
      { kind: 'suspend', t: 11, side: 'home', who: W('a'), minutes: 2 },
    ], 30), 13);
    assert.equal(r.suspended[0].until, 14);
    assert.equal(r.short.home, 1);
  });
  test('two players suspended: the side is two short', () => {
    const r = fieldAt(log(['a', 'b', 'c'], [], [
      { kind: 'suspend', t: 10, side: 'home', who: W('a'), minutes: 2 },
      { kind: 'suspend', t: 11, side: 'home', who: W('b'), minutes: 2 },
    ], 30), 11.5);
    assert.equal(r.short.home, 2);
    assert.equal(r.onField.home.length, 1);
  });
  test('a red during a suspension: off for good, the side short for good', () => {
    const r = trackField(log(['a', 'b'], [], [
      { kind: 'suspend', t: 10, side: 'home', who: W('a'), minutes: 5 },
      { kind: 'off', t: 12, side: 'home', who: W('a') },
    ], 30));
    assert.equal(of(r, 'a').minutes, 10);
    assert.equal(r.short.home, 1);
    assert.equal(r.suspended.length, 0);
  });
});

/* ---------------------- hockey (FIH) — sample log -------------------------- */

// The SD-15 hockey schema sample's card declarations (tests/stat-schema.test.mts,
// `hockey`): green 2', yellow 5–10', red permanent. No hockey plugin yet (SD-101).
const HOCKEY_CARDS: Record<'greenCards' | 'yellowCards' | 'redCards', Suspension> = {
  greenCards: { minutes: 2 },
  yellowCards: { minutes: 5, maxMinutes: 10 },
  redCards: { permanent: true },
};
/** A hockey card in a would-be SD-101 log: { minute (game clock), side, player, card, minutes? }. */
type HockeyCard = { minute: number; side: Side; player: string; card: keyof typeof HOCKEY_CARDS; minutes?: number };
const hockeyLog = (cards: HockeyCard[], goals: { minute: number; side: Side }[], end = 60): FieldLog => ({
  starters: { home: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10', 'hgk'].map(W), away: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10', 'agk'].map(W) },
  events: [
    ...cards.map((c) => suspensionEvent(HOCKEY_CARDS[c.card], { t: c.minute, side: c.side, who: W(c.player) }, { minutes: c.minutes })!),
    ...goals.map((g): FieldEvent => ({ kind: 'score', t: g.minute, side: g.side, points: 1 })),
  ],
  end,
});

describe('SD-29 · hockey: green / yellow cards expire, the team plays short meanwhile', () => {
  const cards: HockeyCard[] = [
    { minute: 8, side: 'home', player: 'h3', card: 'greenCards' },
    { minute: 20, side: 'away', player: 'a5', card: 'yellowCards' }, // 5'
    { minute: 21, side: 'away', player: 'a7', card: 'yellowCards', minutes: 10 }, // umpire: 10'
    { minute: 40, side: 'home', player: 'h9', card: 'redCards' },
    { minute: 50, side: 'away', player: 'a2', card: 'yellowCards', minutes: 15 }, // clamped to 10
  ];
  const l = hockeyLog(cards, [{ minute: 22, side: 'home' }, { minute: 33, side: 'away' }]);
  test('green: 2 minutes, back at 10\'', () => {
    assert.deepEqual(fieldAt(l, 9).short, { home: 1, away: 0 });
    assert.equal(fieldAt(l, 9).onField.home.length, 10);
    assert.deepEqual(fieldAt(l, 10).short, { home: 0, away: 0 });
    assert.equal(fieldAt(l, 10).onField.home.length, 11);
  });
  test('yellow 5\' and 10\': two short from 21 to 25, one short to 31, then full', () => {
    assert.equal(fieldAt(l, 22).short.away, 2);
    assert.equal(fieldAt(l, 22).onField.away.length, 9);
    assert.equal(fieldAt(l, 26).short.away, 1);
    assert.equal(fieldAt(l, 31).short.away, 0);
    assert.deepEqual(fieldAt(l, 22).suspended.map((x) => [x.id, x.until]), [['a5', 25], ['a7', 31]]);
  });
  test('red: permanent — home 10 for the rest of the match', () => {
    assert.equal(fieldAt(l, 45).short.home, 1);
    assert.equal(trackField(l).short.home, 1);
    assert.equal(of(trackField(l), 'h9').minutes, 40);
  });
  test('a yellow longer than the rule allows is clamped to 10\'', () => {
    assert.equal(fieldAt(l, 51).suspended.find((x) => x.id === 'a2')?.until, 60);
  });
  test('minutes and +/- over the 60-minute game', () => {
    const r = trackField(l);
    assert.equal(of(r, 'h3').minutes, 58);
    assert.equal(of(r, 'a5').minutes, 55);
    assert.equal(of(r, 'a7').minutes, 50);
    assert.equal(of(r, 'a2').minutes, 50);
    assert.equal(of(r, 'h1').minutes, 60);
    // home goal at 22 while a5 / a7 were off: −1 for the other away players only
    assert.equal(of(r, 'a5').plusMinus, 0 - 0 + 1); // missed the 22' goal, on for the 33' one
    assert.equal(of(r, 'a1').plusMinus, 0); // −1 + 1
    assert.equal(of(r, 'h1').plusMinus, 0);
  });
});

describe('SD-29 · handball 2-minute suspensions and disqualification', () => {
  test('2-minute suspension: six court players, back after 2:00', () => {
    const l = log(['g', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'], ['x'], [{ kind: 'suspend', t: 14.5, side: 'home', who: W('p4'), minutes: FIELD_RULES.handball.twoMinutes.minutes }], 60);
    assert.equal(fieldAt(l, 16).onField.home.length, 6);
    assert.equal(timeLeft(fieldAt(l, 16).suspended[0].until, 16), '0:30');
    assert.equal(fieldAt(l, 16.5).onField.home.length, 7);
    assert.equal(of(trackField(l), 'p4').minutes, 58);
  });
  test('disqualification: out for good, the team short for 2 minutes, then a team-mate comes on', () => {
    const l = log(['g', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'], [], [
      { kind: 'off', t: 30, side: 'home', who: W('p2'), shortFor: FIELD_RULES.handball.red.shortFor },
      { kind: 'enter', t: 32, side: 'home', who: W('p7') },
    ], 60);
    assert.equal(fieldAt(l, 31).short.home, 1);
    assert.equal(fieldAt(l, 32).short.home, 0);
    assert.equal(fieldAt(l, 32).onField.home.length, 7);
    assert.equal(of(trackField(l), 'p7').minutes, 28);
  });
});

describe('SD-29 · kabaddi yellow = 2-minute suspension (rule constant; cards UI is SD-72)', () => {
  test('a yellow at 12\' — on the mat again at 14\'', () => {
    const l = log(['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7'], [], [suspensionEvent(FIELD_RULES.kabaddi.yellow, { t: 12, side: 'home', who: W('k3') })!], 40);
    assert.equal(fieldAt(l, 13).onField.home.length, 6);
    assert.equal(fieldAt(l, 14).onField.home.length, 7);
    // red: the rest of the match
    const red = suspensionEvent({ permanent: true }, { t: 12, side: 'home', who: W('k3') });
    assert.equal(trackField(log(['k1', 'k3'], [], [red!], 40)).short.home, 1);
  });
});

/* -------------------------------- football -------------------------------- */

const run = (s: FootballState, ...as: ScoreAction[]) => as.reduce(fbReducer, s);
const p = (id: string) => ({ id, name: id.toUpperCase() });
const xi = (team: Side, gk: string, players: string[]): ScoreAction => ({ type: 'XI', payload: { team, gk: p(gk), players: players.map(p), keepers: [p(gk)] } });
const sub = (side: Side, minute: number, half: 1 | 2, off: string, on: string, ids = true): ScoreAction =>
  ({ type: 'SUB', side, payload: { minute, half, offName: off.toUpperCase(), onName: on.toUpperCase(), ...(ids ? { offId: off, onId: on } : {}) } });
const goal = (side: Side, minute: number, half: 1 | 2): ScoreAction =>
  ({ type: 'GOAL', side, payload: { minute, half, goalType: 'open' }, attribution: { playerId: 'x', stat: 'goals', playerName: 'X' } });
const KO: ScoreAction = { type: 'KICKOFF', payload: { at: 1_000, ord: true } };
const HT: ScoreAction = { type: 'NEXT_HALF', payload: { at: 2 } };
const END: ScoreAction = { type: 'END', payload: { at: 3 } };
const fbStart = (cfg: Record<string, unknown> = {}) => run(fbInit(cfg), KO, xi('home', 'hgk', ['hgk', 'h1', 'h2']), xi('away', 'agk', ['agk', 'a1', 'a2']));

describe('SD-29 · football minutes for every player (FB-02)', () => {
  test('starters 90, a sub on at 60 gets 30, a red at 20 gets 20; keepers keep SD-09 figures', () => {
    const s = run(fbStart(), { type: 'RED', side: 'away', payload: { minute: 20, half: 1 }, attribution: { playerId: 'a2', stat: 'redCards', playerName: 'A2' } },
      goal('home', 30, 1), HT, sub('home', 60, 2, 'h1', 'h3'), END);
    const t = footballTotals(s);
    assert.deepEqual(t.h1.stats, { minutes: 60 });
    assert.deepEqual(t.h3.stats, { minutes: 30 });
    assert.deepEqual(t.h2.stats, { minutes: 90 });
    assert.deepEqual(t.a2.stats, { minutes: 20 });
    assert.deepEqual(t.hgk.stats, { minutes: 90, cleanSheets: 1, goalsConceded: 0 });
    assert.deepEqual(t.agk.stats, { minutes: 90, cleanSheets: 0, goalsConceded: 1 });
    assert.equal(t.h3.side, 'home');
  });
  test('added time is not counted: a sub at 90+3 → the starter 90, the sub 0 (still an appearance)', () => {
    let s = fbStart();
    s = run(s, HT, { type: 'SET_STOPPAGE', payload: { minutes: 4 } }, sub('home', 93, 2, 'h2', 'h4'), END);
    assert.equal(footballTotals(s).h2.stats.minutes, 90);
    assert.equal(footballTotals(s).h4.stats.minutes, 0);
  });
  test('extra time: 120', () => {
    const s = run(fbStart({ decider: 'extra_time' }), HT, END, { type: 'START_EXTRA_TIME' }, { type: 'KICKOFF', payload: { at: 4 } }, { type: 'NEXT_HALF', payload: { at: 5 } }, END);
    assert.equal(footballTotals(s).h1.stats.minutes, 120);
  });
  test('keeper minutes agree with SD-09 keeper spells (frozen oracle of the keeper figures)', () => {
    const s = run(fbStart(), goal('away', 20, 1), sub('home', 30, 1, 'hgk', 'hgk2'), HT, goal('away', 70, 2), END);
    const k = keeperTotals(s);
    const t = footballTotals(s);
    for (const id of Object.keys(k)) {
      assert.equal(t[id].stats.cleanSheets, k[id].stats.cleanSheets);
      assert.equal(t[id].stats.goalsConceded, k[id].stats.goalsConceded);
      assert.equal(t[id].stats.minutes, k[id].stats.minutes, id);
    }
  });
  test('a red card for a bench player gives him no minutes', () => {
    const s = run(fbStart(), { type: 'RED', side: 'home', payload: { minute: 50, half: 2 }, attribution: { playerId: 'h9', stat: 'redCards', playerName: 'H9' } }, END);
    assert.equal(footballTotals(s).h9, undefined);
  });
  test('old logs (no XI stamp) → nothing written', () => {
    const s = run(fbInit({}), { type: 'KICKOFF', payload: { at: 1 } }, sub('home', 60, 2, 'h1', 'h3', false), HT, END);
    assert.deepEqual(footballTotals(s), {});
  });
  test('the sync now also zeroes a defender\'s stale legacy clean sheet', () => {
    const s = run(fbStart(), HT, END);
    const writes = planStatSync([{ id: 'L1', playerId: 'h1', stats: { cleanSheets: 1, tackles: 3 } }], footballTotals(s), (x) => x);
    const w = writes.find((x) => x.kind === 'update' && x.playerId === 'h1');
    assert.deepEqual(w && w.kind === 'update' ? w.stats : null, { cleanSheets: 0, tackles: 3, minutes: 90 });
  });
});

describe('SD-29 · football sin-bin (optional format)', () => {
  const sin = (side: Side, minute: number, half: 1 | 2, who: string, sec?: number): ScoreAction =>
    ({ type: 'SUSPEND', side, payload: { minute, half, ...(sec !== undefined ? { sec } : {}) }, attribution: { playerId: who, stat: 'sinBins', playerName: who.toUpperCase() } });
  test('without a sin-bin in the format, SUSPEND does nothing', () => {
    const s = fbStart();
    assert.equal(run(s, sin('home', 10, 1, 'h1')), s);
  });
  test('10 minutes off: minutes exclude the sin-bin; the side is short meanwhile', () => {
    const s = run(fbStart({ sinBinMinutes: 10 }), sin('home', 20, 1, 'h1'), HT, END);
    assert.equal(s.events.at(-1)?.type, 'sinbin');
    assert.equal(footballTotals(s).h1.stats.minutes, 80);
    const mid = footballField(run(fbStart({ sinBinMinutes: 10 }), sin('home', 20, 1, 'h1')));
    assert.ok(mid.players.find((x) => x.id === 'h1')!.suspensions === 1);
  });
  test('live banner: time left counts down from the exact clock second; 2 v 3 on the pitch', () => {
    let s = run(fbStart({ sinBinMinutes: 10 }));
    const t0 = s.startedAt!;
    s = run(s, sin('home', 21, 1, 'h1', 20 * 60 + 30)); // 20:30
    const live = footballLiveField(s, t0 + (25 * 60 + 6) * 1000); // 25:06
    assert.deepEqual(live.suspended, [{ side: 'home', name: 'H1', left: '5:24' }]);
    assert.deepEqual(live.onPitch, { home: 2, away: 3 });
    assert.deepEqual(live.short, { home: 1, away: 0 });
    const back = footballLiveField(s, t0 + (30 * 60 + 31) * 1000);
    assert.deepEqual(back.suspended, []);
    assert.deepEqual(back.onPitch, { home: 3, away: 3 });
  });
  test('legacy replay identity: an old log replays to the frozen pre-SD-08 state', () => {
    const old: ScoreAction[] = [
      { type: 'KICKOFF', payload: { at: 5 } },
      goal('home', 12, 1),
      { type: 'YELLOW', side: 'away', payload: { minute: 30, half: 1 }, attribution: { playerId: 'a1', stat: 'yellowCards', playerName: 'A1' } },
      HT,
      sub('away', 60, 2, 'a1', 'a3', false),
      { type: 'RED', side: 'home', payload: { minute: 70, half: 2 }, attribution: { playerId: 'h1', stat: 'redCards', playerName: 'H1' } },
      END,
    ];
    const cfg = { halfMinutes: 45, substitutes: 5 };
    assert.deepEqual(old.reduce(fbReducer, fbInit(cfg)), old.reduce(fbLegacyReducer as never, fbLegacyInit(cfg) as never));
  });
});

/* ------------------------------- basketball ------------------------------- */

const bk = (s: BasketballState, ...as: ScoreAction[]) => as.reduce(bkReducer, s);
const five = (side: Side, names: string[]): ScoreAction =>
  ({ type: 'SET_LINEUP', payload: { [side]: names, ids: Object.fromEntries(names.map((n) => [n, n.toLowerCase()])) } });
const pts = (side: Side, quarter: number, minute: number, points: number, name = side === 'home' ? 'H1' : 'A1'): ScoreAction =>
  ({ type: 'SCORE', side, payload: { quarter, minute, points }, attribution: { playerId: name.toLowerCase(), stat: 'points', playerName: name } });
const bsub = (side: Side, quarter: number, minute: number, off: string, on: string): ScoreAction =>
  ({ type: 'SUB', side, payload: { quarter, minute, offName: off, onName: on, offId: off.toLowerCase(), onId: on.toLowerCase() } });

describe('SD-29 · basketball MIN and +/- (BK-10)', () => {
  const H = ['H1', 'H2', 'H3', 'H4', 'H5'], A = ['A1', 'A2', 'A3', 'A4', 'A5'];
  const cfg = { periodMinutes: 10, regPeriods: 4 };
  const game = () => bk(bkInit(cfg), five('home', H), five('away', A),
    pts('home', 1, 2, 2), pts('away', 1, 3, 3),
    bsub('home', 1, 5, 'H5', 'H6'),
    pts('home', 1, 6, 3, 'H6'),
    { type: 'NEXT_QUARTER' }, pts('away', 2, 1, 2),
    { type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' }, { type: 'END' });
  test('MIN from the five + subs; +/- while on court', () => {
    const t = basketballTotals(game());
    assert.deepEqual(t.h5.stats, { minutes: 5, plusMinus: -1 }); // +2 −3
    assert.deepEqual(t.h6.stats, { minutes: 35, plusMinus: 1 }); // +3 −2
    assert.deepEqual(t.h1.stats, { minutes: 40, plusMinus: 0 });
    assert.deepEqual(t.a1.stats, { minutes: 40, plusMinus: 0 });
    // the team's +/- adds up to five times the margin
    const home = Object.values(t).filter((x) => x.side === 'home').reduce((a, x) => a + x.stats.plusMinus, 0);
    assert.equal(home, 5 * (5 - 5));
  });
  test('box score columns by name, on-court marker live', () => {
    const s = bk(bkInit(cfg), five('home', H), five('away', A), bsub('home', 1, 5, 'H5', 'H6'), pts('home', 1, 6, 2, 'H6'));
    const f = boxFieldByName(s);
    assert.equal(f.get('H6')?.on, true);
    assert.equal(f.get('H5')?.on, false);
    assert.equal(f.get('H6')?.pm, 2);
  });
  test('a foul-out: replaced at once, no more minutes', () => {
    let s = bk(bkInit({ ...cfg, foulsToFoulOut: 2 }), five('home', H), five('away', A));
    s = bk(s, ...[3, 4].map((m): ScoreAction => ({ type: 'FOUL', side: 'home', payload: { quarter: 1, minute: m }, attribution: { playerId: 'h2', stat: 'fouls', playerName: 'H2' } })),
      { type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' }, { type: 'NEXT_QUARTER' }, { type: 'END' });
    assert.equal(basketballTotals(s).h2.stats.minutes, 4);
  });
  test('first-to-21 (3×3): +/- only, no minutes', () => {
    const s = bk(bkInit({ targetPoints: 21 }), five('home', ['H1']), five('away', ['A1']), pts('home', 1, 0, 2));
    assert.deepEqual(basketballTotals(s).h1.stats, { plusMinus: 2 });
  });
  test('no five set → nothing (old logs and quick subs)', () => {
    const s = bk(bkInit(cfg), pts('home', 1, 2, 2), { type: 'SUB', side: 'home', payload: { offName: 'H1', onName: 'H6' } }, { type: 'END' });
    assert.deepEqual(basketballTotals(s), {});
  });
  test('legacy replay identity: an old log (no ids) replays to the frozen state', () => {
    const old: ScoreAction[] = [
      { type: 'SET_LINEUP', payload: { home: H } }, pts('home', 1, 1, 2),
      { type: 'SUB', side: 'home', payload: { offName: 'H1', onName: 'H6' } },
      { type: 'FOUL', side: 'away', payload: { foulType: 'personal' }, attribution: { playerId: 'a1', stat: 'fouls', playerName: 'A1' } },
      { type: 'END' },
    ];
    assert.deepEqual(old.reduce(bkReducer, bkInit({})), old.reduce(bkLegacyReducer as never, bkLegacyInit({}) as never));
  });
});

/* ------------------------------- volleyball ------------------------------- */

const vb = (s: VolleyballState, ...as: ScoreAction[]) => as.reduce(vbReducer, s);
const court = (team: Side, ids: string[]): ScoreAction => ({ type: 'LINEUP', payload: { team, players: ids.map(p) } });
const atk = (side: Side, who?: string): ScoreAction =>
  ({ type: 'ATTACK', side, attribution: who ? { playerId: who, stat: 'points', playerName: who.toUpperCase() } : undefined });
/** Win a set 25-0 for `side` (credited to `who` on the first point). */
const set = (side: Side, who?: string): ScoreAction[] => Array.from({ length: 25 }, (_, i) => atk(side, i === 0 ? who : undefined));

describe('SD-29 · volleyball sets played (VB-06 base) → per-set rates', () => {
  test('3–0: the court six played 3 sets; a bench player credited in set 2 played 1', () => {
    const s = vb(vbInit({ setsToWin: 3 }), court('home', ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']), court('away', ['a1']),
      ...set('home', 'h1'), ...set('home', 'h7'), ...set('home'));
    assert.equal(s.ended, true);
    const t = volleyballTotals(s);
    assert.deepEqual(t.h1, { side: 'home', stats: { setsPlayed: 3 } });
    assert.deepEqual(t.h7.stats, { setsPlayed: 1 });
    assert.deepEqual(t.a1.stats, { setsPlayed: 3 });
    assert.equal(s.events.find((e) => e.playerName === 'H1')?.playerId, 'h1');
  });
  test('no court stamped (older logs) → nothing written, no ids on points', () => {
    const s = vb(vbInit({ setsToWin: 1 }), ...set('home', 'h1'));
    assert.deepEqual(volleyballTotals(s), {});
    assert.equal(s.events[0].playerId, undefined);
  });
  test('the court stamp survives a point edit (EDIT_LOG)', () => {
    const s = vb(vbInit({}), court('home', ['h1']), atk('home', 'h1'), { type: 'EDIT_LOG', payload: { points: [{ side: 'away', kind: 'attack' }] } });
    assert.deepEqual(s.lineup?.home, [p('h1')]);
    assert.deepEqual(volleyballTotals(s).h1.stats, { setsPlayed: 1 });
  });
  test('per-set rates divide by sets played', () => {
    const schema = STAT_SCHEMAS.volleyball;
    const line = (id: string, stats: Record<string, number>) => ({ id, playerId: 'h1', matchId: id, sport: 'volleyball', stats, won: true, date: '2026-10-10' }) as unknown as StatLine;
    const lines = [line('m1', { points: 12, setsPlayed: 3 }), line('m2', { points: 9, setsPlayed: 3 }), line('m3', { points: 30 })];
    const v = aggregateValue(schema, statDefIn(schema, 'pointsPerSet')!, lines);
    assert.equal(v.text, '3.50'); // (12 + 9) ÷ 6 — the line without sets played stays out
  });
  test('legacy replay identity: an old log replays to the frozen pre-SD-04 state', () => {
    const old: ScoreAction[] = [
      { type: 'POINT', side: 'home', attribution: { playerId: 'h1', stat: 'points', playerName: 'H1' } },
      { type: 'ACE', side: 'away', attribution: { playerId: 'a1', stat: 'aces', playerName: 'A1' } },
      { type: 'BLOCK', side: 'home', attribution: { playerId: 'h2', stat: 'blocks', playerName: 'H2' } },
    ];
    assert.deepEqual(old.reduce(vbReducer, vbInit({})), old.reduce(vbLegacyReducer as never, vbLegacyInit({}) as never));
  });
});

describe('SD-29 · football sin-bin without a lineup', () => {
  test('the banner still shows; no minutes are written for the unstamped side', () => {
    let s = run(fbInit({ sinBinMinutes: 10 }), KO);
    s = run(s, { type: 'SUSPEND', side: 'home', payload: { minute: 1, half: 1, sec: 20 }, attribution: { playerId: 'h1', stat: 'sinBins', playerName: 'H1' } });
    const live = footballLiveField(s, s.startedAt! + 60_000);
    assert.deepEqual(live.suspended, [{ side: 'home', name: 'H1', left: '9:20' }]);
    assert.equal(live.onPitch, null);
    assert.deepEqual(footballTotals(run(s, HT, END)), {});
  });
});
