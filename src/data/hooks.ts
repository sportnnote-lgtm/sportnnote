/** Thin React hooks over the repository. Refetch on screen focus so items an
 *  organizer just created appear when returning to a list. */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  getMatches,
  getTeams,
  getTournament,
  getTournaments,
  getMyTournaments,
  getPlayers,
  getPlayer,
  getPlayerStatLines,
  getAllStatLines,
  setFollow,
  getFootballProfile,
  searchPlayers,
  getCities,
  getStatLinesForPlayers,
  getTeamSummaries,
  getTeamSummary,
  getListings,
  getOrganizations,
} from './repos';
import { aggregate, type PlayerStats } from './stats';
import { teamStandings, statLeaders, type TeamStanding, type StatLeader } from './standings';
import { followStore, type FollowType } from './followStore';
import { captainStore } from './captainStore';
import { notifyStore } from './notifyStore';
import type {
  AppNotification,
  FootballProfile,
  Listing,
  Match,
  Organization,
  Player,
  SportId,
  StatLine,
  Team,
  TeamSummary,
  Tournament,
} from '../core/types';

export interface PlayerSummary {
  player: Player;
  stats: PlayerStats;
}

export function useTournament() {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      getTournament().then((t) => on && setTournament(t));
      return () => {
        on = false;
      };
    }, [])
  );
  return tournament;
}

/** Tournaments the user plays in or follows — for the Home switcher. */
export function useMyTournaments(profileId?: string) {
  const { idsOfType } = useFollow(profileId);
  const followed = idsOfType('tournament');
  const [list, setList] = useState<Tournament[]>([]);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      getMyTournaments(profileId, followed).then((t) => on && setList(t));
      return () => {
        on = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profileId, followed.join(',')])
  );
  return list;
}

/** A single tournament by id (from the user's set). */
export function useTournamentById(id?: string) {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      if (!id) {
        setTournament(null);
        return;
      }
      getTournaments().then((list) => on && setTournament(list.find((t) => t.id === id) ?? null));
      return () => {
        on = false;
      };
    }, [id])
  );
  return tournament;
}

/** All matches + stat lines + players, scoped to one tournament's matches.
 *  One fetch powers a whole tournament/sport dashboard via the pure functions
 *  in standings.ts. */
export function useLeagueData(tournamentId?: string) {
  const [data, setData] = useState<{ matches: Match[]; lines: StatLine[]; players: Player[]; loading: boolean }>({
    matches: [], lines: [], players: [], loading: true,
  });
  useFocusEffect(
    useCallback(() => {
      let on = true;
      Promise.all([getMatches(), getAllStatLines(), getPlayers()]).then(([m, l, p]) => {
        if (!on) return;
        const matches = tournamentId ? m.filter((x) => x.tournamentId === tournamentId) : m;
        // Scope stat lines to THIS tournament's matches so leaders reflect only
        // contributions here — not a player's history elsewhere.
        const matchIds = new Set(matches.map((x) => x.id));
        const lines = tournamentId ? l.filter((sl) => matchIds.has(sl.matchId)) : l;
        setData({ matches, lines, players: p, loading: false });
      });
      return () => {
        on = false;
      };
    }, [tournamentId])
  );
  return data;
}

export function useMatches(filter?: SportId | 'all') {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      setLoading(true);
      getMatches(filter && filter !== 'all' ? filter : undefined).then((m) => {
        if (on) {
          setMatches(m);
          setLoading(false);
        }
      });
      return () => {
        on = false;
      };
    }, [filter])
  );
  return { matches, loading };
}

/** Subscribe to the follow set + a typed toggle that also persists (live). */
export function useFollow(profileId?: string) {
  const keys = useSyncExternalStore(followStore.subscribe, followStore.getSnapshot, followStore.getSnapshot);
  const isFollowing = useCallback((type: FollowType, id: string) => keys.includes(`${type}:${id}`), [keys]);
  const toggle = useCallback(
    (type: FollowType, id: string) => {
      const willFollow = !followStore.has(type, id);
      followStore.toggle(type, id);
      void setFollow(type, id, willFollow, profileId);
    },
    [profileId]
  );
  /** ids of followed entities of a given type */
  const idsOfType = useCallback(
    (type: FollowType) => keys.filter((k) => k.startsWith(`${type}:`)).map((k) => k.slice(type.length + 1)),
    [keys]
  );
  return { keys, isFollowing, toggle, idsOfType };
}

