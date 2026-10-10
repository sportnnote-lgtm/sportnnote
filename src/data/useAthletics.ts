/** SD-90 — a tournament's athletics meet (SD-94: or swim meet — `sport`;
 *  'all' = every event sport, for the medal table): every event with its
 *  rounds and entries, the meet record book and (when an organisation hosts it)
 *  the school record book derived from its other meets. Reloads on focus. */
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getPlayers } from './repos';
import { getMeet, getRecordBook, getOrgRecordBook } from './resultsStore';
import type { MeetEvent, RecordMark } from './results';

export function useMeet(tournamentId?: string, hostOrgId?: string, sport: string = 'athletics') {
  const [events, setEvents] = useState<MeetEvent[]>([]);
  const [records, setRecords] = useState<RecordMark[]>([]);
  const [schoolRecords, setSchoolRecords] = useState<RecordMark[]>([]);
  const [loading, setLoading] = useState(true);
  useFocusEffect(useCallback(() => {
    let on = true;
    if (!tournamentId) { setEvents([]); setLoading(false); return; }
    void (async () => {
      try {
        const ps = await getPlayers();
        const names = new Map(ps.map((p) => [p.id, p.fullName]));
        const nameOf = (id: string) => names.get(id) ?? 'Athlete';
        const [evs, book, sr] = await Promise.all([
          getMeet(tournamentId, nameOf, sport),
          sport === 'all' ? Promise.resolve([]) : getRecordBook(tournamentId, sport),
          hostOrgId && sport !== 'all' ? getOrgRecordBook(hostOrgId, tournamentId, nameOf, sport) : Promise.resolve([]),
        ]);
        if (!on) return;
        setEvents(evs); setRecords(book); setSchoolRecords(sr);
      } finally { if (on) setLoading(false); }
    })();
    return () => { on = false; };
  }, [tournamentId, hostOrgId, sport]));
  return { events, records, schoolRecords, loading };
}
