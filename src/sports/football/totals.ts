/**
 * SD-30 (FB-06 / FB-13) — football's absolute `statTotals`: every per-player
 * figure the event log can give, keyed by player id. PURE.
 *
 *  - Box keys: exactly what the controls credit live, summed over the log —
 *    goals (+ the shot / shot on target a goal is, + its type: open play,
 *    penalty, free kick), assists, cards, sin-bins, and every player stat
 *    (shots, on target, blocks, saves, fouls, tackles, penalties won / missed…).
 *    Edits, removals and undos can't drift, and a second scorer or a retried
 *    upload can't double a line.
 *  - Derived keys (never credited live, owned only here): `headedGoals`
 *    (goals struck with the head) and `ownGoals` (FB-13: credited to the
 *    player who put it in his own net — never a goal; the goal is the other
 *    side's). The OG player isn't credited live because a live credit takes
 *    its opponent from the action's side, which is the other team's here.
 *  - Minutes and keeper clean sheets / goals conceded (SD-29 / SD-09,
 *    fieldTime.ts) are merged in.
 *
 * Ids: new logs carry `payload.pid` on goals, assists, cards and own goals
 * (engine: `playerId` / the goal's `secondId`); stat events always had theirs,
 * subs have `offId` / `onId` (SD-09). Older logs carry names only — they
 * resolve through the names the log itself pairs with ids (XI stamps, subs,
 * stat events) and the matchday squads (`ctx`), per side. If ANY credited
 * name can't be resolved, the keys it feeds are left out entirely and those
 * lines keep moving by live increments, as before — the sync zeroes owned keys
 * for players missing from the totals, so a partial guess would wipe real
 * stats (the SD-40 safeguard). Stat-event keys always resolve; goal / card
 * keys (and shots, which a goal feeds) are one group; own goals another.
 */
import type { StatTotalsContext, StatTotalsEntry } from '../types';
import { mergeTotals } from '../racketTotals.ts';
import type { FootballState } from './engine.ts';
import type { FootballEvent, GoalType, StatEvent, StatKind } from './events.ts';
import { footballTotals } from './fieldTime.ts';

type Side = 'home' | 'away';
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** The type tally a goal credits beside `goals` (a header is open play). */
export const GOAL_STAT: Record<GoalType, string> = { open: 'openPlayGoals', header: 'openPlayGoals', penalty: 'penaltyGoals', freekick: 'freekickGoals' };

/** The line key each player stat credits (corners credit nobody). */
export const STAT_KEY: Partial<Record<StatKind, string>> = {
  shot: 'shots', foul: 'fouls', offside: 'offsides', tackle: 'tackles', interception: 'interceptions', save: 'saves',
  pass: 'passes', cross: 'crosses', dribble: 'dribbles', handball: 'handballs', attackContribution: 'attackingContributions',
  defenceContribution: 'defensiveContributions', penaltyWon: 'penaltiesWon', penaltyMissed: 'penaltiesMissed', block: 'blocks',
};

/** Everything one stat event credits its player live (key + extra). */
export function statCredits(e: Pick<StatEvent, 'kind' | 'onTarget' | 'blocked' | 'complete'>): Record<string, number> {
  const key = STAT_KEY[e.kind];
  if (!key) return {};
  const c: Record<string, number> = { [key]: 1 };
  if (e.kind === 'shot' && e.onTarget && !e.blocked) c.shotsOnTarget = 1;
  if (e.kind === 'pass' && e.complete) c.passesComplete = 1;
  return c;
}

/** Everything a goal credits its scorer live. */
export const goalCredits = (e: Pick<FootballEvent, 'goalType'>): Record<string, number> =>
  ({ goals: 1, shots: 1, shotsOnTarget: 1, [GOAL_STAT[e.goalType ?? 'open']]: 1 });

