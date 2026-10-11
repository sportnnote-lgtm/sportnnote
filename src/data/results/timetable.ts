/**
 * SD-129 — the meet timetable: days, sessions (morning / afternoon / evening)
 * and every round (heat, semi, final, flight, combined-event discipline) with a
 * scheduled time and a venue area (track, jumps pit, pool …).
 *
 * Storage: a round's time is `field_events.starts_at`; the plan of times for
 * every round of the event rides in `format.results.sched.rounds` (copied to
 * each later phase, which takes its own slot when it is created). A phase
 * without its own entry was created before SD-129 — its starts_at is just the
 * creation time, so it shows under "Not on the timetable yet".
 *
 * Pure: the I/O is in data/timetableStore.ts. Times are stored as ISO
 * instants. SD-154: days, clock times and sessions are read IN THE MEET'S
 * ZONE (`setMeetZone(eventZone(tournament))`, the tournament's venue zone, else
 * the app zone) so a remote organiser, a parent abroad and the printed sheets
 * all show the venue's clock. With no zone set: the device clock (as before).
 */
import { isoToWall, wallTimeToIso } from '../../core/time.ts';
import { disciplineOf, categoryLabel, type DisciplineDef, type MeetSession, type PhaseFormat, type PhaseKind, type SchedRound } from './model.ts';
import type { MeetEvent } from './athletics.ts';
import { phaseNameOf } from './archery.ts';

export type { MeetSession, SchedRound };

export interface TimetableItem {
  /** `${eventKey}#${phaseNo}` */
  key: string;
  eventKey: string;
  phaseNo: number;
  /** the phase row, when it exists (a planned final has none yet) */
  phaseId?: string;
  /** the event's latest existing phase — a planned round's slot is stored on it */
  lastPhaseId: string;
  sport: string;
  discipline: string;
  /** "100 m U14 Boys" */
  eventTitle: string;
  /** "Heats" / "Final" / "Long jump" (a combined event's discipline) */
  roundLabel: string;
  phase: PhaseKind;
  heats: number;
  status: 'scheduled' | 'live' | 'completed' | 'planned';
  /** scheduled start (ISO); for an unscheduled phase, its creation time */
  at: string;
  /** an organiser-set time (false = made before the timetable existed) */
  set: boolean;
  session: MeetSession;
  area?: string;
  /** estimated length (minutes) — "now", clash checks */
  minutes: number;
  /** athletes in this round (relay legs included); empty for a planned round */
  athletes: { id: string; name: string }[];
  entries: number;
}

export const SESSION_LABEL: Record<MeetSession, string> = { AM: 'Morning', PM: 'Afternoon', EVE: 'Evening' };
export const SESSIONS: MeetSession[] = ['AM', 'PM', 'EVE'];

/* SD-154: the zone the meet's clock is read in (undefined = the device clock). */
let MEET_ZONE: string | undefined;
/** Read days / times / sessions in this zone from now on (the tournament's
 *  `eventZone`). Screens set it when they open a meet; undefined = device. */
export function setMeetZone(z?: string | null): void { MEET_ZONE = z || undefined; }
export const meetZone = (): string | undefined => MEET_ZONE;

const wallOf = (at: string | Date, z: string | undefined): { date: string; time: string } | null => {
  if (!z) return null;
  try { return isoToWall(at instanceof Date ? at.getTime() : at, z); } catch { return null; }
};

/** The clock's session: before 12:00 morning, before 17:00 afternoon, else evening. */
export const sessionOf = (at: string | Date, z: string | undefined = MEET_ZONE): MeetSession => {
  const w = wallOf(at, z);
  const h = w ? Number(w.time.slice(0, 2)) : new Date(at).getHours();
  return h < 12 ? 'AM' : h < 17 ? 'PM' : 'EVE';
};

const pad = (n: number) => String(n).padStart(2, '0');
/** Date key 'YYYY-MM-DD' — in the meet's zone (else the device's). */
export const dayKey = (at: string | Date, z: string | undefined = MEET_ZONE): string => {
  const w = wallOf(at, z);
  if (w) return w.date;
  const d = new Date(at); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** '09:05' (24-hour) — in the meet's zone (else the device's). */
