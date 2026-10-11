/**
 * Legal L3 / L15 / L16 (migration protect_minors): the client side of keeping
 * under-18s private — reduced-card helpers, private photo refs + the signed-URL
 * cache, and the alert senders' follow filter.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isReducedCard, guestSeesMembersOnly, canFollowCard, reducedCardNote, avatarInitials, displayNameOf } from '../src/core/minorPrivacy.ts';
import { displayableImage, isPrivateImageRef, privateImageRef, parsePrivateImageRef, isPrivateImageKind, PLAYER_PHOTO_BUCKET } from '../src/core/imageUrl.ts';
import { createSignedImageCache } from '../src/core/signedImageCache.ts';
import { allowedPlayerFollows, keepAllowedFollows } from '../supabase/functions/_shared/minorFollows.ts';

const year = new Date().getFullYear();
const childDob = `${year - 12}-01-01`;

describe('reduced card', () => {
  test('restricted flag = reduced card', () => {
    assert.equal(isReducedCard({ restricted: true }), true);
    assert.equal(isReducedCard({}), false);
    assert.equal(isReducedCard(null), false);
  });

  test('guests: members-only for minors, unknown ages and reduced cards', () => {
    assert.equal(guestSeesMembersOnly({ age: 30 }), false);
    assert.equal(guestSeesMembersOnly({ age: 17 }), true);
    assert.equal(guestSeesMembersOnly({ dob: childDob }), true);
    assert.equal(guestSeesMembersOnly({}), true, 'no age known → treated as a possible minor');
    assert.equal(guestSeesMembersOnly({ age: 30, restricted: true }), true);
    assert.equal(guestSeesMembersOnly(null), false, 'nothing loaded yet → no gate flash');
  });

  test('follow: not on a reduced card, unless it is your own; guests get the sign-in prompt', () => {
    assert.equal(canFollowCard({ restricted: true }, { signedIn: true }), false);
    assert.equal(canFollowCard({ restricted: true }, { signedIn: true, isSelf: true }), true);
    assert.equal(canFollowCard({ age: 15 }, { signedIn: true }), true, 'a minor in your circle comes back unrestricted');
    assert.equal(canFollowCard({ restricted: true }, { signedIn: false }), true);
  });

  test('note explains who can see more', () => {
    assert.equal(reducedCardNote({ age: 30 }, false), undefined);
    assert.match(reducedCardNote({ restricted: true }, false)!, /teammates, coaches, tournament organisers and parent\/guardian/);
    assert.match(reducedCardNote({ restricted: true }, true)!, /initials/);
  });

  test('avatar initials work for full names and the logged-out "M. R."', () => {
    assert.equal(avatarInitials('Meera Rao'), 'MR');
    assert.equal(avatarInitials('M. R.'), 'MR');
    assert.equal(avatarInitials('meera'), 'M');
    assert.equal(avatarInitials('  '), '?');
    assert.equal(avatarInitials(undefined), '?');
    assert.equal(avatarInitials('Asha Devi Rao'), 'AD');
  });

  test('display name never empty', () => {
    assert.equal(displayNameOf({ fullName: 'M. R.' }), 'M. R.');
    assert.equal(displayNameOf({ fullName: ' ' }), 'Player');
    assert.equal(displayNameOf(undefined, 'Batter'), 'Batter');
  });
});

describe('private photo refs', () => {
  const ref = privateImageRef(PLAYER_PHOTO_BUCKET, 'uid-1/player-photo/1-ab.jpg');
  test('build + parse', () => {
    assert.equal(ref, 'private://player-photos/uid-1/player-photo/1-ab.jpg');
    assert.equal(isPrivateImageRef(ref), true);
    assert.deepEqual(parsePrivateImageRef(ref), { bucket: 'player-photos', path: 'uid-1/player-photo/1-ab.jpg' });
    assert.equal(parsePrivateImageRef('https://x/y.jpg'), undefined);
    assert.equal(parsePrivateImageRef('private://nobucket'), undefined);
    assert.equal(parsePrivateImageRef('private://b/'), undefined);
  });
  test('only player photos are private', () => {
    assert.equal(isPrivateImageKind('player-photo'), true);
    assert.equal(isPrivateImageKind('club-logo'), false);
    assert.equal(isPrivateImageKind('tournament-banner'), false);
  });
  test('a private ref is never rendered as-is (needs signing)', () => {
    assert.equal(displayableImage(ref, true), undefined);
    assert.equal(displayableImage('https://cdn/x.jpg', false), 'https://cdn/x.jpg');
  });
});

describe('signed URL cache', () => {
  const ref = (n: number) => `private://player-photos/u/player-photo/${n}.jpg`;
  test('batches one tick into one request per bucket, then reuses', async () => {
    const calls: string[][] = [];
    const cache = createSignedImageCache(async (_b, paths) => { calls.push(paths); return Object.fromEntries(paths.map((p) => [p, `https://signed/${p}`])); });
    const [a, b, a2] = await Promise.all([cache.resolve(ref(1)), cache.resolve(ref(2)), cache.resolve(ref(1))]);
    assert.equal(a, 'https://signed/u/player-photo/1.jpg');
    assert.equal(b, 'https://signed/u/player-photo/2.jpg');
    assert.equal(a2, a);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], ['u/player-photo/1.jpg', 'u/player-photo/2.jpg']);
    assert.equal(cache.peek(ref(1)), a);
    await cache.resolve(ref(1));
    assert.equal(calls.length, 1, 'cached');
  });
  test('refusal → null (initials), remembered for a while, then asked again', async () => {
    let t = 0; let n = 0;
    const cache = createSignedImageCache(async () => { n++; return {}; }, { now: () => t, refusedForMs: 1000 });
    assert.equal(await cache.resolve(ref(3)), null);
    assert.equal(await cache.resolve(ref(3)), null);
    assert.equal(n, 1);
    t = 2000;
    await cache.resolve(ref(3));
    assert.equal(n, 2);
  });
  test('renews before expiry', async () => {
    let t = 0; let n = 0;
    const cache = createSignedImageCache(async (_b, paths) => { n++; return Object.fromEntries(paths.map((p) => [p, `u${n}`])); }, { now: () => t, ttlSec: 3600 });
    assert.equal(await cache.resolve(ref(4)), 'u1');
    t = 3600_000 - 60_000; // inside the renewal margin
    assert.equal(await cache.resolve(ref(4)), 'u2');
  });
  test('sign failure → null; non-private → null; clear() forgets', async () => {
    let n = 0;
    const cache = createSignedImageCache(async () => { n++; throw new Error('offline'); });
    assert.equal(await cache.resolve(ref(5)), null);
    assert.equal(await cache.resolve('https://x/y.jpg'), null);
    cache.clear();
    await cache.resolve(ref(5));
    assert.equal(n, 2);
  });
});

describe('alert senders: follows of minors', () => {
  const rows = [
    { follower_id: 'coach', target_id: 'kid', prefs: null },
    { follower_id: 'stranger', target_id: 'kid', prefs: null },
    { follower_id: 'fan', target_id: 'adult', prefs: null },
  ];
  test('keeps only allowed pairs', () => {
    const kept = keepAllowedFollows(rows, [{ follower_id: 'coach', target_id: 'kid' }, { follower_id: 'fan', target_id: 'adult' }]);
    assert.deepEqual(kept.map((r) => r.follower_id), ['coach', 'fan']);
  });
  test('no filter before the migration (null) keeps all', () => {
    assert.equal(keepAllowedFollows(rows, null).length, 3);
  });
  test('rpc: missing function → null; other error → none (fail closed); ok → pairs', async () => {
    const client = (res: { data: unknown; error: { code?: string; message?: string } | null }) => ({ rpc: async () => res });
    assert.equal(await allowedPlayerFollows(client({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.allowed_player_follows' } }), ['kid']), null);
    assert.deepEqual(await allowedPlayerFollows(client({ data: null, error: { code: '57014', message: 'timeout' } }), ['kid']), []);
    assert.deepEqual(await allowedPlayerFollows(client({ data: [{ follower_id: 'coach', target_id: 'kid' }], error: null }), ['kid']), [{ follower_id: 'coach', target_id: 'kid' }]);
    assert.deepEqual(await allowedPlayerFollows(client({ data: null, error: null }), []), []);
  });
});
