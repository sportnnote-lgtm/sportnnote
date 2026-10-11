/**
 * SD-128 — meet entries (pure). What a school / inter-school meet's entries
 * desk does after the start lists exist, and before them:
 *
 *  - late entry: may this phase take one, and where does it go (the right
 *    heat / flight, a free lane, or a new heat);
 *  - scratch: a DNS-style withdrawal with a reason — the lane stays empty and
 *    a DNS never goes on to a later round (qualify / continuing / stage
 *    finishers all skip it);
 *  - delete an event: does it have results (then the organiser must say
 *    "delete results too");
 *  - the meet entries matrix (athletes × events per age group / gender) with
 *    per-athlete caps ("max 3 individual events + 1 relay"), stored as one
 *    JSON document on the tournament (formats[sport].meetEntries);
 *  - bulk add: paste "name, house, gender, DOB or age group, bib[, events]"
 *    rows, duplicate detection by name + date of birth.
 *
 * Every field is optional: events made before SD-128 have no `scratch` /
 * `late` and no entries document, and read exactly as before.
 */
import type { Category, DisciplineDef, EntryResult, PhaseFormat, ResultEntry } from './model.ts';
import { categoryKey, disciplineOf, laneNumbers } from './model.ts';
import { laneOrder } from './progression.ts';
import { AGE_GROUPS, ageLimit, eligibleFor, trackEventsFor } from './athletics.ts';
import { hasAnyResult } from './safety.ts';
import { fieldEventsFor } from './field.ts';
import { swimEventsFor } from './swimming.ts';

/* ------------------------------- late entry ------------------------------- */

export type Verdict = { ok: true } | { ok: false; reason: string };

/** May this phase take a late entry? Only an open first round (a combined
 *  event's first event); never a drawn bracket or a shooting final. */
export function lateAddVerdict(f: Pick<PhaseFormat, 'phaseNo' | 'combined'>, status: string, rows: Pick<ResultEntry, 'result'>[]): Verdict {
  if (status === 'completed') return { ok: false, reason: 'This round is closed — an organiser can reopen it first.' };
  if (f.combined && f.combined.index > 0) return { ok: false, reason: 'Late entries to a combined event go into its first event.' };
  if (!f.combined && f.phaseNo > 1) return { ok: false, reason: 'Late entries go into the first round — later rounds are seeded from its results.' };
  if (rows.some((r) => r.result?.mp != null)) return { ok: false, reason: 'Match play is already drawn.' };
  if (rows.some((r) => Array.isArray(r.result?.fshots))) return { ok: false, reason: 'The final is already drawn.' };
  return { ok: true };
}

export interface LatePlace { heat: number; lane?: number; order: number; newHeat: boolean }

/** Lane numbers in the order a late (unseeded) entrant takes them — the
 *  worst seeded lanes first (the outside), as the venue numbers them. */
export function lateLanePreference(lanes: number, discipline?: string): number[] {
  const nums = laneNumbers(lanes);
  const set = new Set(nums);
  // laneOrder numbers 1…n; a 10-lane pool numbers 0…9 (SW 3.1.2)
  const shift = lanes === 10 ? -1 : 0;
  const pref = laneOrder(lanes, undefined, discipline).map((l) => l + shift).filter((l) => set.has(l));
  return [...pref.reverse(), ...nums.filter((n) => !pref.includes(n))];
}

/**
 * Where a late entry goes. With lanes: the heat with the fewest entrants that
 * still has a free lane (the outside lane first), else a new heat. Without
 * lanes (field events, distance races, road, lifting, shooting, archery): the
 * flight with the fewest entrants, last in its order. `heat` forces a heat
 * ('new' = a new one).
 */
