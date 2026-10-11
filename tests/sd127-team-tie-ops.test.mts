/**
 * SD-127 — team-tie operations: the dead-rubber default by stage (group /
 * league → play every rubber, knockout → stop at the majority; old specs
 * unchanged), the settle plan (idempotent, restores on a lost majority — the
 * same rule the settle_team_tie RPC runs), and who may enter a lineup
 * (lineupEntryRule — mirrors save_tie_lineup).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Match, SportId, Team } from '../src/core/types.ts';
import {
  TIE_PRESETS, specFromPreset, customSpec, rubberFormat, tieSpecFromFormat, tournamentTieSpec, specForStage, isKnockoutTie,
  deadRuleOf, withDeadRule, tieSettlePlan, applySettlePlan, majorityIndex, rubbersToStop, rubbersToRestore, resolveTie,
  lineupEntryRule, TIE_KEYS, type TieSpec,
} from '../src/data/teamTie.ts';
import { deriveSeries } from '../src/data/series.ts';

const T = (id: string, name: string, sport: SportId): Team => ({ id, name, shortName: name.slice(0, 3).toUpperCase(), sport });
const preset = (id: string) => TIE_PRESETS.find((p) => p.id === id)!;
const A = T('ra', 'Riverside', 'badminton'), B = T('hb', 'Hilltop', 'badminton');

/** results: A / B / D (draw) / - (to play) / L (live) / X (set aside) */
function tie(spec: TieSpec, results: string): Match[] {
  return spec.rubbers.map((_, i) => {
    const r = results[i] ?? '-';
    const done = r === 'A' || r === 'B' || r === 'D';
    const f = rubberFormat(spec, i, { seriesId: 'tie-x', teamAId: A.id });
    return {
      id: `r${i + 1}`, sport: 'badminton', startsAt: `2026-10-11T10:0${i}:00Z`, homeTeam: A, awayTeam: B,
      status: done ? 'completed' : r === 'L' ? 'live' : r === 'X' ? 'cancelled' : 'scheduled',
      ...(done ? { winner: r === 'A' ? 'home' : r === 'B' ? 'away' : 'draw', score: { home: 2, away: 0 } } : {}),
      format: r === 'X' ? { ...f, [TIE_KEYS.dead]: true } : f,
      state: null,
    } as Match;
  });
}
const S = (ms: Match[]) => deriveSeries(ms)[0];

describe('dead rubbers by stage', () => {
  test('presets default to "by stage"; chess boards are always all played', () => {
    for (const id of ['bd-thomas', 'bd-sudirman', 'tn-davis5', 'tn-finals', 'tt-swaythling', 'sq-teams', 'pd-team']) {
      assert.equal(deadRuleOf(specFromPreset(preset(id))), 'stage', id);
    }
    const ch = specFromPreset(preset('ch-4boards'));
    assert.equal(ch.deadByStage, undefined);
    assert.equal(ch.dead, 'play');
  });
  test('group / league / Super Four / Swiss → play; knockout stages → stop', () => {
    const s = specFromPreset(preset('bd-thomas'));
    const at = (stage?: string, tournamentId: string | undefined = 't1') => specForStage(s, { stage, tournamentId });
    for (const st of ['group', 'super', 'swiss2', undefined]) {
      assert.equal(at(st).dead, 'play', String(st));
      assert.equal(at(st).deadByStage, undefined, 'stored spec is concrete');
    }
    for (const st of ['r16', 'qf', 'sf', 'final', 'third', 'eliminator', 'q1']) assert.equal(at(st).dead, 'stop', st);
    assert.equal(specForStage(s, {}).dead, 'stop', 'a one-off tie outside a tournament stops');
    assert.equal(isKnockoutTie({ stage: 'group', tournamentId: 't' }), false);
  });
  test('the organiser can override for the whole tournament', () => {
    const s = specFromPreset(preset('bd-sudirman'));
    const play = withDeadRule(s, 'play');
    assert.equal(deadRuleOf(play), 'play');
    assert.equal(specForStage(play, { stage: 'final', tournamentId: 't' }).dead, 'play');
    const stop = withDeadRule(s, 'stop');
    assert.equal(specForStage(stop, { stage: 'group', tournamentId: 't' }).dead, 'stop');
    assert.equal(deadRuleOf(withDeadRule(stop, 'stage')), 'stage');
    assert.equal(deadRuleOf(customSpec('badminton', ['S', 'D', 'S'])), 'stage');
    assert.equal(deadRuleOf(customSpec('badminton', ['S', 'D', 'S'], 'play')), 'play');
  });
  test('existing ties and tournaments are unchanged (no deadByStage → stored dead)', () => {
    const old: TieSpec = { v: 1, preset: 'bd-thomas', abc: 'home', dead: 'stop', half: false, rubbers: specFromPreset(preset('bd-thomas')).rubbers };
    const fmt = { teamTie: JSON.stringify(old) };
    const saved = tournamentTieSpec(fmt)!;
    assert.equal(saved.deadByStage, undefined);
    assert.equal(specForStage(saved, { stage: 'group', tournamentId: 't' }).dead, 'stop');
    // a new tournament spec round-trips its "by stage" flag
    const fresh = tournamentTieSpec({ teamTie: JSON.stringify(specFromPreset(preset('bd-thomas'))) })!;
    assert.equal(fresh.deadByStage, true);
    // the rubber keeps the concrete choice
    const g = specForStage(fresh, { stage: 'group', tournamentId: 't' });
    assert.equal(tieSpecFromFormat(rubberFormat(g, 0, { seriesId: 's', teamAId: 'a' }))?.dead, 'play');
  });
  test('group tie in "play" mode: dead rubbers stay to play and count', () => {
    const g = specForStage(specFromPreset(preset('bd-thomas')), { stage: 'group', tournamentId: 't' });
    const s = S(tie(g, 'AAA--'));
    assert.deepEqual(tieSettlePlan(s, g), { stop: [], restore: [] });
    const done = S(tie(g, 'AAABA'));
    assert.equal(resolveTie(done).ptsA, 4);
    assert.equal(resolveTie(done).ptsB, 1);
  });
});

