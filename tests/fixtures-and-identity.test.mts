/**
 * Fixture generation (round-robin / knockout) and phone-as-identity — the two
 * pure rules an organizer's data depends on: every pairing played exactly once,
 * and one number ⇒ one person.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { roundRobin, knockoutFirstRound } from '../src/data/fixtures.ts';
import { normalizePhone, phoneKey, isValidPhone, samePhone } from '../src/core/phone.ts';

const teams = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);
const pairKey = (p: { homeId: string; awayId: string }) => [p.homeId, p.awayId].sort().join('|');

describe('fixtures: round-robin', () => {
  test('every pair meets exactly once (even number of teams)', () => {
    const f = roundRobin(teams(6));
    assert.equal(f.length, 15); // 6C2
    assert.equal(new Set(f.map(pairKey)).size, 15, 'a pairing was repeated');
  });

  test('every pair meets exactly once (odd number of teams — byes)', () => {
    const f = roundRobin(teams(5));
    assert.equal(f.length, 10); // 5C2
    assert.equal(new Set(f.map(pairKey)).size, 10);
  });

  test('nobody is ever drawn against themselves', () => {
    for (const n of [2, 3, 4, 5, 8, 11]) {
      for (const p of roundRobin(teams(n))) {
        assert.notEqual(p.homeId, p.awayId, `self-pairing with ${n} teams`);
      }
    }
  });

  test('double round doubles the fixtures and swaps home/away', () => {
    const single = roundRobin(teams(4));
    const double = roundRobin(teams(4), true);
    assert.equal(double.length, single.length * 2);
    // each pairing appears twice, once in each direction
    const directed = double.map((p) => `${p.homeId}>${p.awayId}`);
    assert.equal(new Set(directed).size, double.length, 'a fixture repeated the same way round');
  });

  test('fewer than two teams produces no fixtures', () => {
    assert.equal(roundRobin(teams(1)).length, 0);
    assert.equal(roundRobin([]).length, 0);
  });
});

describe('fixtures: knockout round 1', () => {
  test('8 teams → 4 ties', () => {
    assert.equal(knockoutFirstRound(teams(8)).length, 4);
  });

  test('odd entry gets a bye (7 teams → 3 ties)', () => {
    const f = knockoutFirstRound(teams(7));
    assert.equal(f.length, 3);
    assert.equal(new Set(f.flatMap((p) => [p.homeId, p.awayId])).size, 6, 'one team should sit out');
  });

  test('no team appears twice in the round', () => {
    const ids = knockoutFirstRound(teams(8)).flatMap((p) => [p.homeId, p.awayId]);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe('identity: phone is the primary key', () => {
  test('formatting is irrelevant — same number, same identity', () => {
    assert.ok(samePhone('+91 98765 43210', '9876543210'));
    assert.ok(samePhone('+919876543210', '098765 43210'));
  });

  test('different numbers are different people', () => {
    assert.equal(samePhone('9876543210', '9876543211'), false);
  });

  test('normalize keeps digits only and drops leading zeros', () => {
    assert.equal(normalizePhone('+91 (98765) 43210'), '919876543210');
    assert.equal(normalizePhone('098765-43210'), '9876543210');
  });

  test('the comparable key is the last 10 digits', () => {
    assert.equal(phoneKey('+919876543210'), '9876543210');
    assert.equal(phoneKey('9876543210'), '9876543210');
  });

  test('too-short or empty numbers are not usable identities', () => {
    assert.equal(isValidPhone('12345'), false);
    assert.equal(isValidPhone(''), false);
    assert.equal(isValidPhone(undefined), false);
    assert.equal(samePhone('', ''), false, 'blank must never match blank');
  });

  test('a valid number is 8+ digits', () => {
    assert.ok(isValidPhone('12345678'));
    assert.ok(isValidPhone('+91 98765 43210'));
  });
});
