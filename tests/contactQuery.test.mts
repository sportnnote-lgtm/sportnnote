import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeContact } from '../src/core/contactQuery.ts';
test('phone numbers (any common format) and emails are contact searches; names are not', () => {
  for (const q of ['9876543210', '+91 98765 43210', '098765-43210', '(+91) 9876543210']) assert.equal(looksLikeContact(q), 'phone', q);
  for (const q of ['a@b.co', ' Hrudhay.PV@Gmail.com ']) assert.equal(looksLikeContact(q), 'email', q);
  for (const q of ['Hrudhay', '98765', 'ravi 9876543210', 'a@b', '']) assert.equal(looksLikeContact(q), null, q);
});