export const hhmm = (at: string | Date, z: string | undefined = MEET_ZONE): string => {
  const w = wallOf(at, z);
  if (w) return w.time;
  const d = new Date(at); return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** The day after a day key ('2026-11-12' → '2026-11-13'), calendar arithmetic only. */
export const nextDayKey = (key: string): string => {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};
/** 'Thu 12 Nov' */
export const dayLabel = (key: string): string => {
  const d = fromDayKey(key);
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}`;
};
export const fromDayKey = (key: string): Date => { const [y, m, d] = key.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
/** A day key + 'HH:MM' → ISO; null when the time can't be read. Accepts "9", "930", "9:30", "09.30". */
export function atOf(day: string, time: string, z: string | undefined = MEET_ZONE): string | null {
  const t = time.trim().replace('.', ':');
  let h: number, m: number;
  const c = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (c) { h = Number(c[1]); m = Number(c[2]); } else if (/^\d{1,4}$/.test(t)) {
    const v = Number(t);
    if (t.length <= 2) { h = v; m = 0; } else { h = Math.floor(v / 100); m = v % 100; }
  } else return null;
  if (h > 23 || m > 59) return null;
  if (z) { try { return wallTimeToIso(day, `${pad(h)}:${pad(m)}`, z); } catch { /* device clock below */ } }
  const d = fromDayKey(day);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}
export const addMinutes = (at: string, mins: number): string => new Date(new Date(at).getTime() + mins * 60000).toISOString();
const minsBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);

/** The usual venue area for a discipline. */
export function defaultArea(def?: Pick<DisciplineDef, 'key' | 'sport' | 'capture' | 'unit'> | null): string {
  if (!def) return '';
  const k = def.key;
  switch (def.sport) {
    case 'swimming': return 'Pool';
    case 'weightlifting': return 'Platform';
    case 'shooting': return 'Range';
    case 'archery': return 'Archery field';
    case 'rowing': case 'canoe': return 'Course';
    case 'cycling': return /road|itt|stage|crit/.test(k) ? 'Road course' : 'Velodrome';
  }
  if (/ath\.(lj|tj)/.test(k)) return 'Jumps pit';
  if (k === 'ath.hj') return 'High jump';
  if (k === 'ath.pv') return 'Pole vault';
  if (/ath\.(sp|dt|jt|ht|ball|cricket)/.test(k) || (def.capture === 'attempts' && def.unit === 'distance')) return 'Throws area';
  if (/xc|road|walk|marathon|10k|5k|half/.test(k)) return 'Road / course';
  return 'Track';
}

/** Estimated minutes a round takes (for "now", the next free slot and clash checks). */
export function estMinutes(def: Pick<DisciplineDef, 'capture' | 'sport' | 'teamSize' | 'key'> | null | undefined, heats: number, combined = false): number {
  const h = Math.max(1, heats);
  if (!def) return 30;
  if (combined) return def.capture === 'single' ? Math.max(15, 6 * h) : def.capture === 'heights' ? 90 : 60;
  switch (def.capture) {
    case 'heights': return 90;
    case 'attempts': return 50 * h;
    case 'lifts': return 60 * h;
    default: break;
  }
  if (def.sport === 'shooting') return 75 * h;
  if (def.sport === 'archery') return 120;
  if (def.sport === 'rowing' || def.sport === 'canoe') return 8 * h;
  if (def.sport === 'cycling') return 20 * h;
  if (def.capture === 'order') return 45;
  const long = /(800|1500|3000|5000|10000|steeple|1500free|800free|400im)/.test(def.key);
  const per = def.teamSize ? 6 : def.sport === 'swimming' ? (long ? 12 : 4) : long ? 10 : 5;
  return Math.max(10, per * h);
}

function roundLabelOf(f: PhaseFormat, phaseNo: number): string {
  if (f.combined) return `${phaseNo}. ${disciplineOf(f.combined.events[phaseNo - 1])?.label ?? 'Event'}`;
  const p = f.plan?.[phaseNo - 1];
  return phaseNameOf({ ...f, phase: p?.phase ?? f.phase, phaseNo, races: p?.races ?? (phaseNo === f.phaseNo ? f.races : undefined) });
}

/** Every round of the meet on one list: the phases that exist, plus the
 *  planned later rounds that already have a slot. Sorted by time. */
export function buildTimetable(events: MeetEvent[]): TimetableItem[] {
  const out: TimetableItem[] = [];
  for (const e of events) {
    if (!e.phases.length) continue;
    const last = e.phases[e.phases.length - 1];
    for (const p of e.phases) {
      const f = p.format;
      const own = f.sched?.rounds?.find((r) => r.phaseNo === f.phaseNo);
      const def = disciplineOf(f.discipline);
      const athletes = new Map<string, string>();
      for (const en of p.entries) {
        if (en.athleteId) athletes.set(en.athleteId, en.name);
        for (const m of en.result.members ?? []) if (m.playerId) athletes.set(m.playerId, m.name);
      }
      out.push({
        key: `${e.eventKey}#${f.phaseNo}`, eventKey: e.eventKey, phaseNo: f.phaseNo, phaseId: p.id, lastPhaseId: last.id,
        sport: def?.sport ?? 'athletics', discipline: f.discipline, eventTitle: e.title, roundLabel: roundLabelOf(f, f.phaseNo), phase: f.phase, heats: f.heats,
        status: p.status, at: own?.at ?? p.date, set: !!own, session: own?.session ?? sessionOf(own?.at ?? p.date), area: own?.area,
        minutes: estMinutes(def, f.heats, !!f.combined), athletes: [...athletes].map(([id, name]) => ({ id, name })), entries: p.entries.length,
      });
    }
    // planned rounds (no phase yet) — from the latest phase's plan of times
    const lf = last.format;
    const total = lf.combined ? lf.combined.events.length : lf.plan?.length ?? lf.phaseNo;
    for (const r of lf.sched?.rounds ?? []) {
      if (r.phaseNo <= lf.phaseNo || r.phaseNo > total) continue;
      const plan = lf.plan?.[r.phaseNo - 1];
      const disc = lf.combined ? lf.combined.events[r.phaseNo - 1] : lf.discipline;
      const def = disciplineOf(disc);
      out.push({
        key: `${e.eventKey}#${r.phaseNo}`, eventKey: e.eventKey, phaseNo: r.phaseNo, lastPhaseId: last.id,
        sport: def?.sport ?? 'athletics', discipline: disc, eventTitle: e.title, roundLabel: roundLabelOf(lf, r.phaseNo), phase: plan?.phase ?? 'final', heats: plan?.heats ?? 1,
        status: 'planned', at: r.at, set: true, session: r.session ?? sessionOf(r.at), area: r.area,
        minutes: estMinutes(def, plan?.heats ?? 1, !!lf.combined), athletes: [], entries: 0,
      });
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at) || a.eventTitle.localeCompare(b.eventTitle) || a.phaseNo - b.phaseNo);
}