/** Teams the signed-in user captains (subscribes to the captain store). */
export function useCaptainships() {
  const ids = useSyncExternalStore(captainStore.subscribe, captainStore.getSnapshot, captainStore.getSnapshot);
  return { ids, isCaptain: useCallback((teamId: string) => ids.includes(teamId), [ids]) };
}

/** The in-app notification feed + unread count. */
export function useNotifications(): { items: AppNotification[]; unread: number } {
  const items = useSyncExternalStore(notifyStore.subscribe, notifyStore.getSnapshot, notifyStore.getSnapshot);
  return { items, unread: items.reduce((n, i) => n + (i.read ? 0 : 1), 0) };
}

export function usePlayers() {
  const [players, setPlayers] = useState<Player[]>([]);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      getPlayers().then((p) => on && setPlayers(p));
      return () => {
        on = false;
      };
    }, [])
  );
  return players;
}

/** All players with rolled-up stats, ranked by matches played — for Discover. */
export function usePlayerSummaries() {
  const [summaries, setSummaries] = useState<PlayerSummary[]>([]);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      Promise.all([getPlayers(), getAllStatLines()]).then(([players, lines]) => {
        if (!on) return;
        const byPlayer = new Map<string, typeof lines>();
        for (const l of lines) {
          const arr = byPlayer.get(l.playerId) ?? [];
          arr.push(l);
          byPlayer.set(l.playerId, arr);
        }
        const result = players
          .map((player) => ({ player, stats: aggregate(byPlayer.get(player.id) ?? []) }))
          .sort((a, b) => b.stats.matches - a.stats.matches);
        setSummaries(result);
      });
      return () => {
        on = false;
      };
    }, [])
  );
  return summaries;
}

/** Server-side player search → ranked summaries. Filtering happens in the repo
 *  (DB query live, in-memory in demo); only the matched set is hydrated. */
export function usePlayerSearch(opts: { query: string; sport: SportId | 'all'; city: string }) {
  const { query, sport, city } = opts;
  const [results, setResults] = useState<PlayerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let on = true;
    setLoading(true);
    searchPlayers({ query, sport: sport === 'all' ? undefined : sport, city: city === 'all' ? undefined : city }).then(
      async (players) => {
        const lines = await getStatLinesForPlayers(players.map((p) => p.id));
        if (!on) return;
        const byPlayer = new Map<string, typeof lines>();
        for (const l of lines) {
          const arr = byPlayer.get(l.playerId) ?? [];
          arr.push(l);
          byPlayer.set(l.playerId, arr);
        }
        setResults(
          players
            .map((player) => ({ player, stats: aggregate(byPlayer.get(player.id) ?? []) }))
            .sort((a, b) => b.stats.matches - a.stats.matches || a.player.fullName.localeCompare(b.player.fullName))
        );
        setLoading(false);
      }
    );
    return () => {
      on = false;
    };
  }, [query, sport, city]);
  return { results, loading };
}

export function useTeamSummaries() {
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      getTeamSummaries().then((t) => on && setTeams(t));
      return () => {
        on = false;
      };
    }, [])
  );
  return teams;
}

/** Returns `loading` too, so a screen can tell "still fetching" apart from
 *  "no such team" instead of showing a spinner forever. */
export function useTeamSummary(id: string) {
  const [state, setState] = useState<{ team: TeamSummary | null; loading: boolean }>({ team: null, loading: true });
  useFocusEffect(
    useCallback(() => {
      let on = true;
      setState((s) => ({ ...s, loading: true }));
      getTeamSummary(id).then((t) => on && setState({ team: t, loading: false }));
      return () => {
        on = false;
      };
    }, [id])
  );
  return state;
}

/** Per-sport standings + individual stat leaders (and the matches, for reuse).
 *  Pass `tournamentId` to scope the table AND the leaders to one tournament —
 *  otherwise it's every match in that sport. */