/** Keys from stat events only (their ids are always on the event). */
export const FOOTBALL_STAT_KEYS = [
  'blocks', 'saves', 'fouls', 'offsides', 'tackles', 'interceptions', 'passes', 'passesComplete', 'crosses',
  'dribbles', 'handballs', 'attackingContributions', 'defensiveContributions', 'penaltiesWon', 'penaltiesMissed',
] as const;
/** Keys a goal / card / sin-bin feeds (resolved by id or name, as one group). */
export const FOOTBALL_EVENT_KEYS = [
  'goals', 'openPlayGoals', 'penaltyGoals', 'freekickGoals', 'headedGoals', 'assists', 'shots', 'shotsOnTarget',
  'yellowCards', 'redCards', 'sinBins',
] as const;
/** SD-80 (FB-14): shootout figures — kept apart from match goals / saves and
 *  only on the lines of a kick's taker / keeper (keyed coverage: a line without
 *  the key didn't take part). New logs only (`ShootoutKick` ids). */
export const SHOOTOUT_KEYS = ['penKicksTaken', 'penKicksScored', 'shootoutSaves'] as const;

/** Each shootout kick's taker (taken / scored) and the keeper facing it
 *  (`shootoutSaves`, 0 included). */
export function shootoutTotals(s: FootballState): Record<string, StatTotalsEntry> {
  const out: Record<string, StatTotalsEntry> = {};
  const line = (id: string, side: Side) => out[id] ?? (out[id] = { side, stats: {} });
  for (const k of s.shootout?.kicks ?? []) {
    if (k.takerId) {
      const l = line(k.takerId, k.side).stats;
      l.penKicksTaken = (l.penKicksTaken ?? 0) + 1;
      l.penKicksScored = (l.penKicksScored ?? 0) + (k.scored ? 1 : 0);
    }
    if (k.keeperId) {
      const l = line(k.keeperId, other(k.side)).stats;
      l.shootoutSaves = (l.shootoutSaves ?? 0) + (k.outcome === 'saved' ? 1 : 0);
    }
  }
  return out;
}

/** Owned here but never credited live. */
export const FOOTBALL_DERIVED_KEYS = ['headedGoals', 'ownGoals', 'minutes', 'cleanSheets', 'goalsConceded', ...SHOOTOUT_KEYS] as const;

/** name → id per side, from every id / name pair the state and ctx hold. A
 *  name seen with two different ids on one side is ambiguous (no id). */
function nameIndex(s: FootballState, ctx?: StatTotalsContext): Record<Side, Map<string, string | null>> {
  const idx: Record<Side, Map<string, string | null>> = { home: new Map(), away: new Map() };
  const note = (side: Side, id?: string, name?: string) => {
    if (!id || !name) return;
    const m = idx[side];
    const cur = m.get(name);
    if (cur === undefined) m.set(name, id);
    else if (cur !== id) m.set(name, null);
  };
  for (const side of ['home', 'away'] as const) {
    const st = s.xi?.[side];
    for (const p of [...(st?.players ?? []), ...(st?.keepers ?? []), ...(st?.gk ? [st.gk] : [])]) note(side, p.id, p.name);
    for (const p of ctx?.players?.[side] ?? []) note(side, p.id, p.name);
  }
  for (const e of s.events ?? []) {
    if (e.official) continue; // SD-117: a team official is on no stat line
    const side = e.type === 'owngoal' ? other(e.side) : e.side;
    note(side, e.playerId, e.playerName);
    note(e.side, e.secondId, e.secondName);
  }
  for (const e of s.stats ?? []) note(e.side, e.playerId, e.playerName);
  return idx;
}