export const endOf = (it: Pick<TimetableItem, 'at' | 'minutes'>): string => addMinutes(it.at, it.minutes);

export interface TimetableDay { day: string; label: string; index: number; sessions: { session: MeetSession; items: TimetableItem[] }[] }

/** The meet's days (the tournament's dates, plus any day with a round on it)
 *  with each day's sessions; unscheduled phases are left out (see `unscheduled`). */
export function timetableDays(items: TimetableItem[], range?: { start?: string; end?: string }): TimetableDay[] {
  const keys = new Set(items.filter((i) => i.set).map((i) => dayKey(i.at)));
  if (range?.start) {
    // tournament dates are calendar days already — step them as days (no clock)
    const s = range.start.slice(0, 10);
    const e = range.end ? range.end.slice(0, 10) : s;
    for (let d = s, n = 0; d <= e && n < 14; d = nextDayKey(d), n++) keys.add(d);
  }
  return [...keys].sort().map((day, index) => ({
    day, index, label: `Day ${index + 1} · ${dayLabel(day)}`,
    sessions: SESSIONS.map((session) => ({ session, items: items.filter((i) => i.set && dayKey(i.at) === day && i.session === session) })).filter((s) => s.items.length),
  }));
}

export const unscheduled = (items: TimetableItem[]): TimetableItem[] => items.filter((i) => !i.set);

/** What is on now (live, or inside its slot) and what's next. */
export function nowNext(items: TimetableItem[], now: Date = new Date()): { now: TimetableItem[]; next: TimetableItem | null } {
  const t = now.toISOString();
  const on = items.filter((i) => i.status === 'live' || (i.set && i.status === 'scheduled' && i.at <= t && endOf(i) > t));
  const next = items.find((i) => i.set && (i.status === 'scheduled' || i.status === 'planned') && i.at > t && !on.includes(i)) ?? null;
  return { now: on, next };
}

