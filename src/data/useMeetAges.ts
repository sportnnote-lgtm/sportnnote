/**
 * SD-130 — age groups on the meet's cut-off day (31 Dec of the meet year by
 * default; 1 Jan, the meet's first day or a board's date — the tournament's
 * `formats[sport].ageOn`). A player's DOB gives the age on that day when the
 * app can see it; otherwise the server's age on that day (meet_ages(),
 * organisers only); otherwise — before that migration — the age today.
 */
import { useEffect, useMemo, useState } from 'react';
import { ageCutoff, meetAgeOf, type AgeBasis } from '../core/age';
import { getMeetAges } from './resultsStore';
import { getOrganization } from './repos';
import { standardAt } from '../core/org';
import type { Organization, Player, Tournament } from '../core/types';

export function meetAgeBasis(tournament: Tournament | null | undefined, sport: string): AgeBasis {
  const v = (tournament?.formats?.[sport as never] as Record<string, unknown> | undefined)?.ageOn;
  return typeof v === 'string' && v ? v : 'dec31';
}

export function useMeetAges(tournament: Tournament | null | undefined, sport: string, players: Pick<Player, 'id' | 'dob' | 'age'>[]) {
  // a basis the organiser just saved (the tournament object refreshes on focus)
  const [saved, setBasis] = useState<AgeBasis | null>(null);
  const basis = saved ?? meetAgeBasis(tournament, sport);
  const cutoff = ageCutoff(basis, tournament?.startDate);
  const [server, setServer] = useState<Map<string, number>>(new Map());
  // only the players whose DOB we can't see
  const missing = useMemo(() => players.filter((p) => !p.dob).map((p) => p.id).sort().join(','), [players]);
  useEffect(() => {
    let on = true;
    if (!tournament?.id || !missing) { setServer(new Map()); return; }
    void getMeetAges(tournament.id, sport, missing.split(',')).then((m) => { if (on) setServer(m); }).catch(() => {});
    return () => { on = false; };
  }, [tournament?.id, sport, missing, cutoff]);
  const ageFor = (p: Pick<Player, 'id' | 'dob' | 'age'>) => meetAgeOf(p, cutoff, server);
  // SD-153: grade bands ("Grades 9–12") read each student's class on the meet's
  // first day from the host school's class timeline.
  const [hostOrg, setHostOrg] = useState<Organization | null>(null);
  const hostOrgId = tournament?.hostOrgId;
  useEffect(() => {
    let on = true;
    if (!hostOrgId) { setHostOrg(null); return; }
    void getOrganization(hostOrgId).then((o) => { if (on) setHostOrg(o); }).catch(() => {});
    return () => { on = false; };
  }, [hostOrgId]);
  const meetDay = tournament?.startDate?.slice(0, 10);
  const gradeFor = (p: Pick<Player, 'id'>): string | undefined =>
    standardAt(hostOrg?.members.find((m) => m.playerId === p.id), meetDay);
  return { basis, cutoff, ageFor, gradeFor, setBasis };
}
