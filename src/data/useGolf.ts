/** Load golf rounds (one event, or all of a tournament's) with their entries,
 *  courses and player names; refreshes on focus and, live, on any card change. */
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase, isSupabaseConfigured } from '../core/supabase';
import { getFieldEvent, getFieldEvents, getFieldEntries, getGolfCourses } from './golf';
import { getPlayers, getTeams } from './repos';
import type { FieldEntry, FieldEvent, GolfCourse, Player, Team } from '../core/types';

export interface GolfData {
  events: FieldEvent[];
  entries: FieldEntry[];
  courses: GolfCourse[];
  players: Map<string, Player>;
  /** SD-76 — the teams entries score for (team stroke play), by id */
  teams: Map<string, Team>;
  loading: boolean;
  reload: () => Promise<void>;
}

export function useGolfRounds(scope: { eventId?: string; tournamentId?: string }): GolfData {
  const [events, setEvents] = useState<FieldEvent[]>([]);
  const [entries, setEntries] = useState<FieldEntry[]>([]);
  const [courses, setCourses] = useState<GolfCourse[]>([]);
  const [players, setPlayers] = useState<Map<string, Player>>(new Map());
  const [teams, setTeams] = useState<Map<string, Team>>(new Map());
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    // SD-49: no scope = nothing to load (a page that only needs golf sometimes)
    if (!scope.eventId && !scope.tournamentId) { setEvents([]); setEntries([]); setLoading(false); return; }
    const evs = scope.eventId
      ? [await getFieldEvent(scope.eventId)].filter((e): e is FieldEvent => !!e)
      : scope.tournamentId ? await getFieldEvents({ tournamentId: scope.tournamentId, sport: 'golf' }) : [];
    const [ens, cs, ps] = await Promise.all([getFieldEntries(evs.map((e) => e.id)), getGolfCourses(), getPlayers()]);
    setEvents(evs);
    setEntries(ens);
    setCourses(cs);
    setPlayers(new Map(ps.map((p) => [p.id, p])));
    if (ens.some((e) => e.teamId)) setTeams(new Map((await getTeams().catch(() => [] as Team[])).map((t) => [t.id, t])));
    setLoading(false);
  }, [scope.eventId, scope.tournamentId]);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  // Live leaderboard: any card change in these rounds triggers a reload.
  const ids = events.map((e) => e.id).join(',');
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !ids) return;
    const ch = supabase.channel(`golf:${ids}`);
    for (const id of ids.split(',')) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'field_entries', filter: `event_id=eq.${id}` }, () => { void reload(); });
    }
    ch.subscribe();
    return () => { void supabase!.removeChannel(ch); };
  }, [ids, reload]);

  return { events, entries, courses, players, teams, loading, reload };
}
