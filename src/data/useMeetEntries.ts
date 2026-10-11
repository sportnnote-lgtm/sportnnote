/** SD-128 — the people a meet's entries desk works with: the meet's teams /
 *  houses with their rosters (or, before any team is added, houses from
 *  players' house names), the event-only athletes from the entries document,
 *  and the document itself. Shared by the entries matrix and late entry. */
import { useCallback, useEffect, useState } from 'react';
import { getPlayers, getTournamentTeams, getTeamRosters } from './repos';
import { getEntriesDoc } from './meetEntriesStore';
import { ageOf } from '../core/age';
import { matchTeam, emptyEntries, type MeetEntriesDoc } from './results';
import type { Player } from '../core/types';

export interface MeetSource { key: string; name: string; colorHex?: string; teamId?: string; playerIds: string[] }
export interface MeetAthlete {
  id: string;
  name: string;
  team?: { id?: string; name: string; colorHex?: string };
  gender?: string;
  age?: number;
  /** typed age group (bulk add without a DOB) */
  ageGroup?: string;
  eventOnly?: boolean;
  bib?: string;
}

/** Build the athlete list (pure — tests use it). */
export function meetAthletes(sources: MeetSource[], players: Player[], doc: MeetEntriesDoc): MeetAthlete[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  const out = new Map<string, MeetAthlete>();
  const add = (p: Player, team?: MeetAthlete['team']) => {
    const extra = doc.athletes?.[p.id];
    const g = extra?.gender ?? p.gender;
    out.set(p.id, {
      id: p.id, name: p.fullName, team: out.get(p.id)?.team ?? team, gender: g, age: ageOf(p),
      ...(extra?.age ? { ageGroup: extra.age } : {}), ...(extra?.eventOnly ? { eventOnly: true } : {}), ...(extra?.bib ? { bib: extra.bib } : {}),
    });
  };
  for (const s of sources) for (const id of s.playerIds) { const p = byId.get(id); if (p) add(p, { id: s.teamId, name: s.name, colorHex: s.colorHex }); }
  for (const [id, extra] of Object.entries(doc.athletes ?? {})) {
    const p = byId.get(id);
    if (!p || out.has(id)) { if (p) add(p); continue; }
    const house = extra.house ?? p.houseName;
    const t = matchTeam(house, sources);
    add(p, t ? { id: t.teamId, name: t.name, colorHex: t.colorHex } : house ? { name: house } : undefined);
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function useMeetEntries(tournamentId: string | undefined, sport: string, enabled = true) {
  const [sources, setSources] = useState<MeetSource[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [doc, setDoc] = useState<MeetEntriesDoc>(emptyEntries());
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    if (!enabled) return;
    let on = true;
    void (async () => {
      try {
        const [teams, ps, d] = await Promise.all([tournamentId ? getTournamentTeams(tournamentId) : Promise.resolve([]), getPlayers(), getEntriesDoc(tournamentId, sport)]);
        const rosters = await getTeamRosters(teams.map((t) => t.id));
        const byName = new Map<string, MeetSource>();
        for (const t of teams) {
          const k = t.name.trim().toLowerCase();
          const cur = byName.get(k);
          const ids = rosters.get(t.id) ?? [];
          if (cur) cur.playerIds = [...new Set([...cur.playerIds, ...ids])];
          else byName.set(k, { key: `t:${t.id}`, name: t.name, colorHex: t.colorHex, teamId: t.id, playerIds: ids });
        }
        // houses from players' house names only when the meet has no teams yet
        for (const p of teams.length ? [] : ps) {
          if (!p.houseName) continue;
          const k = p.houseName.trim().toLowerCase();
          const cur = byName.get(k) ?? { key: `h:${k}`, name: p.houseName, colorHex: p.houseColor, playerIds: [] };
          if (!cur.playerIds.includes(p.id)) cur.playerIds.push(p.id);
          byName.set(k, cur);
        }
        if (!on) return;
        setSources([...byName.values()].sort((a, b) => a.name.localeCompare(b.name)));
        setPlayers(ps);
        setDoc(d);
      } finally { if (on) setLoading(false); }
    })();
    return () => { on = false; };
  }, [tournamentId, sport, enabled, tick]);
  return { sources, players, doc, setDoc, loading, reload, athletes: meetAthletes(sources, players, doc) };
}
