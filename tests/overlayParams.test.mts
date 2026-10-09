/** Score overlay URL params (parity #25): defaults, a bad theme, sponsor paths. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseOverlayParams, isSponsorPath } from '../src/core/overlayParams.ts';
import { mediaPathFromUrl } from '../src/core/imageUrl.ts';

const UID = '0f8b6a3e-1c2d-4e5f-9a8b-7c6d5e4f3a2b';
const SB = 'https://abc.supabase.co';

describe('overlay params', () => {
  test('defaults: bar, bottom, flashes on, no sponsor', () => {
    assert.deepEqual(parseOverlayParams(''), { theme: 'bar', pos: 'bottom', flash: true });
    assert.deepEqual(parseOverlayParams('?'), { theme: 'bar', pos: 'bottom', flash: true });
  });
  test('themes, top, flash=0', () => {
    assert.deepEqual(parseOverlayParams('?t=pill&pos=top&flash=0'), { theme: 'pill', pos: 'top', flash: false });
    assert.equal(parseOverlayParams('t=corner').theme, 'corner');
  });
  test('a bad t / pos falls back to the default', () => {
    assert.equal(parseOverlayParams('?t=ticker').theme, 'bar');
    assert.equal(parseOverlayParams('?t=BAR').theme, 'bar');
    assert.equal(parseOverlayParams('?pos=left').pos, 'bottom');
    assert.equal(parseOverlayParams('?flash=1').flash, true);
  });
  test('a sponsor path from our own upload → the media public URL', () => {
    const sp = `${UID}/sponsor-logo/1730000000000-ab12cd.png`;
    const p = parseOverlayParams(`?sp=${sp}`, SB);
    assert.equal(p.sponsorPath, sp);
    assert.equal(p.sponsorUrl, `${SB}/storage/v1/object/public/media/${sp}`);
    // demo / no Supabase URL: the path is accepted but there is nothing to load
    assert.equal(parseOverlayParams(`?sp=${sp}`).sponsorUrl, undefined);
    assert.ok(isSponsorPath(`${UID}/sponsor-logo/x.jpeg`));
    assert.ok(isSponsorPath(`${UID}/sponsor-logo/x.webp`));
  });
  test('rejected sponsors: a full URL, ../, another folder, another type', () => {
    for (const bad of [
      'https://evil.example/logo.png',
      `https://abc.supabase.co/storage/v1/object/public/media/${UID}/sponsor-logo/x.png`,
      `${UID}/sponsor-logo/../../x.png`,
      `../${UID}/sponsor-logo/x.png`,
      `${UID}/sponsor-logo/..png`,
      `${UID}/player-photo/x.png`,
      `${UID}/sponsor-logo/x.svg`,
      `${UID}/sponsor-logo/x.gif`,
      `${UID}/sponsor-logo/sub/x.png`,
      'not-a-uid/sponsor-logo/x.png',
    ]) {
      const p = parseOverlayParams(`?sp=${encodeURIComponent(bad)}`, SB);
      assert.equal(p.sponsorPath, undefined, bad);
      assert.equal(p.sponsorUrl, undefined, bad);
    }
  });
  test('the bucket path back from an upload URL', () => {
    const sp = `${UID}/sponsor-logo/1-a.png`;
    assert.equal(mediaPathFromUrl(`${SB}/storage/v1/object/public/media/${sp}`), sp);
    assert.equal(mediaPathFromUrl('blob:http://localhost:8093/abc'), undefined);
    assert.equal(mediaPathFromUrl(undefined), undefined);
  });
});
