/** Phone identity = full E.164 (docs/international/audit/identity.md #1–#3, #5). */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePhone, isValidPhone, phoneKey, samePhone, toE164, intlDigits, formatPhone,
  splitPhone, joinPhone, phoneCountry, examplePhone, phoneCountries, dialCode, setPreferredPhoneCountry, defaultPhoneCountry,
} from '../src/core/phone.ts';
import { phoneKey as edgeKey } from '../supabase/functions/_shared/phone.ts';

describe('parsing per country (local and international input → E.164)', () => {
  const cases: [string, string, string][] = [
    ['IN', '98765 43210', '+919876543210'],
    ['IN', '098765 43210', '+919876543210'],
    ['AE', '050 123 4567', '+971501234567'],
    ['QA', '3312 3456', '+97433123456'],
    ['GB', '07400 123456', '+447400123456'],
    ['SG', '9123 4567', '+6591234567'],
    ['MY', '012-345 6789', '+60123456789'],
    ['AU', '0412 345 678', '+61412345678'],
    ['US', '(202) 555-0123', '+12025550123'],
  ];
  for (const [c, local, e164] of cases) {
    test(`${c}: "${local}" → ${e164}`, () => {
      assert.equal(normalizePhone(local, c as never), e164);
      assert.ok(isValidPhone(local, c as never));
      assert.equal(phoneCountry(e164), c);
    });
  }
  test('an explicit + or 00 wins over the default country', () => {
    assert.equal(normalizePhone('+44 7400 123456', 'IN'), '+447400123456');
    assert.equal(normalizePhone('00971 50 123 4567', 'IN'), '+971501234567');
    assert.equal(normalizePhone('+91 98765 43210', 'US'), '+919876543210');
  });
  test('10-digit UK/US local numbers are NOT turned into +91', () => {
    assert.equal(normalizePhone('07400 123456', 'GB'), '+447400123456');
    assert.equal(normalizePhone('202 555 0123', 'US'), '+12025550123');
    assert.equal(intlDigits('202 555 0123', 'US'), '12025550123');
  });
  test('invalid numbers are rejected per country', () => {
    assert.equal(isValidPhone('3312 345', 'QA'), false); // 7 digits
    assert.equal(isValidPhone('12345', 'IN'), false);
    assert.equal(isValidPhone('', 'IN'), false);
    assert.equal(normalizePhone('abc', 'IN'), '');
  });
});

describe('identity key: the whole international number', () => {
  test('TAKEOVER case: +1 917 555 1234 is not +91 91755 51234', () => {
    assert.notEqual(phoneKey('+1 917 555 1234'), phoneKey('+91 9175551234'));
    assert.equal(samePhone('+19175551234', '+919175551234'), false);
    assert.notEqual(phoneKey('+19175551234'), phoneKey('9175551234'), 'nor the legacy bare Indian row');
  });
  test('Qatar +974 3312 3456 is not the Indian 74331 23456', () => {
    assert.equal(samePhone('+97433123456', '7433123456'), false);
    assert.equal(samePhone('+97433123456', '+917433123456'), false);
  });
  test('the same number in any format is one identity', () => {
    for (const v of ['+91 98765 43210', '919876543210', '9876543210', '09876543210', '0091 98765 43210', '+919876543210']) {
      assert.equal(phoneKey(v), '+919876543210', v);
    }
    assert.ok(samePhone('050 123 4567', '+971501234567', 'AE'));
    assert.ok(samePhone('9123 4567', '+65 9123 4567', 'SG'));
  });
  test('bare 8-digit local numbers with no country never match anything', () => {
    assert.equal(phoneKey('91234567'), '');
    assert.equal(samePhone('', ''), false);
  });
  test('client key == edge-function key (and SQL phone_key — PGlite harness)', () => {
    for (const v of ['+19175551234', '9175551234', '+97433123456', '33123456', '0091 98765 43210', '447400123456', '', '+1234567890123456']) {
      assert.equal(phoneKey(v), edgeKey(v), v);
    }
  });
  test('toE164 prefers stored/international forms, no guessing', () => {
    assert.equal(toE164('+44 7400 123456'), '+447400123456');
    assert.equal(toE164('9876543210', 'IN'), '+919876543210');
    assert.equal(toE164('91234567', 'SG'), '+6591234567');
  });
});

describe('phone field helpers', () => {
  test('split / join round-trip keeps the country', () => {
    const s = splitPhone('+447400123456');
    assert.equal(s.country, 'GB');
    assert.equal(joinPhone(s.country, s.national), '+447400123456');
    assert.equal(joinPhone('QA', '3312 3456'), '+97433123456');
    assert.equal(joinPhone('GB', '07400 12'), '+44 740012', 'incomplete stays international, never +91');
    assert.equal(joinPhone('IN', ''), '');
  });
  test('a pasted international number in the local box is honoured', () => {
    assert.equal(joinPhone('IN', '+65 9123 4567'), '+6591234567');
  });
  test('formatting and examples', () => {
    assert.equal(formatPhone('+919876543210'), '+91 98765 43210');
    assert.ok(examplePhone('IN').length > 0);
    assert.equal(dialCode('AE'), '+971');
    assert.deepEqual(phoneCountries().slice(0, 8).map((c) => c.code), ['IN', 'AE', 'QA', 'GB', 'SG', 'MY', 'AU', 'US']);
  });
  test('default country: preferred > device > IN', () => {
    setPreferredPhoneCountry('QA');
    assert.equal(defaultPhoneCountry(), 'QA');
    assert.equal(normalizePhone('3312 3456'), '+97433123456');
    setPreferredPhoneCountry('IN');
    assert.equal(normalizePhone('98765 43210'), '+919876543210');
  });
});