export function placeLateEntry(rows: { heat: number; lane?: number; order?: number }[], def: Pick<DisciplineDef, 'lanes' | 'capture' | 'key' | 'tie'>, opts: { heats?: number; heat?: number | 'new' } = {}): LatePlace {
  const used = [...new Set(rows.map((r) => r.heat))];
  const heats = Math.max(1, opts.heats ?? 1, ...used);
  const all = Array.from({ length: heats }, (_, i) => i + 1);
  const count = (h: number) => rows.filter((r) => r.heat === h).length;
  const orderIn = (h: number) => Math.max(0, ...rows.filter((r) => def.tie === 'road' || r.heat === h).map((r) => r.order ?? 0)) + 1;
  const lanes = def.lanes && def.capture === 'single' ? def.lanes : 0;
  if (!lanes) {
    const h = opts.heat === 'new' ? heats + 1 : opts.heat ?? [...all].sort((a, b) => count(a) - count(b) || a - b)[0];
    return { heat: h, order: opts.heat === 'new' ? 1 : orderIn(h), newHeat: h > heats };
  }
  const pref = lateLanePreference(lanes, def.key);
  const free = (h: number) => pref.filter((l) => !rows.some((r) => r.heat === h && r.lane === l));
  const fresh = (): LatePlace => ({ heat: heats + 1, lane: laneOrder(lanes, undefined, def.key).map((l) => (lanes === 10 ? l - 1 : l))[0], order: 1, newHeat: true });
  if (opts.heat === 'new') return fresh();
  if (typeof opts.heat === 'number') {
    const f = free(opts.heat);
    return f.length ? { heat: opts.heat, lane: f[0], order: orderIn(opts.heat), newHeat: opts.heat > heats } : fresh();
  }
  const open = all.filter((h) => free(h).length).sort((a, b) => count(a) - count(b) || a - b);
  if (!open.length) return fresh();
  return { heat: open[0], lane: free(open[0])[0], order: orderIn(open[0]), newHeat: false };
}

/** Free lanes per heat (for the heat picker). */
export function freeLanes(rows: { heat: number; lane?: number }[], lanes: number, heat: number): number[] {
  return laneNumbers(lanes).filter((l) => !rows.some((r) => r.heat === heat && r.lane === l));
}

/* --------------------------------- scratch -------------------------------- */

export const SCRATCH_REASONS = ['Injured', 'Absent', 'Unwell', 'Event clash', 'Withdrawn by school', 'Wrong entry'] as const;

const resultOnly = (r: EntryResult): EntryResult => ({ ...r, status: undefined, scratch: undefined, ruleRef: undefined, reason: undefined });

/** May this entrant be scratched? Before the round is closed and before they
 *  have a result (after that it's DNF / WD / DQ on the entry). */
export function scratchVerdict(status: string, r: EntryResult | undefined, rows: Pick<ResultEntry, 'result'>[] = []): Verdict {
  if (status === 'completed') return { ok: false, reason: 'This round is closed — an organiser can reopen it first.' };
  if (rows.some((x) => x.result?.mp != null)) return { ok: false, reason: 'In match play, enter the match as a walkover instead.' };
  if (r?.scratch) return { ok: false, reason: 'Already scratched.' };
  if (r && hasAnyResult([resultOnly(r)])) return { ok: false, reason: 'They already have a result — mark DNF / WD / DQ on their entry instead.' };
  return { ok: true };
}

/** The scratched row: DNS with the reason; lane / heat kept (the lane stays empty). */
export function scratchResult(r: EntryResult, reason: string, at: string = new Date().toISOString()): EntryResult {
  return { ...r, status: 'DNS', scratch: { reason: reason.trim() || 'Scratched', at } };
}

/** Undo a scratch (back on the start list). */
export function reinstateResult(r: EntryResult): EntryResult {
  const { scratch: _s, ...rest } = r;
  return { ...rest, status: r.status === 'DNS' ? undefined : r.status };
}

export const isScratched = (r?: EntryResult | null): boolean => !!r?.scratch;

/* ------------------------------ delete event ------------------------------ */

export interface DeleteCheck {
  /** any mark / attempt / status other than a scratch, or a locked round */
  hasResults: boolean;
  /** a finished final (medals, points, maybe records) */
  finished: boolean;
  phases: number;
  entries: number;
}

