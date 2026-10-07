/** Pure matcher for post-publish version-mismatch errors (see staleVersion.ts). */
export function isStaleVersionError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? '');
  return /Unexpected token '<'|Requiring unknown module|ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(msg);
}