export interface SlotChange { key: string; phaseId?: string; lastPhaseId: string; eventKey: string; phaseNo: number; at: string; area?: string; session?: MeetSession }

/** "Running late +N min": every round in the same day and session from `from`
 *  on that hasn't started (scheduled / planned) moves by `minutes`. */
export function shiftSession(items: TimetableItem[], from: TimetableItem, minutes: number): SlotChange[] {
  const day = dayKey(from.at);
  return items
    .filter((i) => i.set && (i.status === 'scheduled' || i.status === 'planned') && dayKey(i.at) === day && i.session === from.session && i.at >= from.at)
    .map((i) => ({ key: i.key, phaseId: i.phaseId, lastPhaseId: i.lastPhaseId, eventKey: i.eventKey, phaseNo: i.phaseNo, at: addMinutes(i.at, minutes), area: i.area, session: i.session }));
}

export interface Clash { athleteId: string; name: string; a: TimetableItem; b: TimetableItem; /** minutes from the end of `a` to the start of `b` (negative = overlap) */ gap: number }

/** Athletes in two rounds of different events less than `minGap` minutes apart
 *  (end of one to the start of the next) on the same day. Finished rounds and
 *  rounds without a time are not checked. */
export function findClashes(items: TimetableItem[], minGap: number): Clash[] {
  const by = new Map<string, { name: string; list: TimetableItem[] }>();
  for (const i of items) {
    if (!i.set || i.status === 'completed') continue;
    for (const a of i.athletes) {
      const cur = by.get(a.id) ?? { name: a.name, list: [] };
      cur.list.push(i);
      by.set(a.id, cur);
    }
  }
  const out: Clash[] = [];
  for (const [id, { name, list }] of by) {
    const s = [...list].sort((x, y) => x.at.localeCompare(y.at));
    for (let i = 0; i < s.length; i++) {
      for (let j = i + 1; j < s.length; j++) {
        const a = s[i], b = s[j];
        if (a.eventKey === b.eventKey || dayKey(a.at) !== dayKey(b.at)) continue;
        const gap = minsBetween(endOf(a), b.at);
        if (gap < minGap) out.push({ athleteId: id, name, a, b, gap });
      }
    }
  }
  return out.sort((x, y) => x.a.at.localeCompare(y.a.at) || x.name.localeCompare(y.name));
}

/** Before an event is created: which of these athletes are in another round
 *  within `minGap` minutes of the slot [at, at + minutes]. */
export function clashesFor(athletes: { id: string; name: string }[], at: string, minutes: number, items: TimetableItem[], minGap: number, exceptEventKey?: string): { athleteId: string; name: string; other: TimetableItem; gap: number }[] {
  const ids = new Map(athletes.map((a) => [a.id, a.name]));
  const end = addMinutes(at, minutes);
  const out: { athleteId: string; name: string; other: TimetableItem; gap: number }[] = [];
  for (const i of items) {
    if (!i.set || i.status === 'completed' || i.eventKey === exceptEventKey || dayKey(i.at) !== dayKey(at)) continue;
    for (const a of i.athletes) {
      if (!ids.has(a.id)) continue;
      const gap = i.at >= at ? minsBetween(end, i.at) : minsBetween(endOf(i), at);
      if (gap < minGap) out.push({ athleteId: a.id, name: ids.get(a.id)!, other: i, gap });
    }
  }
  return out;
}

/** The first free slot in `area` on `day` that fits `minutes`: from 09:00,
 *  the first gap between the rounds already there (5 min after one ends,
 *  rounded up to 5 min), else after the last one. */
export function nextFreeSlot(items: TimetableItem[], day: string, area: string | undefined, minutes = 15, startHour = 9): string {
  const same = items.filter((i) => i.set && dayKey(i.at) === day && (i.area ?? '') === (area ?? '')).sort((a, b) => a.at.localeCompare(b.at));
  const step = 5 * 60000;
  const up = (t: number) => Math.ceil(t / step) * step;
  let t = new Date(atOf(day, `${pad(startHour)}:00`)!).getTime();
  for (const i of same) {
    const s = new Date(i.at).getTime();
    if (up(t) + minutes * 60000 <= s) break;
    t = Math.max(t, new Date(endOf(i)).getTime() + 5 * 60000);
  }
  return new Date(up(t)).toISOString();
}

