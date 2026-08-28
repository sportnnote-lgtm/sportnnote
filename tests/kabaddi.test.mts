/**
 * Kabaddi scoring engine (replayRaids) — the raid/tackle/super-tackle maths the
 * guided raid, the defender credit, and voice all rely on.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { replayRaids, type RaidOutcome, type KabaddiCfg } from '../src/sports/kabaddi/rules.ts';

const cfg: KabaddiCfg = { teamSize: 7, style: 'sanjeevani', proRules: true };
const raid = (side: 'home' | 'away', touches: number, bonus: boolean, raiderOut: boolean): RaidOutcome => ({ side, touches, bonus, raiderOut });

describe('kabaddi — raids & tackles', () => {
  test('a 1-touch raid scores 1 and sends a defender out', () => {
    const d = replayRaids([raid('home', 1, false, false)], cfg);
    assert.equal(d.home, 1);
    assert.equal(d.out.away, 1);
  });

  test('a tackle (raider out) with a full defence scores 1 for the defenders', () => {
    // home raids, raider tackled → away (the defenders) score 1
    const d = replayRaids([raid('home', 0, false, true)], cfg);
    assert.equal(d.away, 1);
    assert.equal(d.out.home, 1); // the raider is out
  });

  test('a super-tackle (≤3 defenders on the mat) scores 2', () => {
    // first reduce away to 3 on the mat (touch 4 out), then tackle the raider
    const d = replayRaids([raid('home', 4, false, false), raid('home', 0, false, true)], cfg);
    assert.equal(d.home, 4);
    assert.equal(d.away, 2); // super-tackle = 2, not 1
  });

  test('an empty raid streak triggers do-or-die on the 3rd', () => {
    // two empty raids, then a 3rd empty raid → the raider is out (do-or-die)
    const d = replayRaids([raid('home', 0, false, false), raid('home', 0, false, false), raid('home', 0, false, false)], cfg);
    assert.equal(d.out.home, 1); // 3rd empty raid put the raider out
  });
});

import { decideRaidShootout } from '../src/sports/kabaddi/rules.ts';

describe('kabaddi — 5-raid shootout tie-breaker (Tier-2)', () => {
  test('most points after five raids each wins', () => {
    assert.equal(decideRaidShootout([1, 0, 2, 1, 1], [0, 1, 1, 0, 1]), 'home'); // 5 vs 3
  });
  test('clinches early when the lead cannot be caught', () => {
    // home 1,2,2,1 = 6 after 4 raids; away 0,0,0 = 0 after 3 → cannot catch up
    assert.equal(decideRaidShootout([1, 2, 2, 1], [0, 0, 0]), 'home');
  });
  test('level after five each → sudden death continues (null)', () => {
    assert.equal(decideRaidShootout([1, 1, 1, 1, 1], [1, 1, 1, 1, 1]), null);
    assert.equal(decideRaidShootout([1, 1, 1, 1, 1, 2], [1, 1, 1, 1, 1, 0]), 'home'); // sudden-death raid decides
  });
})

describe('bonus-point eligibility (≥6 defenders on the mat)', () => {
  const c: KabaddiCfg = { teamSize: 7, style: 'sanjeevani', proRules: true };
  test('bonus counts when the defence is at full/near strength', () => {
    // First raid: all 7 defenders on the mat → bonus is valid.
    const d = replayRaids([raid('home', 0, true, false)], c);
    assert.equal(d.home, 1);
  });
  test('bonus is void once the defence drops below 6', () => {
    // Home sends 2 away defenders out (7→5 on the mat), then raids for a bonus.
    // With only 5 defenders, the bonus should NOT count → just the 2 touches earlier.
    const raids: RaidOutcome[] = [raid('home', 2, false, false), raid('home', 0, true, false)];
    const d = replayRaids(raids, c);
    // raid1: 2 touches (away 2 out). raid2: bonus attempted with 5 defenders → 0.
    assert.equal(d.home, 2);
  });
  test('bonus valid at exactly 6 defenders (1 out)', () => {
    const raids: RaidOutcome[] = [raid('home', 1, false, false), raid('home', 0, true, false)];
    const d = replayRaids(raids, c);
    assert.equal(d.home, 2); // 1 touch + valid bonus (6 defenders remain)
  });
});
