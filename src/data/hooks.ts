/** Thin React hooks over the repository. Refetch on screen focus so items an
 *  organizer just created appear when returning to a list. */
import { promptSignIn } from '../core/guest';
import { isSupabaseConfigured } from '../core/supabase';
import { getFieldEvents } from './golf';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  getMatches,
  getScopedMatches,
  getTeams,
  getTournamentTeams,
  getTournamentEntries,
  getTournamentCategories,
  getTournament,
  getTournaments,
  getMyTournaments,
  getPlayers,
  getPlayer,
  getPlayerStatLines,
  getAllStatLines,
  setFollow,
  setFollowPrefs,
  getFootballProfile,
  searchPlayers,
  searchAll,
  type PlayerSearch,
  getCities,
  getStatLinesForPlayers,
  getTeamSummaries,
  getTeamSummary,
  getListings,
  getOrganizations,
  canManageTeam,
  getMyPlayerId,
} from './repos';
import { aggregate, type PlayerStats } from './stats';
import { isSearchable, rankByName, type SearchResults, type SearchKind } from './search';
import { teamStandings, statLeaders, standingsConfigFromFormat, type TeamStanding, type StatLeader } from './standings';
import { standingsPhases, type StandingsPhase } from './groups';
import { followStore, type FollowType } from './followStore';
import type { FollowPrefs } from './followPrefs';
import { notice } from '../core/confirm';
import { captainStore } from './captainStore';
import { useAuth } from '../core/auth';
import type { Role } from '../core/types';
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
  TournamentCategory,
  TournamentEntry,
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
      // A fresh object each time: demo mode updates tournaments in place, and the
      // same reference wouldn't re-render (e.g. back from saving its format).
      getTournaments({ includeDeleted: true }).then((list) => { const t = list.find((x) => x.id === id); if (on) setTournament(t ? { ...t } : null); }); // deleted → the page says so
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
export function useLeagueData(tournamentId?: string, nonce = 0) {
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
    }, [tournamentId, nonce])
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

/** The signed-in user's two match views (see getScopedMatches): `feed` for the
 *  Home page (things they follow + their own), `mine` for the Matches tab (only
 *  matches they play in or organize/score). Refetches on focus, so following a
 *  player then returning Home surfaces their matches. */
export function useScopedMatches(profileId?: string, nonce = 0) {
  const [data, setData] = useState<{ mine: Match[]; feed: Match[] }>({ mine: [], feed: [] });
  const [loading, setLoading] = useState(true);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      setLoading(true);
      getScopedMatches(profileId).then((r) => { if (on) { setData(r); setLoading(false); } });
      return () => { on = false; };
    }, [profileId, nonce])
  );
  return { ...data, loading };
}

