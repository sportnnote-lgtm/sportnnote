/**
 * SD-130 — record-book writes as operations, so two officials locking finals
 * at the same moment can't lose each other's records. A final no longer
 * writes the whole book back; it sends what it changed:
 *
 *   better   — "this mark beats the record for its scope / event / category"
 *              (applied only if it still beats what the book holds NOW);
 *   set      — an organiser's historic record (replaces that key);
 *   remove   — an organiser deletes a record;
 *   restore  — "Reopen final": the records this event set go back to the
 *              holders before it (SD-112 rollbackRecords).
 *
 * The server applies them inside one transaction with the tournament row
 * locked (migration field_record_book, merge_field_records()); this module is
 * the same merge in TypeScript — the demo store, the pre-migration fallback
 * and the tests use it, so both sides agree. Also: the historic record board
 * (paste lines → records). Pure.
 */
import type { Better, Category, DisciplineDef } from './model.ts';
import { DISCIPLINES, categoryKey, categoryLabel, disciplineOf } from './model.ts';
import { parseMark } from './marks.ts';
import type { RecordMark, RecordScope } from './records.ts';
import { rollbackRecords } from './safety.ts';

export type RecordOp =
  | { op: 'better'; rec: RecordMark; better: Better }
  | { op: 'set'; rec: RecordMark }
  | { op: 'remove'; scope: RecordScope; discipline: string; category: string }
  | { op: 'restore'; discipline: string; category: string; eventKey: string; before: RecordMark[] };

const sameKey = (a: Pick<RecordMark, 'scope' | 'discipline' | 'category'>, b: Pick<RecordMark, 'scope' | 'discipline' | 'category'>) =>
  a.scope === b.scope && a.discipline === b.discipline && a.category === b.category;

const beats = (v: number, cur: number, better: Better) => (better === 'higher' ? v > cur : v < cur);

/** Apply operations to a book (a copy) — exactly what merge_field_records() does. */
export function applyRecordOps(book: RecordMark[], ops: RecordOp[]): RecordMark[] {
  let out = [...book];
  for (const o of ops) {
    if (o.op === 'better') {
      const cur = out.find((r) => sameKey(r, o.rec));
      if (cur && !beats(o.rec.value, cur.value, o.better)) continue;
      out = out.filter((r) => r !== cur);
      out.push(o.rec);
    } else if (o.op === 'set') {
      out = out.filter((r) => !sameKey(r, o.rec));
      out.push(o.rec);
    } else if (o.op === 'remove') {
      out = out.filter((r) => !sameKey(r, o));
    } else {
      out = rollbackRecords(out, o.discipline, o.category, o.eventKey, o.before);
    }
  }
  return out;
}

/** The "better" operations that turn `book` into `next` (the records an event set). */
export function recordOpsFor(book: RecordMark[], next: RecordMark[]): RecordOp[] {
  const ops: RecordOp[] = [];
  for (const r of next) {
    if (book.includes(r)) continue;
    const def = disciplineOf(r.discipline);
    ops.push({ op: 'better', rec: r, better: def?.better ?? 'lower' });
  }
  return ops;
}

/* --------------------------- the historic board --------------------------- */

/** A record entered by hand (a school's record board, before the app). */
export interface HistoricRecordInput {
  scope: RecordScope;
  discipline: string;
  category: Category;
  /** as typed: "12.84", "1:52.3", "5.62" */
  mark: string;
  holder: string;
  team?: string;
  year?: number;
  venue?: string;
}

/** Check and build a historic record (or say what's wrong). */
export function historicRecord(input: HistoricRecordInput): { rec?: RecordMark; error?: string } {
  const def = disciplineOf(input.discipline);
  if (!def) return { error: 'Pick the event.' };
  const holder = input.holder.trim();
  if (!holder) return { error: 'Type the record holder’s name.' };
  const p = parseMark(input.mark, def);
  if (!p) return { error: def.unit === 'time' ? 'Type the time like 12.84 or 2:05.3.' : 'Type the mark like 5.62.' };
  const y = input.year;
  const thisYear = new Date().getFullYear();
  if (y != null && (!Number.isInteger(y) || y < 1900 || y > thisYear)) return { error: `The year should be between 1900 and ${thisYear}.` };
  return {
    rec: {
      scope: input.scope, discipline: def.key, category: categoryKey(input.category), value: p.mark, holder,
      ...(input.team?.trim() ? { team: input.team.trim() } : {}),
      ...(y ? { year: y, date: String(y) } : {}),
      ...(input.venue?.trim() ? { venue: input.venue.trim() } : {}),
      historic: true,
    },
  };
}

const norm = (s: string) => s.toLowerCase().replace(/×/g, 'x').replace(/metres?|meters?|mtrs?/g, 'm').replace(/[^a-z0-9]/g, '');

