/**
 * Rally-sport timeline edits must REPLAY every kind of scored point — points,
 * aces AND blocks (volleyball). Regression guard: an earlier version dropped
 * non-point/ace kinds from the replay, which would have lost a block's point (and
 * shifted every downstream set) whenever a scorer corrected an unrelated point.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pointInputs, replayPoints, isPointKind } from '../src/sports/rallyEdit.ts';
import type { LiveEvent } from '../src/sports/liveEvents.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const ev = (kind: string, side: 'home' | 'away', playerName?: string): LiveEvent =>
  ({ id: 0, stamp: '', icon: '', label: '', side, kind, playerName } as unknown as LiveEvent);

describe('rallyEdit — point kinds', () => {
  test('isPointKind accepts the scored kinds, rejects banners', () => {
    assert.equal(isPointKind('point'), true);
    assert.equal(isPointKind('ace'), true);
    assert.equal(isPointKind('block'), true);
    assert.equal(isPointKind('gamewon'), false);
    assert.equal(isPointKind(undefined), false);
  });

  test('pointInputs keeps points, aces and blocks in order; skips banners', () => {
    const events = [ev('point', 'home', 'A'), ev('gamewon', 'home'), ev('block', 'away', 'B'), ev('ace', 'home', 'A')];
    assert.deepEqual(pointInputs(events).map((p) => [p.kind, p.side]), [
      ['point', 'home'], ['block', 'away'], ['ace', 'home'],
    ]);
  });

  test('replayPoints dispatches the right action + stat for each kind (block included)', () => {
    const seen: Array<{ type: string; stat?: string }> = [];
    const spy = (_s: number, a: ScoreAction) => { seen.push({ type: a.type, stat: a.attribution?.stat }); return 0; };
    replayPoints(spy, 0, [
      { side: 'home', kind: 'point', playerName: 'A' },
      { side: 'away', kind: 'block', playerName: 'B' },
      { side: 'home', kind: 'ace', playerName: 'A' },
    ]);
    assert.deepEqual(seen, [
      { type: 'POINT', stat: 'points' },
      { type: 'BLOCK', stat: 'blocks' },
      { type: 'ACE', stat: 'aces' },
    ]);
  });
});
