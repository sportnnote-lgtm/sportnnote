import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editAccess, adminPatch } from '../src/core/playerEditAccess.ts';

test('editAccess: self / admin / none', () => {
  assert.equal(editAccess({ meId: 'p1', player: { id: 'p1', profileId: 'u1' }, canAdmin: false }), 'self');
  assert.equal(editAccess({ meId: 'p1', player: { id: 'p2' }, canAdmin: true }), 'admin');
  assert.equal(editAccess({ meId: 'p1', player: { id: 'p2' }, canAdmin: false }), 'none');
  assert.equal(editAccess({ meId: null, player: { id: 'p2' }, canAdmin: false }), 'none');
});

test('editAccess: a claimed or reported player is never admin', () => {
  assert.equal(editAccess({ meId: 'p1', player: { id: 'p2', profileId: 'u2' }, canAdmin: true }), 'none');
  assert.equal(editAccess({ meId: 'p1', player: { id: 'p2', reported: true }, canAdmin: true }), 'none');
});

test('adminPatch strips privacy, verification and the house', () => {
  const out = adminPatch(
    { fullName: '  Ishaan Rao ', showPhone: true, showEmail: true, findableByContact: false, verification: { status: 'pending' } as never, phoneVerified: true, emailVerified: true, houseName: 'Hijack', jerseyNo: 7 },
    {},
  );
  assert.deepEqual(out, { fullName: 'Ishaan Rao', jerseyNo: 7 });
});

test('adminPatch locks a set phone / email, fills empty ones', () => {
  assert.deepEqual(adminPatch({ phone: '+919999999999', email: 'new@x.in' }, { phone: '+919876504821', email: 'old@x.in' }), {});
  assert.deepEqual(adminPatch({ phone: ' +919999999999 ', email: 'kid@x.in' }, { phone: '', email: undefined }), { phone: '+919999999999', email: 'kid@x.in' });
});

test('adminPatch: empty strings are left alone; hidden guardian never written back', () => {
  assert.deepEqual(adminPatch({ fullName: 'A', city: '  ', dob: '', gender: '', photoUrl: '' }, {}), { fullName: 'A' });
  assert.deepEqual(adminPatch({ guardian: { name: '', hidden: true, present: true } }, {}), {});
  assert.deepEqual(adminPatch({ guardian: { name: ' Priya ', phone: '', email: 'p@x.in', phoneVerified: true } }, {}), { guardian: { name: 'Priya', phone: undefined, email: 'p@x.in' } });
  assert.deepEqual(adminPatch({ sports: ['cricket'], sportDetails: { cricket: { sides: { batting: 'Left' } } } }, {}), { sports: ['cricket'], sportDetails: { cricket: { sides: { batting: 'Left' } } } });
});
