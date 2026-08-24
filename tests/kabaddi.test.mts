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
