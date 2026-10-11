/**
 * The reminder engine's data gathering and timing (perf audit F-08a–d). Pure —
 * the reads are passed in — so the batching and the tick schedule are
 * unit-tested (tests/reminder-batching.test.mts). Wired up in reminders.ts.
 *
 *  (a) one gather per tick, shared by the in-app check and the device schedule
 *      (they used to fetch everything twice a minute);
 *  (b) the first tick waits a few seconds after launch so Home's reads go first;
 *  (c) captains and matchday squads are read in one batched query each, not one
 *      request per team and per match;
 *  (d) only matches that start in the future are read — the reminder maths
 *      already skips everything that has started;
 *  (e) cadence (founder-approved Q3): once when the app opens, then every 5
 *      minutes, plus a check whenever the app comes back to the foreground.
 */
import type { Match, MatchSquads, Organization, Player, TeamLeadership, Tournament } from '../core/types';

export interface ReminderReads {
  /** matches starting after `now` (any status — the computations filter) */
  upcomingMatches(now: number): Promise<Match[]>;
  tournaments(): Promise<Tournament[]>;
  organizations(): Promise<Organization[]>;
  /** teamId → leadership, one entry per requested id */
  teamLeaders(teamIds: string[]): Promise<Record<string, TeamLeadership>>;
  /** matchId → squads, one entry per requested id */
  matchSquads(matchIds: string[]): Promise<Record<string, MatchSquads>>;
  players(): Promise<Player[]>;
  /** the viewer's followed player ids that still want "before they play" alerts */
  followedPlayerIds(): Set<string>;
}

export interface ReminderInputs {
  matches: Match[];
  tournaments: Tournament[];
  orgs: Organization[];
  leadersByTeam: Record<string, TeamLeadership>;
  squadsByMatch: Record<string, MatchSquads>;
  players: Player[];
  playerNameById: Record<string, string>;
  followedPlayerIds: Set<string>;
}

/** Fetch everything the reminder computations need, once, so the "due now" (feed)
 *  and "schedule ahead" (OS) passes share the same snapshot. */
export async function gatherReminderInputsWith(reads: ReminderReads, now: number): Promise<ReminderInputs> {
  const [fetched, tournaments, orgs] = await Promise.all([reads.upcomingMatches(now), reads.tournaments(), reads.organizations()]);
  // Same rule the computations apply: anything already started is out.
  const matches = fetched.filter((m) => new Date(m.startsAt).getTime() > now);
  // Only genuinely-scheduled future games get prep reminders — a postponed or
  // cancelled match shouldn't nag the host to line up a scorer.
  const upcoming = matches.filter((m) => m.status === 'scheduled');
  const teamIds = Array.from(new Set(upcoming.flatMap((m) => [m.homeTeam.id, m.awayTeam.id])));
  const matchIds = upcoming.map((m) => m.id);
  const [leadersByTeam, squadsByMatch, players] = await Promise.all([
    teamIds.length ? reads.teamLeaders(teamIds) : Promise.resolve({} as Record<string, TeamLeadership>),
    matchIds.length ? reads.matchSquads(matchIds) : Promise.resolve({} as Record<string, MatchSquads>),
    reads.players(),
  ]);
  const playerNameById = Object.fromEntries(players.map((p) => [p.id, p.fullName]));
  return { matches, tournaments, orgs, leadersByTeam, squadsByMatch, players, playerNameById, followedPlayerIds: reads.followedPlayerIds() };
}

export interface TickerTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(h: unknown): void;
}

const realTimers: TickerTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

/** Run `tick` once after `firstDelayMs`, then every `intervalMs` (counted from
 *  start). `kick()` runs it now — used when the app comes back to the foreground
 *  ("when you open the app") — unless a run started less than `minGapMs` ago or
 *  the first, delayed run hasn't happened yet. A tick never overlaps the
 *  previous one: if it is still running the next is skipped. */
export function startReminderTicker(
  tick: () => Promise<unknown>,
  opts: { firstDelayMs: number; intervalMs: number; minGapMs?: number; timers?: TickerTimers; now?: () => number },
): { stop: () => void; kick: () => void } {
  const t = opts.timers ?? realTimers;
  const now = opts.now ?? Date.now;
  let running = false;
  let stopped = false;
  let lastStart: number | null = null;
  const run = () => {
    if (stopped || running) return;
    running = true;
    lastStart = now();
    let p: Promise<unknown>;
    try { p = Promise.resolve(tick()); } catch (e) { p = Promise.reject(e); }
    p.catch(() => undefined).then(() => { running = false; });
  };
  const first = t.setTimeout(run, opts.firstDelayMs);
  const iv = t.setInterval(run, opts.intervalMs);
  return {
    stop: () => {
      stopped = true;
      t.clearTimeout(first);
      t.clearInterval(iv);
    },
    kick: () => {
      if (lastStart === null) return; // the delayed launch run covers opening the app
      if (now() - lastStart < (opts.minGapMs ?? 0)) return;
      run();
    },
  };
}
