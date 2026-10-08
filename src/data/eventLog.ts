/**
 * Live-scoring event log helpers (pure — node tests load this).
 *
 * The server numbers events (`seq`); a device's taps carry a `clientId` until
 * the server has them. Replay = the server log in seq order, then this device's
 * still-unsynced taps in the order they were made.
 */
import type { MatchEventRecord } from '../core/types';

/** Merge the server log with unsynced taps: server events by seq, then pending
 *  ones the server doesn't have yet (by clientId), numbered after the server's. */
export function mergeLog(server: MatchEventRecord[], pending: MatchEventRecord[]): MatchEventRecord[] {
  const sorted = [...server].sort((a, b) => a.seq - b.seq);
  const onServer = new Set(sorted.map((e) => e.clientId).filter(Boolean) as string[]);
  const serverSeqs = new Set(sorted.map((e) => e.seq));
  const maxServer = sorted.reduce((m, e) => Math.max(m, e.seq), 0);
  let i = 0;
  const rest: MatchEventRecord[] = [];
  for (const p of pending) {
    // Legacy taps (no clientId) de-dupe by seq, as before.
    if (p.clientId ? onServer.has(p.clientId) : serverSeqs.has(p.seq)) continue;
    i += 1;
    rest.push({ ...p, seq: maxServer + i });
  }
  return [...sorted, ...rest];
}

/** The key an event is known by on this device (clientId, else its seq). */
export const eventKey = (e: Pick<MatchEventRecord, 'clientId' | 'seq'>) => e.clientId ?? `seq:${e.seq}`;

type Attr = { playerId: string; stat: string; by?: number; extra?: Record<string, number> };

/** The stat-line changes that cancel what an event credited (its attribution,
 *  extras, and a second attribution stashed in the payload as `_attr2`) — used by
 *  undo and when discarding taps the server refused. */
export function statReversals(e: Pick<MatchEventRecord, 'attribution' | 'payload'>): { playerId: string; stat: string; by: number }[] {
  const out: { playerId: string; stat: string; by: number }[] = [];
  const add = (a?: Attr | null) => {
    if (!a) return;
    out.push({ playerId: a.playerId, stat: a.stat, by: -(a.by ?? 1) });
    for (const [k, v] of Object.entries(a.extra ?? {})) out.push({ playerId: a.playerId, stat: k, by: -v });
  };
  add(e.attribution as Attr | null | undefined);
  add((e.payload as { _attr2?: Attr } | null | undefined)?._attr2);
  return out;
}

/** A sync error the server will never accept (another device holds the scoring
 *  lock) vs. one worth retrying (network, timeout). */
export const isRejection = (message?: string | null) => /not_active_scorer/i.test(message ?? '');