/** Default slots for every round of a new event, from the first round's time:
 *  a final (or semi / repechage) after a morning round goes the same
 *  afternoon at 15:00 (or 2 h later, whichever is later); after an afternoon
 *  round, next day at the same time. A stage race: one stage a day. A combined
 *  event: one discipline an hour (90 min after a vertical jump), day 2 from
 *  `day2` at 09:00. */
export function suggestRounds(first: string, plan: { phase: PhaseKind; heats: number }[], opts: { combined?: { events: string[]; day2?: number }; stage?: boolean; minutes?: number[] } = {}): string[] {
  const out = [first];
  const n = opts.combined ? opts.combined.events.length : plan.length;
  for (let i = 1; i < n; i++) {
    const prev = out[i - 1];
    if (opts.combined) {
      if (opts.combined.day2 != null && i === opts.combined.day2) {
        out.push(atOf(nextDayKey(dayKey(prev)), '09:00')!);
        continue;
      }
      const prevDef = disciplineOf(opts.combined.events[i - 1]);
      out.push(addMinutes(prev, prevDef?.capture === 'heights' ? 120 : prevDef?.capture === 'attempts' ? 90 : 60));
      continue;
    }
    if (opts.stage) { out.push(addMinutes(prev, 24 * 60)); continue; }
    const p = new Date(prev);
    const busy = opts.minutes?.[i - 1] ?? 60;
    if (Number(hhmm(prev).slice(0, 2)) < 13) {
      const aft = new Date(atOf(dayKey(prev), '15:00')!);
      const t = Math.max(aft.getTime(), p.getTime() + Math.max(120, busy + 60) * 60000);
      const step = 5 * 60000;
      out.push(new Date(Math.ceil(t / step) * step).toISOString());
    } else {
      out.push(addMinutes(prev, 24 * 60));
    }
  }
  return out;
}

/** The round names of a new event's plan ("Heats", "Final" / "1. 100 m" for a combined event). */
export function planLabels(discipline: string, plan?: { phase: PhaseKind }[] | null, combinedEvents?: string[]): string[] {
  if (combinedEvents?.length) return combinedEvents.map((d, i) => `${i + 1}. ${disciplineOf(d)?.label ?? 'Event'}`);
  const p = plan?.length ? plan : [{ phase: 'final' as PhaseKind }];
  return p.map((x, i) => phaseNameOf({ discipline, phase: x.phase, plan: p, phaseNo: i + 1 }));
}

/** A one-line text for a timetable item (share / print). */
export const itemLine = (i: TimetableItem): string => `${i.set ? hhmm(i.at) : '--:--'}  ${i.eventTitle} — ${i.roundLabel}${i.area ? ` · ${i.area}` : ''}`;

/** The timetable as WhatsApp text (one day). */
export function timetableText(meetName: string, day: TimetableDay): string {
  const lines = [`🗓 ${meetName} — ${day.label}`];
  for (const s of day.sessions) {
    lines.push('', `*${SESSION_LABEL[s.session]}*`);
    for (const i of s.items) lines.push(itemLine(i));
  }
  return lines.join('\n');
}

/** Phase-format patch for a new slot of round `phaseNo` (merged into sched.rounds). */
export function withRound(f: Pick<PhaseFormat, 'sched'>, r: SchedRound): { sched: { rounds: SchedRound[] } } {
  const rounds = (f.sched?.rounds ?? []).filter((x) => x.phaseNo !== r.phaseNo);
  return { sched: { rounds: [...rounds, r].sort((a, b) => a.phaseNo - b.phaseNo) } };
}

/** What a new phase (round `roundNo`) takes from the plan of times: its
 *  scheduled start, if the plan has one. Used when a phase is inserted. */
export const plannedSlot = (f: Pick<PhaseFormat, 'sched'> | null | undefined, roundNo: number): SchedRound | undefined => f?.sched?.rounds?.find((r) => r.phaseNo === roundNo);

/** A short category line for print headers. */
export const eventCategory = (e: Pick<MeetEvent, 'category'>): string => categoryLabel(e.category);