export function useStandings(sport: SportId, tournamentId?: string): { teams: TeamStanding[]; leaders: StatLeader[]; matches: Match[] } {
  const [data, setData] = useState<{ teams: TeamStanding[]; leaders: StatLeader[]; matches: Match[] }>({ teams: [], leaders: [], matches: [] });
  useFocusEffect(
    useCallback(() => {
      let on = true;
      Promise.all([getMatches(), getAllStatLines(), getPlayers()]).then(([matches, lines, players]) => {
        if (!on) return;
        const scopedMatches = tournamentId ? matches.filter((m) => m.tournamentId === tournamentId) : matches;
        // Leaders come from stat lines, so scope those by the same match set.
        const ids = new Set(scopedMatches.map((m) => m.id));
        const scopedLines = tournamentId ? lines.filter((l) => ids.has(l.matchId)) : lines;
        setData({
          teams: teamStandings(scopedMatches, sport),
          leaders: statLeaders(scopedLines, players, sport),
          matches: scopedMatches,
        });
      });
      return () => {
        on = false;
      };
    }, [sport, tournamentId])
  );
  return data;
}

/** Connect noticeboard posts, refetched on focus and when filters change. */
export function useListings(filter?: { kind?: Listing['kind']; sport?: SportId }): { listings: Listing[]; reload: () => void } {
  const [listings, setListings] = useState<Listing[]>([]);
  const [nonce, setNonce] = useState(0);
  const kind = filter?.kind;
  const sport = filter?.sport;
  useFocusEffect(
    useCallback(() => {
      let on = true;
      getListings({ kind, sport }).then((l) => on && setListings(l));
      return () => {
        on = false;
      };
    }, [kind, sport, nonce])
  );
  return { listings, reload: () => setNonce((n) => n + 1) };
}

/** Tournaments open for registration — surfaced in Discover. */
export function useOpenTournaments(): Tournament[] {
  const [list, setList] = useState<Tournament[]>([]);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      getTournaments().then((ts) => on && setList(ts.filter((t) => t.isOpen)));
      return () => {
        on = false;
      };
    }, [])
  );
  return list;
}

/** All organizations, refetched on focus (so new members/logos show). */
export function useOrganizations(): Organization[] {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      getOrganizations().then((o) => on && setOrgs(o));
      return () => {
        on = false;
      };
    }, [])
  );
  return orgs;
}

export function useCities() {
  const [cities, setCities] = useState<string[]>([]);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      getCities().then((c) => on && setCities(c));
      return () => {
        on = false;
      };
    }, [])
  );
  return cities;
}

/** A player plus their rolled-up stats. */
export function usePlayerProfile(playerId: string | null) {
  const [player, setPlayer] = useState<Player | null>(null);
  // Stats split by whether the match belonged to a tournament: `stats` (all) stays
  // for existing callers; `official`/`friendly` power the profile's scope toggle.
  const [scoped, setScoped] = useState<{ all: PlayerStats; official: PlayerStats; friendly: PlayerStats } | null>(null);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      if (!playerId) {
        setPlayer(null);
        setScoped(null);
        return;
      }
      Promise.all([getPlayer(playerId), getPlayerStatLines(playerId), getMatches()]).then(([p, lines, matches]) => {
        if (!on) return;
        setPlayer(p);
        const friendlyIds = new Set(matches.filter((m) => !m.tournamentId).map((m) => m.id));
        setScoped({
          all: aggregate(lines),
          official: aggregate(lines.filter((l) => !friendlyIds.has(l.matchId))),
          friendly: aggregate(lines.filter((l) => friendlyIds.has(l.matchId))),
        });
      });
      return () => {
        on = false;
      };
    }, [playerId])
  );
  return { player, stats: scoped?.all ?? null, official: scoped?.official ?? null, friendly: scoped?.friendly ?? null };
}

export function useFootballProfile(playerId: string | null) {
  const [profile, setProfile] = useState<FootballProfile | null>(null);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      if (playerId) getFootballProfile(playerId).then((p) => on && setProfile(p));
      else setProfile(null);
      return () => {
        on = false;
      };
    }, [playerId])
  );
  return profile;
}

export function useTeams(sport?: SportId, nonce = 0) {
  const [teams, setTeams] = useState<Team[]>([]);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      getTeams(sport).then((t) => on && setTeams(t));
      return () => {
        on = false;
      };
    }, [sport, nonce])
  );
  return teams;
}
