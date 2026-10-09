/**
 * Realtime live-match hook — the heart of the live-scores feature.
 *
 * Source of truth = the append-only event log (`match_events` in Supabase, or
 * the demo store offline). State — scoreboard, clock AND timeline — is rebuilt
 * by replaying that log through the sport plugin's PURE reducer. Because the
 * reducer is deterministic, every device that replays the same events arrives
 * at the same screen. In live mode we subscribe to that match's events: a new tap
 * applies instantly, while an upstream delete (the scorer's undo) or a realtime
 * reconnect triggers a full rebuild from the log so every device stays in
 * lock-step; offline, the log lives in memory so a match's timeline survives
 * navigating away and back.
 *
 * Each event stores its `attribution` (who scored/assisted), so replaying
 * reconstructs the full play-by-play with player names — not just that a goal
 * happened. Stat-line writes and notifications happen only on the scorer's
 * dispatch, never on replay, so viewers never double-count.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { supabase, isSupabaseConfigured } from '../core/supabase';
import { getSport } from '../sports/registry';
import { recordStatLine as writeStatLine, getMatchEvents, popMatchEvent, updateMatchSnapshot, resetMatch, syncMatchStatLines } from './repos';
import { matchOutbox } from './matchOutbox';
import { followStore } from './followStore';
import { notify } from '../core/notifications';
import type { MatchEventRecord, SportId } from '../core/types';
import type { ScoreAction } from '../sports/types';
import { mergeLog, eventKey, statReversals } from './eventLog';
import { effectiveLog, undoAmendDeltas, AMEND_TYPE, type AmendOp } from '../sports/amend';
import { planAmendment } from './amendments';
import { newUuid } from '../core/deviceId';
import { canWriteWith, type LockStatus } from '../core/scoringLock';

const toAction = (e: MatchEventRecord): ScoreAction => ({
  type: e.type,
  side: e.side ?? undefined,
  payload: e.payload ?? undefined,
  attribution: e.attribution ?? undefined,
});


export interface UseLiveMatch {
  state: unknown;
  dispatch: (action: ScoreAction) => void;
  /** Undo the last recorded event (ball/setup step) — re-derives from the log. */
  undo: () => void;
  /** Wipe the match back to "not started" (started-by-mistake restart). */
  reset: () => Promise<void>;
  /** how many events are in the log (0 = nothing to undo) */
  eventCount: number;
  /** true = changes are broadcast over realtime (Supabase); false = local-only */
  live: boolean;
  syncing: boolean;
  /** taps the server refused because another device took over scoring */
  rejectedCount: number;
  /** throw those taps away (reversing the stats they credited) and reload */
  discardRejected: () => Promise<void>;
  /** replay the log again (e.g. back from publishing a correction) */
  refresh: () => Promise<void>;
  /** live correction of past events (cricket "Edit a past ball", #06): one AMEND
   *  row through the outbox, its stat changes written; only the active scorer. */
  amend: (ops: AmendOp[], lines: string[], byName: string) => Promise<void>;
}