/** What deleting a whole event would remove. */
export function deleteCheck(phases: { status: string; results: (EntryResult | null | undefined)[] }[]): DeleteCheck {
  const clean = (r: EntryResult | null | undefined) => (r?.scratch ? resultOnly(r) : r);
  return {
    hasResults: phases.some((p) => p.status === 'completed' || hasAnyResult(p.results.map(clean))),
    finished: phases.some((p, i) => p.status === 'completed' && i === phases.length - 1),
    phases: phases.length,
    entries: phases[0]?.results.length ?? 0,
  };
}

/* ---------------------------- the entries document ---------------------------- */

export interface EntryCaps {
  /** max individual events per athlete (a combined event counts as one) */
  individual?: number;
  /** max relays per athlete */
  relay?: number;
}

export interface EntryAthlete {
  /** created by bulk add / late entry and on no team roster */
  eventOnly?: boolean;
  bib?: string;
  /** an age group typed instead of a date of birth ('U14') */
  age?: string;
  gender?: 'M' | 'F';
  /** house / school name as pasted (when it isn't one of the meet's teams) */
  house?: string;
}

/** One meet's entries (formats[sport].meetEntries, JSON). */
export interface MeetEntriesDoc {
  v: 1;
  caps?: EntryCaps;
  /** athlete id → slot keys ticked for events that have no start list yet */
  ticks?: Record<string, string[]>;
  athletes?: Record<string, EntryAthlete>;
  /** athletes the organiser let go over the cap */
  overrides?: string[];
}

export const emptyEntries = (): MeetEntriesDoc => ({ v: 1 });

export function parseEntriesDoc(raw: unknown): MeetEntriesDoc {
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!o || typeof o !== 'object') return emptyEntries();
    const d = o as Partial<MeetEntriesDoc>;
    return { v: 1, ...(d.caps ? { caps: d.caps } : {}), ticks: d.ticks ?? {}, athletes: d.athletes ?? {}, overrides: d.overrides ?? [] };
  } catch { return emptyEntries(); }
}

/** "ath.100m@U14-M" — an event of the programme before or after its start list exists. */
export const slotKey = (discipline: string, cat?: Category): string => `${discipline}@${categoryKey(cat)}`;

export function toggleTick(doc: MeetEntriesDoc, athleteId: string, slot: string, on?: boolean): MeetEntriesDoc {
  const cur = doc.ticks?.[athleteId] ?? [];
  const has = cur.includes(slot);
  const want = on ?? !has;
  if (want === has) return doc;
  const next = want ? [...cur, slot] : cur.filter((s) => s !== slot);
  const ticks = { ...(doc.ticks ?? {}) };
  if (next.length) ticks[athleteId] = next; else delete ticks[athleteId];
  return { ...doc, ticks };
}

export const setOverride = (doc: MeetEntriesDoc, athleteId: string, on: boolean): MeetEntriesDoc => ({
  ...doc, overrides: on ? [...new Set([...(doc.overrides ?? []), athleteId])] : (doc.overrides ?? []).filter((x) => x !== athleteId),
});

/** Caps read from text ("3" / "" = no cap). */
export function capsText(c?: EntryCaps): string {
  if (!c || (c.individual == null && c.relay == null)) return 'No limit on events per athlete';
  const a = c.individual != null ? `${c.individual} individual event${c.individual === 1 ? '' : 's'}` : 'any individual events';
  const b = c.relay != null ? `${c.relay} relay${c.relay === 1 ? '' : 's'}` : 'any relays';
  return `Max ${a} + ${b} per athlete`;
}

/* ------------------------------- the matrix ------------------------------- */

/** An event of the meet as the matrix sees it: one with a start list (its first
 *  phase) or one of the programme still to be set up. */
export interface EntryEvent {
  slot: string;
  discipline: string;
  category?: Category;
  label: string;
  relay: boolean;
  /** has a start list */
  eventKey?: string;
  /** its first phase (late entries / scratches go there) */
  phaseId?: string;
  phaseStatus?: string;
  /** first phase's entries */
  entries?: ResultEntry[];
}

export type EntryCellState = 'none' | 'ticked' | 'entered' | 'scratched' | 'member';

