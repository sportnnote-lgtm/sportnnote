import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupChecklist, firstSportWithoutFormat } from '../src/data/setupChecklist.ts';

const t = (o: Record<string, unknown> = {}) => ({ sports: ['football'], formats: {}, ...o }) as never;
const done = (steps: { key: string; done: boolean }[]) => Object.fromEntries(steps.map((s) => [s.key, s.done]));

test('fresh tournament: nothing done', () => {
  assert.deepEqual(done(setupChecklist(t(), 0, 0)), { teams: false, format: false, schedule: false });
});
test('each step ticks', () => {
  assert.equal(done(setupChecklist(t(), 2, 0)).teams, true);
  assert.equal(done(setupChecklist(t(), 1, 0)).teams, false);
  assert.equal(done(setupChecklist(t({ formats: { football: { structShape: 'league' } } }), 0, 0)).format, true);
  assert.equal(done(setupChecklist(t(), 0, 3)).schedule, true);
});
test('matches present ⇒ format done', () => {
  assert.equal(done(setupChecklist(t(), 0, 1)).format, true);
});
test('multi-sport: format needs every sport', () => {
  const tt = t({ sports: ['football', 'cricket'], formats: { football: { structShape: 'league' } } });
  assert.equal(done(setupChecklist(tt, 2, 0)).format, false);
  assert.equal(firstSportWithoutFormat(tt), 'cricket');
});
test('individual participation says players', () => {
  assert.equal(setupChecklist(t({ participation: 'individual' }), 0, 0)[0].label, 'Add players');
  assert.equal(setupChecklist(t(), 0, 0)[0].label, 'Add teams');
});