describe('settle plan', () => {
  const sud = withDeadRule(specFromPreset(preset('bd-sudirman')), 'stop');
  test('3–0 sets aside rubbers 4 and 5; applying it then planning again is empty', () => {
    const ms = tie(sud, 'AAA--');
    const plan = tieSettlePlan(S(ms), sud);
    assert.deepEqual(plan, { stop: ['r4', 'r5'], restore: [] });
    const after = applySettlePlan(ms, plan);
    assert.deepEqual(after.map((m) => m.status), ['completed', 'completed', 'completed', 'cancelled', 'cancelled']);
    assert.deepEqual(tieSettlePlan(S(after), sud), { stop: [], restore: [] });
    assert.deepEqual(rubbersToStop(S(ms), sud).map((m) => m.id), ['r4', 'r5']);
  });
  test('no majority yet: nothing to do', () => {
    assert.deepEqual(tieSettlePlan(S(tie(sud, 'AB---')), sud), { stop: [], restore: [] });
    assert.equal(majorityIndex(S(tie(sud, 'ABAB-'))), -1);
  });
  test('a live rubber after the decision is left alone (only scheduled / postponed are set aside)', () => {
    assert.deepEqual(tieSettlePlan(S(tie(sud, 'AAAL-')), sud).stop, ['r5']);
  });
  test('a correction that undoes the majority restores; restoring twice is a no-op', () => {
    const ms = tie(sud, 'AALXX');
    const plan = tieSettlePlan(S(ms), sud);
    assert.deepEqual(plan, { stop: [], restore: ['r4', 'r5'] });
    const after = applySettlePlan(ms, plan);
    assert.equal(after[3].status, 'scheduled');
    assert.equal((after[3].format as Record<string, unknown>)[TIE_KEYS.dead], false);
    assert.deepEqual(tieSettlePlan(S(after), sud), { stop: [], restore: [] });
  });
  test('3–1 corrected to 2–2 with rubber 5 set aside: rubber 5 comes back (not a 2–2 draw)', () => {
    const ms = tie(sud, 'ABABX');
    assert.equal(resolveTie(S(ms)).decided, true, 'the old "decided" rule calls it drawn');
    assert.deepEqual(tieSettlePlan(S(ms), sud).restore, ['r5']);
    assert.deepEqual(rubbersToRestore(S(ms)).map((m) => m.id), ['r5']);
  });
  test('chess: ½ points, 2½ of 4 decides', () => {
    const ch = specFromPreset(preset('ch-4boards'));
    const stopCh = { ...ch, dead: 'stop' as const };
    assert.equal(majorityIndex(S(tie(stopCh, 'ADD-'))), -1);
    assert.equal(majorityIndex(S(tie(stopCh, 'ADA-'))), 2);
    assert.deepEqual(tieSettlePlan(S(tie(ch, 'ADA-')), ch).stop, [], 'chess plays every board');
  });
});

describe('who may enter a lineup', () => {
  const base = { isHost: false, managesSide: false, sideIn: false, otherIn: false, started: false };
  test('a stranger may not; the side\'s captain / admin may; the host may', () => {
    assert.deepEqual(lineupEntryRule(base), { ok: false, reason: 'not_allowed' });
    assert.deepEqual(lineupEntryRule({ ...base, managesSide: true }), { ok: true });
    assert.deepEqual(lineupEntryRule({ ...base, isHost: true }), { ok: true });
  });
  test('sealed: a captain can change theirs until the other side is in, then only the host', () => {
    assert.deepEqual(lineupEntryRule({ ...base, managesSide: true, sideIn: true }), { ok: true });
    assert.deepEqual(lineupEntryRule({ ...base, managesSide: true, otherIn: true }), { ok: true }, 'second to submit');
    assert.deepEqual(lineupEntryRule({ ...base, managesSide: true, sideIn: true, otherIn: true }), { ok: false, reason: 'exchanged' });
    assert.deepEqual(lineupEntryRule({ ...base, isHost: true, sideIn: true, otherIn: true }), { ok: true });
  });
  test('once the tie has started nobody changes an entered lineup', () => {
    assert.deepEqual(lineupEntryRule({ ...base, isHost: true, sideIn: true, started: true }), { ok: false, reason: 'started' });
    assert.deepEqual(lineupEntryRule({ ...base, isHost: true, started: true }), { ok: true }, 'a missing lineup can still go in');
  });
});
