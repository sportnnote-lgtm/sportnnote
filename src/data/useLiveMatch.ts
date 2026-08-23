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
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../core/supabase';
import { getSport } from '../sports/registry';
import { recordStatLine, getMatchEvents, popMatchEvent, updateMatchSnapshot } from './repos';
import { matchOutbox } from './matchOutbox';
import { followStore } from './followStore';
import { notify } from '../core/notifications';
import type { MatchEventRecord, SportId } from '../core/types';
import type { Attribution, ScoreAction } from '../sports/types';

const toAction = (e: MatchEventRecord): ScoreAction => ({
  type: e.type,
  side: e.side ?? undefined,
  payload: e.payload ?? undefined,
  attribution: e.attribution ?? undefined,
});

/** Merge backend + queued (unsynced) events, de-duped by seq and ordered — so
 *  replay reflects everything even when some taps haven't synced yet. */
const mergeBySeq = (a: MatchEventRecord[], b: MatchEventRecord[]): MatchEventRecord[] => {
  const bySeq = new Map<number, MatchEventRecord>();
  for (const e of [...a, ...b]) bySeq.set(e.seq, e);
  return [...bySeq.values()].sort((x, y) => x.seq - y.seq);
};

export interface UseLiveMatch {
  state: unknown;
  dispatch: (action: ScoreAction) => void;
  /** Undo the last recorded event (ball/setup step) — re-derives from the log. */
  undo: () => void;
  /** how many events are in the log (0 = nothing to undo) */
  eventCount: number;
  /** true = changes are broadcast over realtime (Supabase); false = local-only */
  live: boolean;
  syncing: boolean;
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
}): UseLiveMatch {
  const { matchId, sport, canScore = true, homeTeamName, awayTeamName, homeTeamId, awayTeamId, tournamentId, config } = params;
  const plugin = getSport(sport);
  const live = isSupabaseConfigured && !!matchId && !!supabase;

  const [state, setState] = useState<unknown>(() => plugin.createInitialState(config));
  const [syncing, setSyncing] = useState(!!matchId);
  const [eventCount, setEventCount] = useState(0);

  // Refs avoid stale closures inside the realtime callback and dispatch.
  const stateRef = useRef(state);
  const seqRef = useRef(0);
  const appliedRef = useRef<Set<number>>(new Set());

  const setBoth = (next: unknown) => {
    stateRef.current = next;
    setState(next);
  };

  // Re-derive the whole match from its event log (backend + any unsynced queue).
  // The single source of truth for sync: used on load, on undo, and — in live mode
  // — when an event is deleted upstream or the realtime channel reconnects.
  const rebuildFromLog = useCallback(async () => {
    if (!matchId) return;
    const events = mergeBySeq(await getMatchEvents(matchId), matchOutbox.getPending(matchId));
    let s = plugin.createInitialState(config);
    const applied = new Set<number>();
    let maxSeq = 0;
    for (const e of events) {
      s = plugin.reducer(s, toAction(e));
      applied.add(e.seq);
      maxSeq = Math.max(maxSeq, e.seq);
    }
    appliedRef.current = applied;
    seqRef.current = maxSeq;
    setBoth(s);
    setEventCount(events.length);
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
            const e = payload.new as MatchEventRecord;
            if (appliedRef.current.has(e.seq)) return; // already applied locally (optimistic)
            appliedRef.current.add(e.seq);
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

      if (!matchId || !canScore) return;

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
      const seq = seqRef.current + 1;
      seqRef.current = seq;
      appliedRef.current.add(seq);
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
      };
      // Durably queue the event first (survives offline/refresh), then let the
      // outbox sync it to the backend with retry. The snapshot is derived state,
      // so a best-effort update is fine — it catches up on the next synced event.
      matchOutbox.enqueue(matchId, rec);
      void updateMatchSnapshot(matchId, next as object, plugin.isComplete(next)).catch(() => {});
    },
    [plugin, matchId, canScore, sport, homeTeamName, awayTeamName, homeTeamId, awayTeamId, tournamentId]
  );

  // Undo the last recorded event: drop it from the log, reverse any stat line it
  // credited, then re-derive state by replaying the truncated log. Repeating this
  // walks the match back to any earlier point so the scorer can fix a mistake.
  const undo = useCallback(async () => {
    if (!matchId || !canScore) return;
    // Undo the freshest event wherever it lives: an unsynced tap comes off the
    // outbox; otherwise pop it from the backend log.
    const removed = matchOutbox.pendingCount(matchId) > 0 ? matchOutbox.popLast(matchId) : await popMatchEvent(matchId);
    if (!removed) return;
    if (removed.attribution) {
      const { playerId, stat, by = 1, extra } = removed.attribution;
      void recordStatLine({ matchId, playerId, sport, stat, by: -by });
      // Reverse the secondary stats the action also credited (e.g. a goal also
      // bumped shots & shotsOnTarget) — otherwise an undone goal lingers in the
      // per-player tallies / summary.
      if (extra) {
        for (const [k, v] of Object.entries(extra)) {
          void recordStatLine({ matchId, playerId, sport, stat: k, by: -v });
        }
      }
    }
    // Reverse a second attribution stashed in the payload (e.g. a fielder's catch).
    const a2 = (removed.payload as { _attr2?: Attribution } | null)?._attr2;
    if (a2) {
      void recordStatLine({ matchId, playerId: a2.playerId, sport, stat: a2.stat, by: -(a2.by ?? 1) });
      if (a2.extra) for (const [k, v] of Object.entries(a2.extra)) void recordStatLine({ matchId, playerId: a2.playerId, sport, stat: k, by: -v });
    }
    // Re-derive from the truncated log. In live mode this DELETE also reaches
    // viewers' realtime subscriptions, which rebuild the same way.
    await rebuildFromLog();
    void updateMatchSnapshot(matchId, stateRef.current as object, plugin.isComplete(stateRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, canScore, plugin, sport, rebuildFromLog]);

  return { state, dispatch, undo, eventCount, live, syncing };
}
