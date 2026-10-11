/**
 * SD-154: when generated fixtures are played.
 *
 *  - "Minutes apart" (the original): match i starts `i × gap` after the first.
 *  - "Weekly across a term" (school leagues in the UK, AU, Gulf, US): one round
 *    on each match day — the chosen weekday(s) at a set time between the term
 *    dates, skipping listed holidays (half-term, exam weeks). Matches inside a
 *    round can be staggered by the gap (0 = all at the same time on different
 *    pitches / courts).
 *
 * Every day and time is WALL TIME IN THE TOURNAMENT'S ZONE (its venue zone,
 * else the app zone) — never the phone's clock. Pure (no RN imports).
 */
import { parseTypedDate, type DateOrder } from '../core/region.ts';
import { todayIn, wallTimeToIso } from '../core/time.ts';

const pad = (n: number) => String(n).padStart(2, '0');
const DAY_MS = 86_400_000;

/** 'YYYY-MM-DD' + n days (calendar arithmetic, no clock). */
export function addDaysKey(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, (m || 1) - 1, d || 1) + n * DAY_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
/** 0 = Sunday … 6 = Saturday — the weekday of a calendar day (same in every zone). */
export const weekdayOf = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
};
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Wed 9 Sep" */
export const dayText = (day: string): string => `${WEEKDAY_SHORT[weekdayOf(day)]} ${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;

/** A time typed as "15:30", "1530", "3:30 pm", "15.30" → 'HH:MM', or null. */
export function readTime(text: string): string | null {
  const t = (text ?? '').trim().toLowerCase().replace('.', ':');
  const m = /^(\d{1,2})(?::?(\d{2}))?\s*(am|pm|a|p)?$/.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const mi = Number(m[2] ?? 0);
  const ap = m[3]?.[0];
  if (ap) { if (h < 1 || h > 12) return null; h = (h % 12) + (ap === 'p' ? 12 : 0); }
  if (h > 23 || mi > 59) return null;
  return `${pad(h)}:${pad(mi)}`;
}

/**
 * The holidays / no-play dates an organiser typed: one per line or comma —
 * a day ("26/10/2026", "2026-10-26") or a range ("26/10/2026 - 30/10/2026",
 * "2026-10-26 to 2026-10-30"). Typed dates read in the region's order.
 */
export function parseSkipDates(text: string, order: DateOrder = 'DMY'): { days: string[]; bad: string[] } {
  const days = new Set<string>();
  const bad: string[] = [];
  for (const raw of (text ?? '').split(/[\n,;]+/)) {
    const part = raw.trim();
    if (!part) continue;
    const range = part.split(/\s+(?:-|–|—|to|until)\s+|\.\./i).map((x) => x.trim()).filter(Boolean);
    const a = parseTypedDate(range[0] ?? '', order);
    const b = range[1] ? parseTypedDate(range[1], order) : a;
    if (!a || !b || range.length > 2) { bad.push(part); continue; }
    const [from, to] = a <= b ? [a, b] : [b, a];
    for (let d = from, n = 0; d <= to && n < 366; d = addDaysKey(d, 1), n++) days.add(d);
  }
  return { days: [...days].sort(), bad };
}

export interface WeeklyPlan {
  /** match weekdays, 0 = Sunday … 6 = Saturday (one round on each) */
  weekdays: number[];
  /** 'HH:MM' wall time of the first match of a round */
  time: string;
  /** 'YYYY-MM-DD' — the first possible match day */
  termStart: string;
  /** 'YYYY-MM-DD' — the last possible match day (optional) */
  termEnd?: string;
  /** days with no matches (holidays, half-term) */
  skip?: string[];
  /** minutes between matches inside one round (0 = all at once) */
  gapMin?: number;
}

/** The next `count` match days of a plan (fewer when the term runs out). */
export function matchDays(plan: WeeklyPlan, count: number): string[] {
  const wd = new Set(plan.weekdays.filter((d) => d >= 0 && d <= 6));
  if (!wd.size || count <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(plan.termStart)) return [];
  const skip = new Set(plan.skip ?? []);
  const out: string[] = [];
  for (let d = plan.termStart, n = 0; out.length < count && n < 3 * 366; d = addDaysKey(d, 1), n++) {
    if (plan.termEnd && d > plan.termEnd) break;
    if (wd.has(weekdayOf(d)) && !skip.has(d)) out.push(d);
  }
  return out;
}

export interface WeeklyResult {
  /** each pairing's kickoff (ISO), in input order; undefined when the term ran out */
  times: (string | undefined)[];
  /** round number → its match day */
  roundDays: Map<number, string>;
  /** rounds that didn't fit in the term */
  overflow: number;
  /** how many listed holidays fell on a match weekday inside the term (skipped) */
  skipped: string[];
}

/**
 * Kickoff times for generated pairings, one round per match day. Pairings keep
 * their round number (groups play their round N on the same day); inside a
 * round, matches go in input order, `gapMin` apart.
 */
export function weeklyTimes(pairings: { round: number }[], plan: WeeklyPlan, zone: string): WeeklyResult {
  const rounds = [...new Set(pairings.map((p) => p.round))].sort((a, b) => a - b);
  const days = matchDays(plan, rounds.length);
  const roundDays = new Map<number, string>();
  rounds.forEach((r, i) => { if (days[i]) roundDays.set(r, days[i]); });
  const seen = new Map<number, number>();
  const gap = Math.max(0, plan.gapMin ?? 0);
  const times = pairings.map((p) => {
    const day = roundDays.get(p.round);
    const k = seen.get(p.round) ?? 0;
    seen.set(p.round, k + 1);
    if (!day) return undefined;
    const start = new Date(wallTimeToIso(day, plan.time, zone)).getTime();
    return new Date(start + k * gap * 60000).toISOString();
  });
  const wd = new Set(plan.weekdays);
  const last = days[days.length - 1];
  const skipped = (plan.skip ?? []).filter((d) => wd.has(weekdayOf(d)) && d >= plan.termStart && (!last || d <= last));
  return { times, roundDays, overflow: rounds.length - days.length, skipped };
}

/** "Minutes apart": match i at start + i × gap. */
export const minutesApartTimes = (count: number, startIso: string, gapMin: number): string[] =>
  Array.from({ length: count }, (_, i) => new Date(new Date(startIso).getTime() + i * Math.max(0, gapMin) * 60000).toISOString());

/** The default first kickoff: tomorrow at `time` (10:00) in the tournament's
 *  zone — never the phone clock (a Dubai event planned from India starts at
 *  10:00 Dubai time). Not before the tournament's start date. */
export function defaultKickoff(zone: string, opts: { startDate?: string; time?: string; now?: number | Date } = {}): string {
  let day = addDaysKey(todayIn(zone, opts.now ?? Date.now()), 1);
  if (opts.startDate && /^\d{4}-\d{2}-\d{2}/.test(opts.startDate) && opts.startDate.slice(0, 10) > day) day = opts.startDate.slice(0, 10);
  return wallTimeToIso(day, opts.time ?? '10:00', zone);
}