export function useLiveMatch(params: {
  matchId?: string;
  sport: SportId;
  /** only the assigned scorer writes; viewers are read-only */
  canScore?: boolean;
  /** full team names — used to label the opponent on attributed stat lines */
  homeTeamName?: string;
  awayTeamName?: string;
  /** ids for team/tournament-follow notifications */
  homeTeamId?: string;
  awayTeamId?: string;
  tournamentId?: string;
  /** organizer-chosen format (overs, players/side, sub rules…) */
  config?: Record<string, unknown>;
  /** the scoring lock for this device (parity #03); only the holder writes */
  lockStatus?: LockStatus;
}): UseLiveMatch {
  const { matchId, sport, canScore = true, homeTeamName, awayTeamName, homeTeamId, awayTeamId, tournamentId, config, lockStatus = 'unsupported' } = params;
  // Allowed to score AND (holding the lock, or nobody holds it, or no lock yet).
  const canWrite = canScore && canWriteWith(lockStatus);
  const plugin = getSport(sport);
  const live = isSupabaseConfigured && !!matchId && !!supabase;

  const [state, setState] = useState<unknown>(() => plugin.createInitialState(config));
  const [syncing, setSyncing] = useState(!!matchId);
  const [eventCount, setEventCount] = useState(0);

  // Refs avoid stale closures inside the realtime callback and dispatch.
  const stateRef = useRef(state);
  const seqRef = useRef(0);
  // Events already applied here, by clientId (or seq for older events).
  const appliedRef = useRef<Set<string>>(new Set());
  useSyncExternalStore(matchOutbox.subscribe, matchOutbox.getSnapshot, matchOutbox.getSnapshot);
  const rejectedCount = matchId && matchOutbox.isRejected(matchId) ? matchOutbox.pendingCount(matchId) : 0;

  // Stat-line increments still in flight — the absolute sync (parity #19) waits
  // for them so a late `+=` can't land on top of the synced value.
  const statWritesRef = useRef<Set<Promise<void>>>(new Set());
  const recordStatLine = (args: Parameters<typeof writeStatLine>[0]): Promise<void> => {
    const p = writeStatLine(args).catch(() => {});
    statWritesRef.current.add(p);
    void p.finally(() => statWritesRef.current.delete(p));
    return p;
  };
  // Persist the snapshot the plugin wants stored (cricket drops its derived ball log).
  const persist = (s: unknown) =>
    updateMatchSnapshot(matchId!, (plugin.snapshot?.(s as never) ?? s) as object, plugin.isComplete(s as never));
  // Parity #19: at completion (and after an undo / correction that leaves the
  // match complete) write the ABSOLUTE figures, then the snapshot — so `won`
  // covers any line the sync inserted. Otherwise just the snapshot.
  const syncThenPersist = async (s: unknown) => {
    if (matchId && plugin.statTotals && plugin.isComplete(s as never)) {
      await Promise.all([...statWritesRef.current]);
      await syncMatchStatLines(matchId, sport, plugin.statTotals(s as never), { home: homeTeamName, away: awayTeamName }).catch(() => 0);
    }
    await persist(s);
  };

  const setBoth = (next: unknown) => {
    stateRef.current = next;
    setState(next);
  };

  // Re-derive the whole match from its event log (backend + any unsynced queue).
  // The single source of truth for sync: used on load, on undo, and — in live mode
  // — when an event is deleted upstream or the realtime channel reconnects.
  const rebuildFromLog = useCallback(async () => {
    if (!matchId) return;
    // Published corrections (AMEND rows, parity #05) apply their edits on replay.
    const raw = mergeLog(await getMatchEvents(matchId), matchOutbox.getPending(matchId));
    const events = effectiveLog(raw);
    let s = plugin.createInitialState(config);
    const applied = new Set<string>();
    let maxSeq = 0;
    for (const e of events) {
      s = plugin.reducer(s, toAction(e));
      applied.add(eventKey(e));
      maxSeq = Math.max(maxSeq, e.seq);
    }
    for (const e of raw) { applied.add(eventKey(e)); maxSeq = Math.max(maxSeq, e.seq); }
    appliedRef.current = applied;
    seqRef.current = maxSeq;
    setBoth(s);
    setEventCount(raw.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, plugin, config]);

  useEffect(() => {
    if (!matchId) {
      setSyncing(false);
      return;
    }
    let cancelled = false;
    setSyncing(true);

    (async () => {
      // Hydrate the offline queue, then rebuild from the full log (backend + queue)
      // so a match reopened after a crash/offline stretch is complete.
      await matchOutbox.hydrate(matchId);
      if (cancelled) return;
      await rebuildFromLog();
      if (!cancelled) setSyncing(false);
      void matchOutbox.flush(matchId); // push anything left over from a previous session
    })();

    // 2) Live mode: apply future events as they arrive (scorer echo AND viewers).
    if (!live || !supabase) return () => { cancelled = true; };
    const sb = supabase;
    const channel = sb
      .channel(`match:${matchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_events', filter: `match_id=eq.${matchId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            // Fast path: apply the single new event incrementally.
            const row = payload.new as MatchEventRecord & { client_id?: string | null };
            const e: MatchEventRecord = { ...row, clientId: row.client_id ?? undefined };
            // A correction rewrites earlier events → replay everything.
            if (e.type === AMEND_TYPE) { void rebuildFromLog(); return; }
            const key = eventKey(e);
            if (appliedRef.current.has(key)) return; // already applied locally (optimistic)
            appliedRef.current.add(key);
            seqRef.current = Math.max(seqRef.current, e.seq);
            setBoth(plugin.reducer(stateRef.current, toAction(e)));
          } else {
            // DELETE (the scorer undid) or UPDATE → re-derive from the truncated
            // log so viewers don't keep an event that was removed upstream.
            void rebuildFromLog();
          }
        }
      )
      .subscribe((status) => {
        // Fires on first connect AND on every reconnect — pull the full log to
        // catch up on anything missed while the channel was down (flaky networks).
        if (status === 'SUBSCRIBED') void rebuildFromLog();
      });

    return () => {
      cancelled = true;
      sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, matchId, sport, config]);

  const dispatch = useCallback(
    (action: ScoreAction) => {
      // Optimistic local apply — instant feedback for the scorer.
      const next = plugin.reducer(stateRef.current, action);
      setBoth(next);

      if (!matchId || !canWrite) return;

      // Player attribution → stat line + notify followers (scorer side only,
      // so replay/realtime on viewers never double-counts).
      if (action.attribution) {
        const { playerId, stat, by = 1, playerName, extra, tracked } = action.attribution;
        const opponent = action.side === 'home' ? awayTeamName : homeTeamName;
        void recordStatLine({ matchId, playerId, sport, stat, by, opponent, tracked });
        // extra increments credited by the same action (e.g. a shot on target also
        // bumps shotsOnTarget) — same line, no extra notification.
        if (extra) {
          for (const [k, v] of Object.entries(extra)) {
            void recordStatLine({ matchId, playerId, sport, stat: k, by: v, opponent, tracked });
          }
        }
        if (followStore.has('player', playerId)) {
          const verb = stat === 'goals' ? `scored${by > 1 ? ` ${by}` : ''}` : `+${by} ${stat}`;
          void notify({
            title: `${playerName ?? 'A player you follow'} ${verb}!`,
            body: opponent ? `${getSport(sport).name} vs ${opponent}` : getSport(sport).name,
            playerId,
            matchId,
          });
        }
      }
      // A second player credited by the same action (e.g. a fielder's catch on a
      // bowler's wicket). Stat line only — no separate follower notification.
      if (action.attribution2) {
        const { playerId, stat, by = 1, extra, tracked } = action.attribution2;
        const opponent = action.side === 'home' ? awayTeamName : homeTeamName;
        void recordStatLine({ matchId, playerId, sport, stat, by, opponent, tracked });
        if (extra) for (const [k, v] of Object.entries(extra)) void recordStatLine({ matchId, playerId, sport, stat: k, by: v, opponent, tracked });
      }

      // Persist to the event log (demo store or Supabase) so the timeline is
      // durable and — in live mode — broadcast to every viewer.
      // A provisional seq for display; the server assigns the real one, and the
      // clientId makes a retried sync idempotent.
      const seq = seqRef.current + 1;
      seqRef.current = seq;
      const clientId = newUuid();
      appliedRef.current.add(clientId);
      setEventCount((c) => c + 1);

      // Notify followers of either team or the tournament when the match goes
      // live (first event) or finishes.
      const teamOrTourFollowed =
        (homeTeamId && followStore.has('team', homeTeamId)) ||
        (awayTeamId && followStore.has('team', awayTeamId)) ||
        (tournamentId && followStore.has('tournament', tournamentId));
      const matchLabel = `${homeTeamName ?? 'Home'} vs ${awayTeamName ?? 'Away'}`;
      if (teamOrTourFollowed && seq === 1) {
        void notify({ title: `🔴 ${matchLabel} is live`, body: getSport(sport).name, matchId });
      }
      if (teamOrTourFollowed && plugin.isComplete(next)) {
        const sm = plugin.summary(next);
        void notify({ title: `Full time — ${matchLabel}`, body: `${getSport(sport).name} · ${sm.homeScore}–${sm.awayScore}`, matchId });
      }
      const rec: MatchEventRecord = {
        seq,
        type: action.type,
        side: action.side ?? null,
        // Stash a second attribution in the payload (no dedicated column) so undo
        // can reverse it; the reducer ignores unknown payload keys on replay.
        payload: action.attribution2 ? { ...(action.payload ?? {}), _attr2: action.attribution2 } : action.payload ?? {},
        attribution: action.attribution ?? null,
        clientId,
      };
      // Durably queue the event first (survives offline/refresh), then let the
      // outbox sync it to the backend with retry. The snapshot is derived state,
      // so a best-effort update is fine — it catches up on the next synced event.
      matchOutbox.enqueue(matchId, rec);
      void syncThenPersist(next).catch(() => {});
    },
    [plugin, matchId, canWrite, sport, homeTeamName, awayTeamName, homeTeamId, awayTeamId, tournamentId]
  );

  // Undo the last recorded event: drop it from the log, reverse any stat line it
  // credited, then re-derive state by replaying the truncated log. Repeating this
  // walks the match back to any earlier point so the scorer can fix a mistake.
  const undo = useCallback(async () => {
    if (!matchId || !canWrite) return;
    // Undo the freshest event wherever it lives: an unsynced tap comes off the
    // outbox; otherwise pop it from the backend log (only the active scorer may).
    let removed: MatchEventRecord | null;
    try {
      removed = matchOutbox.pendingCount(matchId) > 0 ? matchOutbox.popLast(matchId) : await popMatchEvent(matchId);
    } catch {
      return; // scoring moved to another device — the screen shows why
    }
    if (!removed) return;
    // Reverse every stat the event credited (attribution, its extras, and a second
    // attribution such as a fielder's catch) — otherwise an undone goal lingers.
    // A correction undoes exactly the stat changes it stored; anything else
    // reverses the stats its own attribution credited.
    const reversals = removed.type === AMEND_TYPE ? undoAmendDeltas(removed) : statReversals(removed);
    for (const r of reversals) void recordStatLine({ matchId, playerId: r.playerId, sport, stat: r.stat, by: r.by });
    // Re-derive from the truncated log. In live mode this DELETE also reaches
    // viewers' realtime subscriptions, which rebuild the same way.
    await rebuildFromLog();
    void syncThenPersist(stateRef.current).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, canWrite, plugin, sport, rebuildFromLog, homeTeamName, awayTeamName]);

  // Wipe the match back to "not started" — for a game started/scored by mistake.
  // Drops unsynced taps, deletes the backend log + blanks stat lines, then rebuilds
  // to the initial state. The SCREEN gates who may do this and the time window.
  const reset = useCallback(async () => {
    if (!matchId || !canWrite) return;
    matchOutbox.clear(matchId);
    await resetMatch(matchId);
    await rebuildFromLog();
  }, [matchId, canWrite, rebuildFromLog]);

  // Taps the server refused (another device took over): drop them, reverse the
  // stat lines they already credited on dispatch, and show the server's log.
  const discardRejected = useCallback(async () => {
    if (!matchId) return;
    for (const rec of matchOutbox.discard(matchId)) {
      for (const r of statReversals(rec)) void recordStatLine({ matchId, playerId: r.playerId, sport, stat: r.stat, by: r.by });
    }
    await rebuildFromLog();
  }, [matchId, sport, rebuildFromLog]);

  const amend = useCallback(async (ops: AmendOp[], lines: string[], byName: string) => {
    // Unsynced taps have provisional seqs — an op could hit the wrong event, so the
    // screen blocks editing until the outbox is empty; double-check here.
    if (!matchId || !canWrite || !ops.length || matchOutbox.pendingCount(matchId) > 0) return;
    const plan = await planAmendment(matchId, sport, config, ops, lines, byName);
    matchOutbox.enqueue(matchId, { ...plan.record, seq: seqRef.current + 1 });
    // A sport with absolute totals, on a finished match: the sync below sets the
    // corrected values (Decision 6) — writing the deltas too would only add a
    // second write per row. The AMEND row still stores the deltas (undo).
    const absolute = !!plugin.statTotals && plugin.isComplete(plan.afterState as never);
    if (!absolute) for (const d of plan.deltas) void recordStatLine({ matchId, playerId: d.playerId, sport, stat: d.stat, by: d.by });
    await rebuildFromLog();
    void syncThenPersist(stateRef.current).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, canWrite, sport, config, plugin, rebuildFromLog, homeTeamName, awayTeamName]);

  return { state, dispatch, undo, reset, eventCount, live, syncing, rejectedCount, discardRejected, refresh: rebuildFromLog, amend };
}
