/** A tiny in-memory store for the per-sport format map being edited while a
 *  tournament is created or edited. It lets each sport's settings live on its own
 *  screen (SportSettingsScreen) that reads/writes here, while the Create/Edit
 *  form seeds it and reads the result back — without threading callbacks through
 *  navigation params. One draft at a time (you only set up one tournament at
 *  once); the form re-seeds it on entry, so stale data from a prior edit is
 *  cleared. */
import type { SportId } from '../core/types';

type Format = Record<string, number | string | boolean>;
type FormatMap = Partial<Record<SportId, Format>>;

let draft: FormatMap = {};
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version += 1; listeners.forEach((fn) => fn()); };

export const tournamentDraft = {
  /** Replace the whole draft (the form calls this when it opens). */
  seed(formats: FormatMap) { draft = { ...formats }; emit(); },
  /** One sport's format (empty object if unset). */
  get(sport: SportId): Format { return draft[sport] ?? {}; },
  /** Merge a single key into a sport's format. */
  setField(sport: SportId, key: string, value: number | string | boolean) {
    draft = { ...draft, [sport]: { ...(draft[sport] ?? {}), [key]: value } };
    emit();
  },
  /** Replace a sport's whole format. */
  setFormat(sport: SportId, format: Format) { draft = { ...draft, [sport]: format }; emit(); },
  /** The full map (the form reads this on save / on focus). */
  all(): FormatMap { return draft; },
  /** Monotonic version — subscribe to know when anything changed. */
  getVersion() { return version; },
  subscribe(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; },
};