/** The box keys + own goals (+ SD-80 shootout keys) per player id. */
export function footballBoxTotals(s: FootballState, ctx?: StatTotalsContext): Record<string, StatTotalsEntry> {
  const idx = nameIndex(s, ctx);
  const resolve = (side: Side, id?: string, name?: string): string | undefined => id || (name ? idx[side].get(name) ?? undefined : undefined);
  type Lines = Record<string, StatTotalsEntry>;
  const add = (out: Lines, id: string, side: Side, c: Record<string, number>) => {
    const line = out[id] ?? (out[id] = { side, stats: {} });
    for (const [k, v] of Object.entries(c)) line.stats[k] = (line.stats[k] ?? 0) + v;
  };
  const statLines: Lines = {}; // always resolvable
  const eventLines: Lines = {}; // goals / cards / shots
  const ogLines: Lines = {};
  let eventsOk = true;
  let ogOk = true;

  for (const e of s.stats ?? []) {
    if (!e.playerId) continue; // no player → credited nobody live
    const c = statCredits(e);
    const { shots, shotsOnTarget, ...rest } = c;
    if (Object.keys(rest).length) add(statLines, e.playerId, e.side, rest);
    if (shots) add(eventLines, e.playerId, e.side, { shots, ...(shotsOnTarget ? { shotsOnTarget } : {}) });
  }
  for (const e of s.events ?? []) {
    if (e.official) continue; // SD-117 (F13): a team official's card credits nobody
    if (e.type === 'owngoal') {
      if (!e.playerId && !e.playerName) continue;
      const id = resolve(other(e.side), e.playerId, e.playerName);
      if (!id) { ogOk = false; continue; }
      add(ogLines, id, other(e.side), { ownGoals: 1 });
      continue;
    }
    let c: Record<string, number> | null = null;
    if (e.type === 'goal') c = { ...goalCredits(e), ...(e.goalType === 'header' || e.bodyPart === 'head' ? { headedGoals: 1 } : {}) };
    else if (e.type === 'yellow') c = { yellowCards: 1 };
    else if (e.type === 'red') c = { redCards: 1 };
    else if (e.type === 'sinbin') c = { sinBins: 1 };
    if (!c) continue;
    if (e.playerId || e.playerName) {
      const id = resolve(e.side, e.playerId, e.playerName);
      if (id) add(eventLines, id, e.side, c);
      else eventsOk = false;
    }
    if (e.type === 'goal' && (e.secondId || e.secondName)) {
      const aid = resolve(e.side, e.secondId, e.secondName);
      if (aid) add(eventLines, aid, e.side, { assists: 1 });
      else eventsOk = false;
    }
  }

  // Zero-fill every owned key on the lines of players credited live, so the
  // sync sets each one (a key nobody has would otherwise not be owned). An
  // OG-only player gets just `ownGoals` (no false zeros on a new line).
  const keys = [...FOOTBALL_STAT_KEYS, ...(eventsOk ? FOOTBALL_EVENT_KEYS : []), ...(ogOk && Object.keys(ogLines).length ? ['ownGoals'] : [])];
  const out: Lines = {};
  const credited = [statLines, ...(eventsOk ? [eventLines] : [])];
  for (const lines of credited) {
    for (const [id, l] of Object.entries(lines)) {
      const line = out[id] ?? (out[id] = { side: l.side, stats: Object.fromEntries(keys.map((k) => [k, 0])) });
      for (const [k, v] of Object.entries(l.stats)) line.stats[k] = (line.stats[k] ?? 0) + v;
    }
  }
  if (ogOk) {
    for (const [id, l] of Object.entries(ogLines)) {
      const line = out[id] ?? (out[id] = { side: l.side, stats: {} });
      line.stats.ownGoals = (line.stats.ownGoals ?? 0) + (l.stats.ownGoals ?? 0);
    }
  }
  // SD-80: shootout takers / keepers (ids always on the kick)
  for (const [id, l] of Object.entries(shootoutTotals(s))) {
    const line = out[id] ?? (out[id] = { side: l.side, stats: {} });
    Object.assign(line.stats, l.stats);
  }
  return out;
}

/** The plugin's `statTotals`: box keys + own goals, then SD-29 minutes and
 *  SD-09 keeper clean sheets / goals conceded. */
export const footballStatTotals = (s: FootballState, ctx?: StatTotalsContext): Record<string, StatTotalsEntry> =>
  mergeTotals(footballBoxTotals(s, ctx), footballTotals(s));
