/**
 * SD-51 — the one-off BACKFILL for per-match records: replays every completed
 * match's stored event log through its sport's reducer, derives the records
 * (`plugin.matchRecords`) and writes ONLY `matches.state.matchRecords` — never
 * the status, winner, score, stat lines or anything else in the state (the
 * state is re-read just before the write and only that key is swapped).
 * Idempotent: a match whose stored block already equals the replay's is not
 * written. Not run automatically — in the signed-in web console:
 *
 *   await __sportnnoteAdmin.backfillMatchRecords({ dryRun: true })
 *   await __sportnnoteAdmin.backfillMatchRecords({ dryRun: true, sports: ['cricket'] })
 *   await __sportnnoteAdmin.backfillMatchRecords({ matchIds: ['…'] })   // writes
 *
 * A match with no stored log falls back to its snapshot (a cricket snapshot
 * has no ball log, so no partnerships). Matches closed by hand (walkover /
 * abandoned / conceded) and ones whose replay isn't complete are skipped.
 */
import type { Match, SportId } from '../core/types';
import { supabase, isSupabaseConfigured } from '../core/supabase';
import { mergeMatchConfig } from '../core/matchConfig';
import { getSport } from '../sports/registry';
import { replayLog } from '../sports/amend';
import { recordsDiff, stateWithRecords, type MatchRecordsBlock } from '../sports/matchRecords';
import { getMatch, getMatches, getMatchEvents, getTournaments } from './repos';
import { demo } from './demoStore';

type Source = 'log' | 'snapshot';
type Skip = 'manual' | 'incomplete' | 'no-state' | 'error';

export interface BackfillReport {
  dryRun: boolean;
  matches: number;
  toWrite: number;
  written: number;
  unchanged: number;
  skipped: number;
  perSport: Record<string, { matches: number; change: number; unchanged: number; skipped: number; fromLog: number; fromSnapshot: number; items: number }>;
  samples: { matchId: string; sport: string; source?: Source; skip?: Skip; before: number; after: number; types: string[] }[];
}

export async function backfillMatchRecords(opts: { dryRun?: boolean; sports?: SportId[]; matchIds?: string[]; samples?: number } = {}): Promise<BackfillReport> {
  const dryRun = !!opts.dryRun;
  const maxSamples = opts.samples ?? 25;
  const out: BackfillReport = { dryRun, matches: 0, toWrite: 0, written: 0, unchanged: 0, skipped: 0, perSport: {}, samples: [] };
  const all = opts.matchIds?.length
    ? (await Promise.all(opts.matchIds.map((id) => getMatch(id)))).filter((m): m is Match => !!m)
    : await getMatches();
  const want = opts.sports?.length ? new Set<string>(opts.sports) : null;
  const matches = all.filter((m) => m.status === 'completed' && (!want || want.has(m.sport)) && !!getSport(m.sport)?.matchRecords);
  const tours = matches.some((m) => m.tournamentId) ? await getTournaments({ includeDeleted: true }) : [];

  for (const m of matches) {
    const plugin = getSport(m.sport);
    const row = (out.perSport[m.sport] ??= { matches: 0, change: 0, unchanged: 0, skipped: 0, fromLog: 0, fromSnapshot: 0, items: 0 });
    row.matches += 1; out.matches += 1;
    const skip = (why: Skip) => {
      row.skipped += 1; out.skipped += 1;
      if (out.samples.length < maxSamples) out.samples.push({ matchId: m.id, sport: m.sport, skip: why, before: 0, after: 0, types: [] });
    };
    if (m.result) { skip('manual'); continue; }
    let state: unknown;
    let source: Source = 'log';
    let rec: MatchRecordsBlock | null = null;
    try {
      const tour = tours.find((t) => t.id === m.tournamentId);
      const config = mergeMatchConfig(tour?.formats?.[m.sport] as Record<string, unknown> | undefined, m.format as Record<string, unknown> | undefined);
      const raw = await getMatchEvents(m.id);
      if (raw.length) state = replayLog(plugin, config, raw);
      else if (m.state && Object.keys(m.state as object).length) { state = m.state; source = 'snapshot'; }
      else { skip('no-state'); continue; }
      if (!plugin.isComplete(state as never)) { skip('incomplete'); continue; }
      rec = plugin.matchRecords!(state as never);
    } catch { skip('error'); continue; }
    if (source === 'log') row.fromLog += 1; else row.fromSnapshot += 1;
    row.items += rec?.items.length ?? 0;
    const diff = recordsDiff(m.state, rec);
    if (!diff.change) { row.unchanged += 1; out.unchanged += 1; continue; }
    row.change += 1; out.toWrite += 1;
    if (out.samples.length < maxSamples) out.samples.push({ matchId: m.id, sport: m.sport, source, before: diff.before, after: diff.after, types: diff.types });
    if (dryRun) continue;
    // keys-only: re-read the state, swap the records key, write the state back
    if (!isSupabaseConfigured || !supabase) {
      const dm = demo.matches.find((x) => x.id === m.id);
      if (dm) { dm.state = stateWithRecords(dm.state, rec); out.written += 1; }
      continue;
    }
    const { data, error: readErr } = await supabase.from('matches').select('state, status').eq('id', m.id).maybeSingle();
    if (readErr || !data || (data as { status?: string }).status !== 'completed') continue;
    const { error } = await supabase.from('matches').update({ state: stateWithRecords((data as { state?: unknown }).state, rec) }).eq('id', m.id);
    if (!error) out.written += 1;
  }
  return out;
}

// SD-51: the founder's console handle (web: devtools), next to SD-19's.
(globalThis as unknown as Record<string, unknown>).__sportnnoteAdmin = {
  ...(((globalThis as unknown as Record<string, unknown>).__sportnnoteAdmin as object | undefined) ?? {}),
  backfillMatchRecords,
};
