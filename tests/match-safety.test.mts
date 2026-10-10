/**
 * SD-106 — Match safety: which match-level controls show, where they sit, and
 * the "Are you sure?" copy each asks with (src/core/matchSafety.ts). Plus
 * source guards: the scoring screen renders "Match controls" last (never under
 * the scorecard), Undo stays next to the scoring buttons, and no sport's
 * end / period button dispatches without a ConfirmSheet.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { matchControls, confirmCopy, showsControl, FLOW_CONTROLS, type MatchAction, type MatchControlState } from '../src/core/matchSafety.ts';
import type { SportId } from '../src/core/types.ts';

const LIVE: MatchControlState = { started: true, complete: false, eventCount: 12, canRestart: false, dangerVerdict: 'none', hasMatch: true };
const SCORER = { canScore: true, isHost: false };
const HOST = { canScore: false, isHost: true };
const RACKET: SportId[] = ['tennis', 'badminton', 'tabletennis', 'squash', 'padel', 'pickleball', 'volleyball', 'chess', 'carrom'];
const actions = (l: ReturnType<typeof matchControls>) => l.map((c) => c.action);

describe('matchControls — placement per sport and state', () => {
  test('racket / net / board sports: End match… is in the bottom section only (no in-flow end)', () => {
    for (const sp of RACKET) {
      const l = matchControls(sp, LIVE, SCORER);
      assert.deepEqual(actions(l), ['endMatch'], sp);
      assert.equal(l[0].zone, 'bottom');
      assert.equal(l[0].confirm, true);
    }
  });

  test('tennis inside the restart window: Restart + End, both at the bottom, both confirm', () => {
    const l = matchControls('tennis', { ...LIVE, canRestart: true }, SCORER);
    assert.deepEqual(actions(l), ['restartMatch', 'endMatch']);
    assert.ok(l.every((c) => c.zone === 'bottom' && c.confirm));
  });

  test('nothing scored yet: Cancel start replaces Restart and still confirms (audit G2)', () => {
    const l = matchControls('tennis', { ...LIVE, eventCount: 0, canRestart: true }, SCORER);
    assert.deepEqual(actions(l), ['cancelStart', 'endMatch']);
    assert.equal(l[0].confirm, true);
  });

  test('sports with a period flow keep their end buttons in the flow, End early at the bottom', () => {
    for (const [sp, flow] of Object.entries(FLOW_CONTROLS) as [SportId, MatchAction[]][]) {
      const l = matchControls(sp, LIVE, SCORER);
      assert.deepEqual(l.filter((c) => c.zone === 'flow').map((c) => c.action), flow, sp);
      assert.ok(showsControl(l, 'endMatch'), sp);
      assert.ok(l.every((c) => c.confirm), sp);
    }
    assert.deepEqual(FLOW_CONTROLS.football, ['endPeriod', 'fullTime']);
    assert.deepEqual(FLOW_CONTROLS.cricket, ['endInnings', 'fullTime', 'endTie']);
  });

  test('a host who is not scoring can end early but has no flow / restart controls', () => {
    const l = matchControls('football', { ...LIVE, canRestart: true }, HOST);
    assert.deepEqual(actions(l), ['endMatch']);
  });

  test('not started, complete or retired: no scoring-tab controls', () => {
    for (const st of [{ ...LIVE, started: false }, { ...LIVE, complete: true }, { ...LIVE, retired: true }]) {
      assert.deepEqual(matchControls('kabaddi', st, { canScore: true, isHost: true }).filter((c) => c.zone !== 'infoBottom'), []);
    }
  });

  test('#13 danger zone: delete / reset only for hosts, at the bottom of Info, confirmed', () => {
    const del = matchControls('tennis', { ...LIVE, complete: true, dangerVerdict: 'delete' }, HOST);
    assert.deepEqual(del, [{ action: 'deleteMatch', zone: 'infoBottom', confirm: true }]);
    const reset = matchControls('cricket', { ...LIVE, complete: true, dangerVerdict: 'reset' }, HOST);
    assert.deepEqual(actions(reset), ['resetFixture']);
    assert.deepEqual(matchControls('cricket', { ...LIVE, complete: true, dangerVerdict: 'reset' }, SCORER), []);
    assert.deepEqual(matchControls('cricket', { ...LIVE, complete: true, dangerVerdict: 'delete', hasMatch: false }, HOST), []);
  });

  test('event sports: finish / close at the bottom of their sheet, confirmed', () => {
    assert.deepEqual(actions(matchControls('athletics', { ...LIVE, started: false }, HOST)), ['closePhase', 'finishEvent']);
    assert.deepEqual(actions(matchControls('swimming', LIVE, SCORER)), ['closePhase', 'finishEvent']);
    assert.deepEqual(actions(matchControls('golf', LIVE, HOST)), ['finishRound']);
    assert.ok(matchControls('golf', LIVE, HOST).every((c) => c.zone === 'bottom' && c.confirm));
    assert.deepEqual(matchControls('golf', { ...LIVE, complete: true }, HOST), []);
  });
});

describe('confirmCopy — clear title, one-line consequence, YES / NO', () => {
  const ALL: MatchAction[] = ['endMatch', 'restartMatch', 'cancelStart', 'resetFixture', 'deleteMatch', 'fullTime', 'endTie', 'endPeriod', 'endInnings', 'finishRound', 'finishEvent', 'closePhase', 'walkover', 'discardTaps'];

  test('every action: a question title, YES starts "Yes,", NO starts "No,", one line', () => {
    for (const a of ALL) {
      const c = confirmCopy(a, { score: '2-1', period: '1st half', winner: 'Lions', count: 3 });
      assert.match(c.title, /\?$/, a);
      assert.match(c.yesLabel, /^Yes, /, a);
      assert.match(c.noLabel, /^No, /, a);
      assert.ok(!c.message.includes('\n') && c.message.length > 0, a);
      assert.notEqual(c.yesLabel, c.noLabel);
    }
  });

  test('end / restart use the founder wording and a red YES', () => {
    const end = confirmCopy('fullTime', { score: '6-4, 3-2' });
    assert.equal(end.title, 'End this match?');
    assert.equal(end.message, 'Final score 6-4, 3-2 will be saved and the match closes.');
    assert.equal(end.yesLabel, 'Yes, end match');
    assert.equal(end.noLabel, 'No, keep scoring');
    assert.equal(end.tone, 'danger');
    const rs = confirmCopy('restartMatch');
    assert.equal(rs.title, 'Restart this match?');
    assert.match(rs.message, /All points will be cleared/);
    assert.equal(rs.yesLabel, 'Yes, restart match');
    assert.equal(rs.tone, 'danger');
    for (const a of ['endMatch', 'deleteMatch', 'resetFixture', 'walkover', 'discardTaps', 'endTie'] as MatchAction[]) assert.equal(confirmCopy(a).tone, 'danger', a);
  });

  test('period-level actions are caution (amber), not red, and say Undo brings them back', () => {
    const p = confirmCopy('endPeriod', { period: 'Q2', score: '40-38' });
    assert.equal(p.title, 'End the Q2?');
    assert.equal(p.tone, 'caution');
    assert.match(p.message, /Undo/);
    assert.equal(confirmCopy('endInnings').tone, 'caution');
  });

  test('walkover names the winner (G3); discard counts the taps (G5); detail overrides', () => {
    assert.equal(confirmCopy('walkover', { winner: 'Lions' }).title, 'Walkover to Lions?');
    assert.equal(confirmCopy('walkover', { winner: 'Lions' }).yesLabel, 'Yes, walkover to Lions');
    assert.equal(confirmCopy('discardTaps', { count: 4 }).message, 'These 4 taps will be lost.');
    assert.equal(confirmCopy('discardTaps', { count: 1 }).message, 'This 1 tap will be lost.');
    assert.equal(confirmCopy('endMatch', { detail: 'X' }).message, 'X');
    assert.equal(confirmCopy('endTie', { drawWord: 'Tie' }).yesLabel, 'Yes, end as a tie');
  });
});

describe('source guards', () => {
  const screen = readFileSync(new URL('../src/screens/LiveScoringScreen.tsx', import.meta.url), 'utf8');
  const scoring = screen.slice(screen.indexOf("{activeTab === 'scoring' && ("), screen.indexOf("{activeTab === 'info' && ("));

  test('Match controls render last on the Scoring tab; Undo before the scoring controls (G1)', () => {
    const at = (s: string) => { const i = scoring.indexOf(s); assert.ok(i >= 0, s); return i; };
    assert.ok(at('{undoBar}') < at('{!retiredLocally && controlsNode}'));
    assert.ok(at('{!retiredLocally && controlsNode}') < at('{matchControlsNode}'));
    assert.ok(at('☰ Quick options') < at('{matchControlsNode}'));
    assert.ok(!scoring.includes('{restartBar}') && !scoring.includes('{retireBar}'), 'no End / Restart under the scorecard');
  });

  test('no destructive control shares Undo’s style', () => {
    assert.ok(!/st\.undoBtn/.test(screen.replace(/style=\{st\.undoBtn\}[^\n]*accessibilityLabel=\{`Undo/, '')), 'undoBtn used only by Undo');
  });

  test('no sport dispatches END / END_INNINGS / NEXT_* straight from a tap', () => {
    const dir = new URL('../src/sports/', import.meta.url);
    for (const sp of readdirSync(dir)) {
      const f = new URL(`${sp}/index.tsx`, dir);
      if (!existsSync(f)) continue;
      const src = readFileSync(f, 'utf8');
      assert.ok(!/onPress=\{\(\) => dispatch\(\{ type: '(END|END_INNINGS|NEXT_HALF|NEXT_QUARTER|END_PERIOD)'/.test(src), sp);
    }
  });

  test('walkover / discard / delete / reset go through the sheet', () => {
    assert.ok(!/onPress=\{async \(\) => \{ await walkoverMatch/.test(screen));
    assert.ok(/confirmMatchAction\('walkover'/.test(screen));
    assert.ok(/confirmMatchAction\('discardTaps'/.test(screen));
    assert.ok(/confirmMatchAction\(del \? 'deleteMatch' : 'resetFixture'\)/.test(screen));
    assert.ok(/confirmMatchAction\('restartMatch'\)/.test(screen) && /confirmMatchAction\('cancelStart'\)/.test(screen));
  });
});