/** One athlete in one event. */
export function cellState(athleteId: string, ev: EntryEvent, doc: MeetEntriesDoc): EntryCellState {
  if (ev.eventKey) {
    for (const e of ev.entries ?? []) {
      if (e.athleteId === athleteId) return e.result?.scratch ? 'scratched' : 'entered';
      if (e.result?.members?.some((m) => m.playerId === athleteId)) return e.result?.scratch ? 'none' : 'member';
    }
    return 'none';
  }
  return doc.ticks?.[athleteId]?.includes(ev.slot) ? 'ticked' : 'none';
}

export interface EntryCount { individual: number; relay: number }

/** How many events an athlete is in across the meet (start lists + ticks for
 *  events with no start list yet; scratches don't count). */
export function entryCount(athleteId: string, events: EntryEvent[], doc: MeetEntriesDoc): EntryCount {
  const out = { individual: 0, relay: 0 };
  for (const ev of events) {
    const s = cellState(athleteId, ev, doc);
    if (s === 'entered' || s === 'ticked' || s === 'member') { if (ev.relay) out.relay += 1; else out.individual += 1; }
  }
  // ticks for slots that aren't in `events` (another age group's programme) still count
  for (const slot of doc.ticks?.[athleteId] ?? []) {
    if (events.some((e) => e.slot === slot)) continue;
    const d = disciplineOf(slot.split('@')[0]);
    if (d?.teamSize) out.relay += 1; else out.individual += 1;
  }
  return out;
}

export interface CapState { over: boolean; overridden: boolean; text: string }

export function capState(c: EntryCount, caps: EntryCaps | undefined, overridden = false): CapState {
  const overI = caps?.individual != null && c.individual > caps.individual;
  const overR = caps?.relay != null && c.relay > caps.relay;
  const text = `${c.individual}${caps?.individual != null ? `/${caps.individual}` : ''}${c.relay || caps?.relay != null ? ` + ${c.relay}${caps?.relay != null ? `/${caps.relay}` : ''}R` : ''}`;
  return { over: overI || overR, overridden: (overI || overR) && overridden, text };
}

/** Would one more event of this kind go over the cap? (the warning before a tick) */
export function wouldExceed(c: EntryCount, relay: boolean, caps?: EntryCaps): string | null {
  if (relay) return caps?.relay != null && c.relay + 1 > caps.relay ? `over the cap of ${caps.relay} relay${caps.relay === 1 ? '' : 's'} (${c.relay} already)` : null;
  return caps?.individual != null && c.individual + 1 > caps.individual ? `over the cap of ${caps.individual} individual event${caps.individual === 1 ? '' : 's'} (${c.individual} already)` : null;
}

/** Short column header: "100", "80H", "LJ", "4×100", "50 Fr". */
export function shortLabel(discipline: string): string {
  const d = disciplineOf(discipline);
  const label = d?.label ?? discipline;
  const k = discipline.split('.')[1] ?? '';
  const FIELD: Record<string, string> = { lj: 'LJ', hj: 'HJ', tj: 'TJ', pv: 'PV', sp: 'SP', dt: 'DT', jt: 'JT', ht: 'HT' };
  if (discipline.startsWith('ath.') && FIELD[k]) return FIELD[k];
  if (discipline.startsWith('swim.')) {
    const m = /^(4x)?(\d+)(free|back|breast|fly|im|medley)$/.exec(k);
    const S: Record<string, string> = { free: 'Fr', back: 'Bk', breast: 'Br', fly: 'Fly', im: 'IM', medley: 'Med' };
    if (m) return `${m[1] ? '4×' : ''}${m[2]} ${S[m[3]]}`;
  }
  const r = /^4x(\d+)$/.exec(k);
  if (r) return `4×${r[1]}`;
  const h = /^(\d+)mh$/.exec(k);
  if (h) return `${h[1]}H`;
  const t = /^(\d+)m$/.exec(k);
  if (t) return t[1];
  return label.length > 9 ? `${label.slice(0, 8)}…` : label;
}

/** The age group an athlete runs in: the youngest group they're under on the
 *  day (Open when older than all). `age` in whole years. */
export function ageGroupFor(age: number | undefined, groups: readonly string[] = AGE_GROUPS): string | undefined {
  if (age == null) return undefined;
  for (const g of groups) { const lim = ageLimit(g); if (lim != null && age < lim) return g; }
  return groups.includes('Open') ? 'Open' : undefined;
}

