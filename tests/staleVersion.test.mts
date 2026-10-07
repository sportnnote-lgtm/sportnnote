import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isStaleVersionError } from '../src/core/staleVersionMatch.ts';
test('recognises the post-publish version-mismatch errors seen live', () => {
  for (const m of ["SyntaxError: Unexpected token '<'", 'Error: Requiring unknown module "721".', 'ChunkLoadError: Loading chunk 12 failed.', 'TypeError: Failed to fetch dynamically imported module: /x.js']) {
    const [name, ...rest] = m.split(': ');
    const e = new Error(rest.join(': ')); e.name = name;
    assert.equal(isStaleVersionError(e), true, m);
  }
  for (const m of ['TypeError: x is undefined', 'Error: Network request failed']) assert.equal(isStaleVersionError(new Error(m)), false, m);
});
