/**
 * Publish a correction to a finished match (parity #05). One AMEND row in the
 * event log carries the staged ops, the human lines (the public "Score edits"
 * log), who made it, and the exact stat-line deltas written — so undoing the
 * row reverses precisely what it did. Replay applies the ops, so score, result
 * and standings follow automatically.
 */
import { getSport } from '../sports/registry';
import { effectiveLog, replayLog, statDeltas, type AmendOp, type StatDelta } from '../sports/amend';
import { appendMatchEvent, endMatchManually, getMatch, getMatchEvents, mapThroughDisputes, recordStatLine, syncMatchStatLines, updateMatchSnapshot } from './repos';
import { newUuid } from '../core/deviceId';
import type { MatchEventRecord, SportId } from '../core/types';

/** What publishing would do — for the preview, and what publish then writes. */
export async function planAmendment(matchId: string, sport: SportId, config: Record<string, unknown> | undefined, ops: AmendOp[], lines: string[], byName: string) {
  const events = await getMatchEvents(matchId);
  const plugin = getSport(sport);
  const maxSeq = events.reduce((m, e) => Math.max(m, e.seq), 0);
  const draft: MatchEventRecord = { seq: maxSeq + 1, type: 'AMEND', side: null, payload: { ops, lines, byName, deltas: [] }, attribution: null };
  const before = effectiveLog(events);
  const after = effectiveLog([...events, draft]);
  // Stats go to whoever holds them now (resolved disputes moved the lines).
  const merged = new Map<string, StatDelta>();
  for (const d of statDeltas(before, after)) {
    const playerId = await mapThroughDisputes(matchId, d.playerId);
    const k = `${playerId}|${d.stat}`;
    const cur = merged.get(k);
    merged.set(k, { playerId, stat: d.stat, by: (cur?.by ?? 0) + d.by });
  }
  const deltas = [...merged.values()].filter((d) => d.by !== 0);
  return {
    plugin,
    beforeState: replayLog(plugin, config, events),
    afterState: replayLog(plugin, config, [...events, draft]),
    deltas,
    record: { ...draft, payload: { ops, lines, byName, deltas }, clientId: newUuid() } as MatchEventRecord,
  };
}

/** Write the correction: the AMEND row, the changed stat lines only, then the
 *  refreshed snapshot (a manual result is kept — see updateMatchSnapshot). */
export async function publishAmendment(matchId: string, sport: SportId, config: Record<string, unknown> | undefined, ops: AmendOp[], lines: string[], byName: string): Promise<void> {
  const plan = await planAmendment(matchId, sport, config, ops, lines, byName);
  await appendMatchEvent(matchId, plan.record);
  const { plugin, afterState } = plan;
  const m = await getMatch(matchId);
  // Decision 6 / parity #19: a sport with absolute totals re-syncs the whole
  // match from the corrected state (ids mapped through disputes, only changed
  // rows written) INSTEAD of adding the deltas — writing both would update each
  // row twice. The deltas stay on the AMEND row so an undo can reverse it.
  // (A match closed by hand — `result` set — is finished too.)
  if (plugin.statTotals && (plugin.isComplete(afterState as never) || !!m?.result)) {
    await syncMatchStatLines(matchId, sport, plugin.statTotals(afterState as never), { home: m?.homeTeam.name, away: m?.awayTeam.name });
  } else {
    for (const d of plan.deltas) await recordStatLine({ matchId, playerId: d.playerId, sport, stat: d.stat, by: d.by });
  }
  await updateMatchSnapshot(matchId, (plugin.snapshot?.(afterState as never) ?? afterState) as object, plugin.isComplete(afterState as never));
  // A match ended by hand stores its final score in the result — keep it true to
  // the corrected log (endMatchManually is the only writer of results).
  if (m?.result?.score) {
    const sm = plugin.summary(afterState as never);
    const h = parseInt(String(sm.homeScore), 10), a = parseInt(String(sm.awayScore), 10);
    if (Number.isFinite(h) && Number.isFinite(a) && (h !== m.result.score.home || a !== m.result.score.away)) {
      await endMatchManually(matchId, { ...m.result, score: { home: h, away: a } });
    }
  }
}