/** Is this athlete in this matrix group? A typed age group must match; else
 *  the usual eligibility (gender, under the age limit). */
export function inGroup(a: { gender?: string; age?: number; ageGroup?: string }, cat: Category, exactAge = false): boolean {
  if (a.ageGroup && a.age == null) return a.ageGroup === cat.age && eligibleFor({ gender: cat.gender }, { gender: a.gender });
  if (exactAge) return eligibleFor(cat, a) && ageGroupFor(a.age) === cat.age;
  return eligibleFor(cat, a);
}

/* -------------------------------- bulk add -------------------------------- */

export interface BulkRow {
  line: number;
  name: string;
  house?: string;
  gender?: 'M' | 'F';
  /** YYYY-MM-DD */
  dob?: string;
  /** typed age group */
  age?: string;
  bib?: string;
  /** events named on the row (discipline keys) */
  events: string[];
  /** words on the row we couldn't place */
  unknown: string[];
  error?: string;
}

const GENDER_RE = /^(m|male|man|men|boy|boys|b|f|female|woman|women|girl|girls|g)$/i;
const AGE_RE = /^(u\s?-?\s?\d{1,2}|under\s?\d{1,2}|open)$/i;
const DATE_RE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$|^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/;
const BIB_RE = /^#?[a-z]{0,3}\d{1,5}[a-z]?$/i;

const pad = (n: number) => String(n).padStart(2, '0');