/** The events of a sport a record can be entered for (combined totals and single lifts aside). */
export function recordDisciplines(sport: string): DisciplineDef[] {
  return DISCIPLINES.filter((d) => d.sport === sport && d.tie !== 'road' && d.capture !== 'order');
}

/** "100 m" / "100m" / "long jump" → the discipline. */
export function findDiscipline(sport: string, text: string): DisciplineDef | undefined {
  const t = norm(text);
  if (!t) return undefined;
  const list = recordDisciplines(sport);
  return list.find((d) => norm(d.label) === t) ?? list.find((d) => norm(d.label).replace(/relay$/, '') === t)
    ?? list.find((d) => norm(d.label).startsWith(t) && t.length >= 4);
}

/** "U14 Boys" / "u-14 girls" / "Open men" / "mixed" → the category (age + gender). */
export function parseCategory(text: string): Category | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;
  const age = /\bu\s*-?\s*(\d{1,2})\b/.exec(t);
  const g: Category['gender'] = /\b(boys?|men|male|m)\b/.test(t) ? 'M' : /\b(girls?|women|female|f|w)\b/.test(t) ? 'F' : /\b(mixed|x)\b/.test(t) ? 'X' : undefined;
  if (!age && !/\bopen\b/.test(t) && !g) return null;
  // anything else in the cell ("U14 Wizards") isn't a category
  if (t.replace(/\bu\s*-?\s*\d{1,2}\b|\b(boys?|girls?|men|women|male|female|mixed|open|m|f|w|x)\b|[\s\-/']/g, '')) return null;
  return { ...(age ? { age: `U${Number(age[1])}` } : { age: 'Open' }), ...(g ? { gender: g } : {}) };
}

export interface PastedRecord { line: number; rec?: RecordMark; error?: string; text: string }

/**
 * Paste a record board, one record per line:
 *   event, category, mark, holder[, team][, year]
 *   "100 m, U14 Boys, 12.84, Asha Rao, Red House, 2009"
 * Commas, tabs or " | " separate the fields (a spreadsheet copy works). A
 * four-digit last field is the year. Blank lines and a header line are skipped.
 */
export function parseRecordBoard(text: string, sport: string, scope: RecordScope, course?: Category['course']): PastedRecord[] {
  const out: PastedRecord[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const cells = line.split(/\t|\s*\|\s*|\s*,\s*|\s*;\s*/).map((c) => c.trim());
    if (i === 0 && /^event\b/i.test(cells[0] ?? '')) return; // a header row
    const fail = (error: string) => out.push({ line: i + 1, text: line, error });
    if (cells.length < 4) return fail('Needs at least: event, category, mark, holder.');
    const def = findDiscipline(sport, cells[0]);
    if (!def) return fail(`Unknown event “${cells[0]}”.`);
    const cat = parseCategory(cells[1]);
    if (!cat) return fail(`Unknown category “${cells[1]}” — try “U14 Boys” or “Open Girls”.`);
    let rest = cells.slice(4);
    let year: number | undefined;
    const last = rest[rest.length - 1];
    if (last && /^(19|20)\d\d$/.test(last)) { year = Number(last); rest = rest.slice(0, -1); }
    const r = historicRecord({ scope, discipline: def.key, category: { ...cat, ...(course && def.sport === 'swimming' ? { course } : {}) }, mark: cells[2], holder: cells[3], team: rest[0], year });
    if (r.error) return fail(r.error);
    out.push({ line: i + 1, text: line, rec: r.rec });
  });
  return out;
}

/** One line of the board, for a list / share text: "100 m U14 Boys — 12.84 Asha Rao (Red House) 2009". */
export function recordLine(r: RecordMark, fmt: (v: number, def: DisciplineDef) => string): string {
  const def = disciplineOf(r.discipline);
  const [age, g] = r.category.split('-');
  const cat = categoryLabel({ age: age === 'open' ? 'Open' : age, gender: g as Category['gender'] });
  return `${def?.label ?? r.discipline} ${cat} — ${def ? fmt(r.value, def) : r.value} ${r.holder}${r.team && r.team !== r.holder ? ` (${r.team})` : ''}${r.year ? ` ${r.year}` : r.date ? ` ${r.date.slice(0, 4)}` : ''}`;
}

/**
 * A school's record book: the best of the marks derived from its meets and
 * the historic board entered by hand — one record per event + category.
 */
export function bestRecords(...lists: RecordMark[][]): RecordMark[] {
  const out = new Map<string, RecordMark>();
  for (const r of lists.flat()) {
    const k = `${r.scope}|${r.discipline}|${r.category}`;
    const cur = out.get(k);
    const better = disciplineOf(r.discipline)?.better ?? 'lower';
    if (!cur || beats(r.value, cur.value, better)) out.set(k, r);
  }
  return [...out.values()];
}
