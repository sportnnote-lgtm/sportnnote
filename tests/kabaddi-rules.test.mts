/**
 * Pro-Kabaddi scoring engine — the rules that decide a match.
 * Run: npm test   (node --test, TypeScript runs natively on Node 22+)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { replayRaids, type RaidOutcome, type KabaddiCfg } from '../src/sports/kabaddi/rules.ts';

const cfg = (over: Partial<KabaddiCfg> = {}): KabaddiCfg => ({
  teamSize: 7, style: 'sanjeevani', proRules: true, ...over,
});
const raid = (side: 'home' | 'away', touches = 0, bonus = false, raiderOut = false): RaidOutcome =>
  ({ side, touches, bonus, raiderOut });

describe('kabaddi: basic raiding', () => {
  test('touches score points and send defenders out', () => {
    const d = replayRaids([raid('home', 3)], cfg());
    assert.equal(d.home, 3);
    assert.equal(d.out.away, 3); // 3 defenders off the mat
    assert.equal(d.out.home, 0);
  });

  test('a bonus point scores without sending anyone out', () => {
    const d = replayRaids([raid('home', 0, true)], cfg());
    assert.equal(d.home, 1);
    assert.equal(d.out.away, 0);
  });

  test('an empty raid scores nothing', () => {
    const d = replayRaids([raid('home')], cfg());
    assert.equal(d.home, 0);
    assert.equal(d.away, 0);
  });
});

describe('kabaddi: tackles & super tackle', () => {
  test('a normal tackle is worth 1 to the defence', () => {
    // 7 defenders on the mat → not a super tackle
    const d = replayRaids([raid('home', 0, false, true)], cfg());
    assert.equal(d.away, 1);
    assert.equal(d.out.home, 1); // the raider is out
  });

  test('SUPER TACKLE: +2 when only 3 defenders remain', () => {
    const d = replayRaids([raid('home', 4), raid('home', 0, false, true)], cfg());
    // after 4 touches the defence is down to 3 on the mat → super tackle
    assert.equal(d.away, 2, 'defence should score 2, not 1');
    assert.equal(d.home, 4);
  });

  test('no super tackle when pro rules are off', () => {
    const d = replayRaids([raid('home', 4), raid('home', 0, false, true)], cfg({ proRules: false }));
    assert.equal(d.away, 1);
  });
});

describe('kabaddi: do-or-die', () => {
  test('a 3rd consecutive empty raid puts the raider out', () => {
    const d = replayRaids([raid('home'), raid('home'), raid('home')], cfg());
    assert.equal(d.away, 1, 'defence gets the point for the failed do-or-die');
    assert.equal(d.out.home, 1, 'the raider is out');
  });

  test('scoring resets the empty-raid streak', () => {
    const d = replayRaids([raid('home'), raid('home'), raid('home', 1), raid('home')], cfg());
    assert.equal(d.emptyRaids.home, 1, 'streak restarted after the scoring raid');
    assert.equal(d.out.home, 0, 'nobody auto-out — that raid was not a do-or-die');
  });

  test('do-or-die does not apply when pro rules are off', () => {
    const d = replayRaids([raid('home'), raid('home'), raid('home')], cfg({ proRules: false }));
    assert.equal(d.away, 0);
    assert.equal(d.out.home, 0);
  });
});

describe('kabaddi: all-out', () => {
  test('emptying the mat scores +2 and (sanjeevani) revives everyone', () => {
    const d = replayRaids([raid('home', 3), raid('home', 3), raid('home', 1)], cfg());
    // 3 + 3 + 1 touches = 7 points, +2 all-out bonus
    assert.equal(d.home, 9);
    assert.equal(d.out.away, 0, 'the emptied side revives to full strength');
    assert.equal(d.allOutEnded, false);
  });

  test('gaminee: an all-out ends the match', () => {
    const d = replayRaids([raid('home', 7), raid('home', 2)], cfg({ style: 'gaminee' }));
    assert.equal(d.allOutEnded, true);
    assert.equal(d.home, 9, '7 touches + 2 all-out; the raid after the end is ignored');
  });
});

describe('kabaddi: revival styles', () => {
  test('sanjeevani revives one of your own per opponent put out', () => {
    // away puts 2 home players out, then home touches 2 → home revives both
    const d = replayRaids([raid('away', 2), raid('home', 2)], cfg());
    assert.equal(d.out.home, 0, 'home revived its 2 out players');
    assert.equal(d.out.away, 2);
  });

  test('amar: nobody ever leaves the mat — points only', () => {
    // home touches 3 (+3), then away's raider is caught so home's defence adds 1
    const d = replayRaids([raid('home', 3), raid('away', 0, false, true)], cfg({ style: 'amar' }));
    assert.equal(d.home, 4);
    assert.equal(d.away, 0);
    assert.equal(d.out.home, 0, 'amar: the caught raider stays on the mat');
    assert.equal(d.out.away, 0, 'amar: touched defenders stay on the mat');
  });

  test('gaminee: no revival — outs accumulate', () => {
    const d = replayRaids([raid('away', 2), raid('home', 2)], cfg({ style: 'gaminee' }));
    assert.equal(d.out.home, 2, 'no revival, so home stays 2 down');
    assert.equal(d.out.away, 2);
  });
});

describe('kabaddi: replay integrity (undo correctness)', () => {
  test('dropping the last raid reproduces the earlier state exactly', () => {
    const raids = [raid('home', 3), raid('home', 3), raid('home', 1)];
    const before = replayRaids(raids.slice(0, 2), cfg());
    const afterUndo = replayRaids(raids.slice(0, -1), cfg()); // undo the all-out raid
    assert.deepEqual(afterUndo, before, 'undo must fully reverse the all-out + revival');
  });
});