/** A typed date → YYYY-MM-DD (day first, as written in India: 05/03/2012 = 5 March). */
export function readDob(t: string, today: Date = new Date()): string | undefined {
  const m = DATE_RE.exec(t.trim());
  if (!m) return undefined;
  let y: number, mo: number, d: number;
  if (m[1]) { y = +m[1]; mo = +m[2]; d = +m[3]; } else {
    d = +m[4]; mo = +m[5]; y = +m[6];
    if (m[6].length === 2) y += y + 2000 > today.getFullYear() ? 1900 : 2000;
  }
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return undefined;
  if (dt.getTime() > today.getTime() || y < 1900) return undefined;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

const readGender = (t: string): 'M' | 'F' | undefined => {
  if (!GENDER_RE.test(t.trim())) return undefined;
  return /^(f|g|w)/i.test(t.trim()) ? 'F' : 'M';
};
const readAge = (t: string): string | undefined => {
  const s = t.trim();
  if (!AGE_RE.test(s)) return undefined;
  if (/^open$/i.test(s)) return 'Open';
  return `U${/\d+/.exec(s)![0]}`;
};

const EVENT_ALIASES: Record<string, string> = {
  lj: 'ath.lj', longjump: 'ath.lj', hj: 'ath.hj', highjump: 'ath.hj', tj: 'ath.tj', triplejump: 'ath.tj', pv: 'ath.pv', polevault: 'ath.pv',
  sp: 'ath.sp', shot: 'ath.sp', shotput: 'ath.sp', dt: 'ath.dt', discus: 'ath.dt', discusthrow: 'ath.dt', jt: 'ath.jt', javelin: 'ath.jt', javelinthrow: 'ath.jt',
  ht: 'ath.ht', hammer: 'ath.ht', hammerthrow: 'ath.ht',
};

/** "100m" / "100 m" / "LJ" / "4x100" / "50 free" / "100 back" → a discipline key of `sport`, or null. */
export function readEvent(t: string, sport: string = 'athletics', known?: string[]): string | null {
  const s = t.toLowerCase().replace(/×/g, 'x').replace(/\s+/g, '').replace(/metres?|mtrs?/g, 'm');
  const ok = (k: string) => (disciplineOf(k) && (!known || known.includes(k)) ? k : null);
  if (sport === 'swimming') {
    const m = /^(4x)?(\d+)(?:m(?!edley))?([a-z]+?)(relay)?$/.exec(s);
    if (!m) return null;
    const STROKE: Record<string, string> = { free: 'free', freestyle: 'free', fr: 'free', back: 'back', backstroke: 'back', bk: 'back', breast: 'breast', breaststroke: 'breast', br: 'breast', fly: 'fly', butterfly: 'fly', im: 'im', individualmedley: 'im', medley: m[1] ? 'medley' : 'im' };
    const st = STROKE[m[3]];
    return st ? ok(`swim.${m[1] ? '4x' : ''}${m[2]}${st}`) : null;
  }
  if (EVENT_ALIASES[s]) return ok(EVENT_ALIASES[s]);
  const r = /^4x(\d+)m?(relay)?$/.exec(s);
  if (r) return ok(`ath.4x${r[1]}`);
  const h = /^(\d+)m?(h|hurdles)$/.exec(s);
  if (h) return ok(`ath.${h[1]}mh`);
  const d = /^(\d+)m?$/.exec(s);
  if (d) return ok(`ath.${d[1]}m`);
  return null;
}

/** Split one pasted line: tabs (a spreadsheet copy), else commas, else 2+ spaces. */
const cells = (line: string): string[] => (line.includes('\t') ? line.split('\t') : line.includes(',') ? line.split(',') : line.split(/\s{2,}|;/)).map((c) => c.trim());

/**
 * Read a pasted list. Column 1 is the name; the rest are recognised by shape —
 * gender (M / F / Boy / Girl), a date of birth (day first) or an age group
 * (U14 / Open), a bib (digits), events ("100m; LJ") — and the first other text
 * is the house / team. A header row is skipped.
 */
export function parseBulk(text: string, sport: string = 'athletics', today: Date = new Date()): BulkRow[] {
  const out: BulkRow[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const cs = cells(line).filter((c, j) => c || j === 0);
    if (!cs.length) return;
    if (i === 0 && /^(name|athlete|student|full ?name)$/i.test(cs[0])) return;
    const row: BulkRow = { line: i + 1, name: cs[0].replace(/\s+/g, ' ').trim(), events: [], unknown: [] };
    for (const c of cs.slice(1)) {
      if (!c) continue;
      const g = !row.gender ? readGender(c) : undefined;
      if (g) { row.gender = g; continue; }
      const a = !row.age && !row.dob ? readAge(c) : undefined;
      if (a) { row.age = a; continue; }
      const d = !row.dob ? readDob(c, today) : undefined;
      if (d) { row.dob = d; continue; }
      const evs = c.split(/[;/+|&]/).map((x) => x.trim()).filter(Boolean);
      const keys = evs.map((x) => readEvent(x, sport));
      if (evs.length && keys.every(Boolean)) { row.events.push(...(keys as string[]).filter((k) => !row.events.includes(k))); continue; }
      if (!row.bib && BIB_RE.test(c) && /\d/.test(c)) { row.bib = c.replace(/^#/, ''); continue; }
      if (!row.house) { row.house = c; continue; }
      row.unknown.push(c);
    }
    if (!row.name || /\d/.test(row.name) && !/[a-z]/i.test(row.name)) row.error = 'No name';
    else if (DATE_RE.test(cs.find((c) => /\d+[-/.]\d+[-/.]\d+/.test(c)) ?? 'x') && !row.dob) row.error = 'Date of birth not read (day/month/year)';
    out.push(row);
  });
  return out;
}

/** Name for matching: lower case, single spaces, no dots / initials punctuation. */
export const normName = (s: string): string => s.toLowerCase().replace(/[.'’]/g, '').replace(/\s+/g, ' ').trim();

export type DupKind = 'same' | 'likely' | 'inList';
export interface DupMatch { line: number; kind: DupKind; playerId?: string; name?: string }

/**
 * Duplicates by name + date of birth: the same name and DOB as a player we can
 * see is the same person ('same' — use them); the same name and an age that
 * fits (a DOB we can't see) is 'likely'; the same name + DOB twice in the
 * paste is 'inList' (the later row is dropped).
 */
export function findDuplicates(rows: BulkRow[], players: { id: string; fullName: string; dob?: string; age?: number }[], today: Date = new Date()): DupMatch[] {
  const out: DupMatch[] = [];
  const byName = new Map<string, typeof players>();
  for (const p of players) { const k = normName(p.fullName ?? ''); if (k) byName.set(k, [...(byName.get(k) ?? []), p]); }
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (r.error) continue;
    const k = normName(r.name);
    const key = `${k}|${r.dob ?? r.age ?? ''}`;
    if (seen.has(key)) { out.push({ line: r.line, kind: 'inList' }); continue; }
    seen.set(key, r.line);
    const cands = byName.get(k) ?? [];
    const exact = r.dob ? cands.find((p) => p.dob === r.dob) : undefined;
    if (exact) { out.push({ line: r.line, kind: 'same', playerId: exact.id, name: exact.fullName }); continue; }
    const age = r.dob ? yearsOn(r.dob, today) : undefined;
    // a DOB on both sides that differs is a different person (two "Rahul Sharma"s)
    const likely = cands.find((p) => (p.dob && r.dob ? false : age == null || p.age == null || Math.abs(p.age - age) <= 1));
    if (likely) out.push({ line: r.line, kind: 'likely', playerId: likely.id, name: likely.fullName });
  }
  return out;
}

/** Whole years on a day from a YYYY-MM-DD date of birth. */
export function yearsOn(dob: string, on: Date = new Date()): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return undefined;
  let a = on.getFullYear() - +m[1];
  if (on.getMonth() + 1 < +m[2] || (on.getMonth() + 1 === +m[2] && on.getDate() < +m[3])) a -= 1;
  return a >= 0 ? a : undefined;
}

/** A pasted house name → one of the meet's teams (case / "House" insensitive). */
export function matchTeam<T extends { name: string }>(house: string | undefined, teams: T[]): T | undefined {
  if (!house) return undefined;
  const n = (s: string) => normName(s).replace(/\s*house$/, '');
  return teams.find((t) => n(t.name) === n(house));
}

/* --------------------------- the matrix's columns --------------------------- */

/** The meet's events for one matrix group (age group × gender): every event
 *  with a start list in that group (its first phase), then — athletics and
 *  swimming — the school programme's events with no start list yet. */
export function entryEvents(
  sport: string,
  meet: { eventKey: string; title: string; discipline: string; category?: Category; phases: { id: string; status: string; format: Pick<PhaseFormat, 'phaseNo'>; entries: ResultEntry[] }[] }[],
  group: { age?: string; gender?: 'M' | 'F' | 'X'; course?: Category['course'] },
): EntryEvent[] {
  const same = (c?: Category) => (c?.age ?? 'Open') === (group.age ?? 'Open') && (c?.gender ?? 'X') === (group.gender ?? 'X');
  const out: EntryEvent[] = [];
  for (const e of meet) {
    if (!same(e.category)) continue;
    const first = [...e.phases].sort((a, b) => a.format.phaseNo - b.format.phaseNo)[0];
    if (!first) continue;
    const d = disciplineOf(e.discipline);
    out.push({
      slot: slotKey(e.discipline, e.category), discipline: e.discipline, category: e.category, label: e.title, relay: !!d?.teamSize,
      eventKey: e.eventKey, phaseId: first.id, phaseStatus: first.status, entries: first.entries,
    });
  }
  const cat: Category = { age: group.age, gender: group.gender, ...(sport === 'swimming' ? { course: group.course ?? 'LCM' } : {}) };
  const programme = sport === 'athletics' ? [...trackEventsFor(cat), ...fieldEventsFor(cat)].map((x) => x.discipline)
    : sport === 'swimming' ? swimEventsFor(cat, cat.course).map((x) => x.discipline) : [];
  for (const k of programme) {
    const slot = slotKey(k, cat);
    if (out.some((o) => o.slot === slot || (o.discipline === k && same(o.category)))) continue;
    const d = disciplineOf(k);
    out.push({ slot, discipline: k, category: cat, label: d?.label ?? k, relay: !!d?.teamSize });
  }
  return out;
}

/** The athletes ticked for an event with no start list yet (setup pre-fills from them). */
export const tickedFor = (doc: MeetEntriesDoc, slot: string): string[] =>
  Object.entries(doc.ticks ?? {}).filter(([, s]) => s.includes(slot)).map(([id]) => id);
