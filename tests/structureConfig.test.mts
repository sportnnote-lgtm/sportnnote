/**
 * Tournament structure config (gap #5): the intended shape (groups / advancement
 * / double-round / super phase) is persisted per sport on formats[sport], so the
 * generator remembers it and the tournament page shows the real structure.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  structureFromFormat, structureToFormat, mergeStructure, structureFieldFor, describeStructure,
  type StructureConfig,
} from '../src/data/structureConfig.ts';

const groups: StructureConfig = { shape: 'groups', groupCount: 4, advanceTopN: 2, advanceBest: 0, doubleRound: false, superPhase: false };

describe('round-trips through a format', () => {
  test('toFormat → fromFormat preserves the config', () => {
    const fmt = structureToFormat(groups);
    assert.deepEqual(structureFromFormat(fmt), groups);
  });
  test('no structure keys → null (never configured)', () => {
    assert.equal(structureFromFormat({ overs: 20 }), null);
    assert.equal(structureFromFormat(undefined), null);
    assert.equal(structureFromFormat(null), null);
  });
  test('mergeStructure keeps the sport rules alongside', () => {
    const merged = mergeStructure({ overs: 20, winPoints: 3 }, groups);
    assert.equal(merged.overs, 20);
    assert.equal(merged.winPoints, 3);
    assert.equal(merged.structShape, 'groups');
    assert.equal(merged.structGroups, 4);
  });
  test('reads with sane clamps/defaults for partial data', () => {
    const cfg = structureFromFormat({ structShape: 'groups' });
    assert.deepEqual(cfg, { shape: 'groups', groupCount: 4, advanceTopN: 2, advanceBest: 0, doubleRound: false, superPhase: false });
  });
});

describe('structureFieldFor (coarse label stays consistent)', () => {
  test('maps shape → tournament structure', () => {
    assert.equal(structureFieldFor('league'), 'league');
    assert.equal(structureFieldFor('knockout'), 'knockout');
    assert.equal(structureFieldFor('groups'), 'league_knockout');
  });
});

describe('describeStructure', () => {
  test('single league', () => {
    assert.match(describeStructure({ ...groups, shape: 'league' }), /Single league — round-robin/);
  });
  test('double round-robin phrasing', () => {
    assert.match(describeStructure({ ...groups, shape: 'league', doubleRound: true }), /home & away/);
  });
  test('straight knockout', () => {
    assert.match(describeStructure({ ...groups, shape: 'knockout' }), /Straight knockout/);
  });
  test('groups + top-N', () => {
    assert.match(describeStructure(groups), /4 groups .* top 2 advance to the knockout/);
  });
  test('groups + best-placed wildcards + super phase', () => {
    const s = describeStructure({ shape: 'groups', groupCount: 6, advanceTopN: 2, advanceBest: 4, doubleRound: false, superPhase: true });
    assert.match(s, /6 groups/);
    assert.match(s, /top 2 \+ the 4 best 3rd-placed/);
    assert.match(s, /Super round-robin, then the knockout/);
  });
});
