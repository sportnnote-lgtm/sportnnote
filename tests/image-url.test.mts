import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLocalImageUri, displayableImage, mediaPath, extForMime } from '../src/core/imageUrl.ts';

test('isLocalImageUri: device-local schemes are local', () => {
  for (const u of ['file:///data/x.jpg', 'blob:https://app/123', 'content://media/1', 'ph://ABC', 'assets-library://asset/1']) {
    assert.equal(isLocalImageUri(u), true, u);
  }
});

test('isLocalImageUri: https, data: and empty are not local', () => {
  for (const u of ['https://x.supabase.co/storage/v1/object/public/media/a.jpg', 'http://x/a.png', 'data:image/png;base64,AAA', '', undefined, null]) {
    assert.equal(isLocalImageUri(u as string), false, String(u));
  }
});

test('displayableImage hides local URIs unless allowed', () => {
  assert.equal(displayableImage('file:///x.jpg', false), undefined);
  assert.equal(displayableImage('file:///x.jpg', true), 'file:///x.jpg');
  assert.equal(displayableImage('https://cdn/x.jpg', false), 'https://cdn/x.jpg');
  assert.equal(displayableImage(undefined, true), undefined);
  assert.equal(displayableImage('', false), undefined);
});

test('mediaPath is uid-prefixed and well-formed', () => {
  const p = mediaPath('u-123', 'tournament-logo', 'JPEG', 1700000000000, 'ab12');
  assert.equal(p, 'u-123/tournament-logo/1700000000000-ab12.jpg');
  assert.equal(p.split('/')[0], 'u-123');
  assert.equal(mediaPath('u', 'player-photo', '.png', 1, 'r'), 'u/player-photo/1-r.png');
  assert.equal(mediaPath('u', 'club-logo', '', 1, 'r'), 'u/club-logo/1-r.jpg');
});

test('extForMime', () => {
  assert.equal(extForMime('image/png'), 'png');
  assert.equal(extForMime('image/webp'), 'webp');
  assert.equal(extForMime(undefined), 'jpg');
});