/** Subscribe to the follow set + a typed toggle that also persists (live). */
export function useFollow(profileId?: string) {
  const keys = useSyncExternalStore(followStore.subscribe, followStore.getSnapshot, followStore.getSnapshot);
  const isFollowing = useCallback((type: FollowType, id: string) => keys.includes(`${type}:${id}`), [keys]);
  const toggle = useCallback(
    (type: FollowType, id: string) => {
      // Logged-out guest on a shared page: following needs an account.
      if (isSupabaseConfigured && !profileId) { promptSignIn('up'); return; }
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
  /** Alert choices for a follow ({} = all on). `keys` changes on every store
   *  emit (prefs included), so this re-evaluates when choices change. */
  const prefsOf = useCallback(
    (type: FollowType, id: string): FollowPrefs => followStore.prefsOf(type, id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keys]
  );
  /** Save alert choices optimistically; on failure restore them and say why. */
  const savePrefs = useCallback(
    async (type: FollowType, id: string, prefs: FollowPrefs): Promise<boolean> => {
      const before = followStore.prefsOf(type, id);
      followStore.setPrefs(type, id, prefs);
      const ok = await setFollowPrefs(type, id, prefs, profileId);
      if (!ok) {
        followStore.setPrefs(type, id, before);
        notice('Couldn’t save alert choices', 'This needs a database update.');
      }
      return ok;
    },
    [profileId]
  );
  return { keys, isFollowing, toggle, idsOfType, prefsOf, savePrefs };
}

/** Teams the signed-in user captains (subscribes to the captain store). */
export function useCaptainships() {
  const ids = useSyncExternalStore(captainStore.subscribe, captainStore.getSnapshot, captainStore.getSnapshot);
  return { ids, isCaptain: useCallback((teamId: string) => ids.includes(teamId), [ids]) };
}

/* Dev only (web): `__sportfolioPerm.as('player')` previews screens as a plain
   viewer in demo mode, where the demo user is support; `.as(null)` restores. */
let permRoleOverride: Role | null = null;
const permListeners = new Set<() => void>();
if (typeof __DEV__ !== 'undefined' && __DEV__ && typeof window !== 'undefined') {
  (window as unknown as { __sportfolioPerm?: object }).__sportfolioPerm = {
    as(role: Role | null) { permRoleOverride = role; permListeners.forEach((f) => f()); return `previewing as ${role ?? 'yourself'}`; },
  };
}

/** May I manage this team's squad (players, captain/VC, roles, invite link)?
 *  null while it's being worked out — render read-only until then. */
export function useTeamPermission(teamId?: string): { canManage: boolean | null; refresh: () => void } {
  const { profile } = useAuth();
  const { isCaptain } = useCaptainships();
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    permListeners.add(f);
    return () => { permListeners.delete(f); };
  }, []);
  useEffect(() => {
    if (!teamId) { setCanManage(null); return; }
    let on = true;
    const role = permRoleOverride ?? profile?.role;
    (async () => {
      const myPlayerId = await getMyPlayerId(profile?.id);
      const ok = await canManageTeam(teamId, { profileId: profile?.id, myPlayerId, role, isCaptainStore: !permRoleOverride && isCaptain(teamId) });
      if (on) setCanManage(ok);
    })().catch(() => on && setCanManage(false));
    return () => { on = false; };
  }, [teamId, profile?.id, profile?.role, isCaptain, tick]);
  return { canManage, refresh };
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
export function usePlayerSearch(opts: PlayerSearch) {
  const [results, setResults] = useState<PlayerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(opts);
  useEffect(() => {
    let on = true;
    setLoading(true);
    setError(null);
    // Debounce typing so a name or number isn't searched on every keystroke.
    const t = setTimeout(() => {
      searchPlayers(opts).then(
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
        },
        (e: unknown) => {
          if (!on) return;
          setResults([]);
          setError(e instanceof Error ? e.message : 'Search failed');
          setLoading(false);
        },
      );
    }, 300);
    return () => {
      on = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { results, loading, error };
}

const NO_RESULTS: SearchResults<PlayerSummary> = { players: [], teams: [], matches: [], tournaments: [] };

/** Global search (parity #22): players, teams, matches and tournaments for one
 *  query, debounced like `usePlayerSearch`. `active` is false for a query too
 *  short to search (the screen shows browse content instead). While a new query
 *  loads, the previous results stay up so the list doesn't flicker. Players
 *  keep their filters; picked sports also narrow the other three types. */
export function useGlobalSearch(q: string, filters: Omit<PlayerSearch, 'query'> = {}) {
  const [results, setResults] = useState<SearchResults<PlayerSummary>>(NO_RESULTS);
  const [errors, setErrors] = useState<Partial<Record<SearchKind, string>>>({});
  const [loading, setLoading] = useState(false);
  const active = isSearchable(q);
  const key = JSON.stringify([q.trim(), filters]);
  useEffect(() => {
    let on = true;
    if (!active) {
      setResults(NO_RESULTS);
      setErrors({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      searchAll(q, filters).then(
        async (r) => {
          const lines = await getStatLinesForPlayers(r.players.map((p) => p.id)).catch(() => []);
          if (!on) return;
          const byPlayer = new Map<string, typeof lines>();
          for (const l of lines) {
            const arr = byPlayer.get(l.playerId) ?? [];
            arr.push(l);
            byPlayer.set(l.playerId, arr);
          }
          // Name match first; within a tier, the more active player first.
          const players = rankByName(
            r.players
              .map((player) => ({ player, stats: aggregate(byPlayer.get(player.id) ?? []) }))
              .sort((a, b) => b.stats.matches - a.stats.matches),
            q, (s) => s.player.fullName,
          );
          setResults({ players, teams: r.teams, matches: r.matches, tournaments: r.tournaments });
          setErrors(r.errors);
          setLoading(false);
        },
        (e: unknown) => {
          if (!on) return;
          setErrors({ players: e instanceof Error ? e.message : 'Search failed' });
          setLoading(false);
        },
      );
    }, 300);
    return () => {
      on = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { results, errors, loading, active };
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
export function useStandings(sport: SportId, tournamentId?: string): { teams: TeamStanding[]; leaders: StatLeader[]; matches: Match[]; phases: StandingsPhase[] } {
  const [data, setData] = useState<{ teams: TeamStanding[]; leaders: StatLeader[]; matches: Match[]; phases: StandingsPhase[] }>({ teams: [], leaders: [], matches: [], phases: [] });
  useFocusEffect(
    useCallback(() => {
      let on = true;
      Promise.all([getMatches(), getAllStatLines(), getPlayers(), getTournaments(), tournamentId ? getTournamentTeams(tournamentId, sport).catch(() => [] as Team[]) : Promise.resolve([] as Team[])]).then(([matches, lines, players, tours, entrants]) => {
        if (!on) return;
        const scopedMatches = tournamentId ? matches.filter((m) => m.tournamentId === tournamentId) : matches;
        // Leaders come from stat lines, so scope those by the same match set.
        const ids = new Set(scopedMatches.map((m) => m.id));
        const scopedLines = tournamentId ? lines.filter((l) => ids.has(l.matchId)) : lines;
        // Honour the tournament's points / tie-break overrides (else sport defaults).
        const tour = tournamentId ? tours.find((t) => t.id === tournamentId) : undefined;
        const cfg = standingsConfigFromFormat(sport, tour?.formats?.[sport]);
        setData({
          // `entrants` names a Swiss bye-only entrant with no fixture yet (SD-10).
          teams: teamStandings(scopedMatches, sport, cfg, undefined, entrants),
          leaders: statLeaders(scopedLines, players, sport),
          matches: scopedMatches,
          // Per-phase tables (league / groups / Super / Swiss), knockouts excluded (parity #07).
          phases: standingsPhases(scopedMatches, sport, cfg, entrants),
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
      Promise.all([getPlayer(playerId), getPlayerStatLines(playerId), getMatches(), getFieldEvents()]).then(([p, lines, matches, events]) => {
        if (!on) return;
        setPlayer(p);
        // Friendly = no tournament: a friendly match, or a casual golf round.
        const friendlyIds = new Set([
          ...matches.filter((m) => !m.tournamentId).map((m) => m.id),
          ...events.filter((e) => !e.tournamentId).map((e) => e.id),
        ]);
        const isFriendly = (l: { matchId: string; eventId?: string }) => friendlyIds.has(l.eventId ?? l.matchId);
        setScoped({
          all: aggregate(lines),
          official: aggregate(lines.filter((l) => !isFriendly(l))),
          friendly: aggregate(lines.filter(isFriendly)),
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

/** The teams registered as participants of a tournament (optionally one sport).
 *  `nonce` forces a refetch after add/remove. */
export function useTournamentTeams(tournamentId?: string, sport?: SportId, nonce = 0) {
  const [teams, setTeams] = useState<Team[]>([]);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      if (!tournamentId) { setTeams([]); return; }
      getTournamentTeams(tournamentId, sport).then((t) => on && setTeams(t));
      return () => { on = false; };
    }, [tournamentId, sport, nonce])
  );
  return teams;
}

/** Division scope for a tournament view: its categories, the entry roster (for
 *  team→division mapping), and the currently-selected division (defaults to the
 *  first). When a tournament has no categories, `activeCat` is null ⇒ callers
 *  show everything (single implicit division). Pair with groups.matchesInDivision. */
export function useDivisions(tournamentId?: string, nonce = 0) {
  const categories = useTournamentCategories(tournamentId, nonce);
  const entries = useTournamentEntries(tournamentId, undefined, nonce);
  const [activeCatId, setActiveCat] = useState<string | null>(null);
  const activeCat = categories.length ? (activeCatId ?? categories[0].id) : null;
  return { categories, entries, activeCat, setActiveCat };
}

/** The divisions (age × gender) a tournament defines. Empty ⇒ single implicit
 *  division (or pre-migration-0008). */
export function useTournamentCategories(tournamentId?: string, nonce = 0) {
  const [cats, setCats] = useState<TournamentCategory[]>([]);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      if (!tournamentId) { setCats([]); return; }
      getTournamentCategories(tournamentId).then((c) => on && setCats(c));
      return () => { on = false; };
    }, [tournamentId, nonce])
  );
  return cats;
}

/** Every team entry (confirmed / invited / pending) for a tournament — the
 *  organizer's lifecycle view and the captain's "am I in?" check. */
export function useTournamentEntries(tournamentId?: string, sport?: SportId, nonce = 0) {
  const [entries, setEntries] = useState<TournamentEntry[]>([]);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      if (!tournamentId) { setEntries([]); return; }
      getTournamentEntries(tournamentId, sport).then((e) => on && setEntries(e));
      return () => { on = false; };
    }, [tournamentId, sport, nonce])
  );
  return entries;
}
