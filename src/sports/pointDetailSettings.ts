/**
 * SD-107 — the racket sports' "Scoring settings" card: Point detail (and, in
 * tennis, 1st / 2nd serve). Event mode: before the first point it sets the
 * match format (`pointDetail` / `serveDetail`); after it, Apply logs a
 * SET_DETAIL so the change applies from the next point and earlier points
 * keep what they had. Remembered per match (the format, or the log). PURE.
 */
import type { LiveSettings } from './types';
import { hasServeDetail, type DetailSport } from './pointDetail.ts';

type Flags = { pointDetail?: boolean; serveDetail?: boolean; events?: unknown[] };

export function detailLiveSettings(sport: DetailSport): LiveSettings<Flags> {
  const serve = hasServeDetail(sport);
  return {
    title: '⚙️ Scoring settings',
    hint: 'Optional extra detail for this match — the point button stays one tap; describe a point only when you can.',
    mode: 'event',
    actionType: 'SET_DETAIL',
    beforeStart: (s) => !(s.events ?? []).length,
    fields: [
      { key: 'pointDetail', label: 'Point detail', type: 'toggle', default: false, group: 'Stats captured', hint: 'How each point was won: winners by stroke, forced / unforced errors' },
      ...(serve ? [{ key: 'serveDetail', label: '1st / 2nd serve', type: 'toggle' as const, default: false, group: 'Stats captured', hint: 'Mark points played on a 2nd serve — 1st serve %, 1st / 2nd serve points won' }] : []),
    ],
    read: (s) => ({ pointDetail: s.pointDetail === true, ...(serve ? { serveDetail: s.serveDetail === true } : {}) }),
    defaults: { pointDetail: false, ...(serve ? { serveDetail: false } : {}) },
  };
}
