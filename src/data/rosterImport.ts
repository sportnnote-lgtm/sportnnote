/**
 * SD-154: CSV roster import for schools and teams — a school's MIS export
 * (SIMS, Arbor, iSAMS, PowerSchool …) or any spreadsheet saved as CSV, pasted
 * or picked as a file.
 *
 * Columns (any order, header names are forgiving): name (or first + last name),
 * date of birth, gender, class / year / grade, house, team, jersey / shirt
 * number, guardian name, guardian email, guardian phone. Dates read in the
 * region's order (US month-first) and an all-ambiguous file is flagged; phones
 * become full international numbers (E.164) via core/phone.ts.
 *
 * MINORS: contact details in a roster are the GUARDIAN's, never put on the
 * child's own profile; they're private (only the guardian, the school's admins
 * and coaches see them — migration 0026 / I-0).
 *
 * Pure — no RN imports (node tests).
 */
import { parseTypedDate, dateOrderOf, type DateOrder } from '../core/region.ts';
import { normalizePhone, type CountryCode } from '../core/phone.ts';

export type RosterField = 'name' | 'first' | 'last' | 'dob' | 'gender' | 'standard' | 'house' | 'team' | 'jersey'
  | 'guardianName' | 'guardianEmail' | 'guardianPhone';

/** Header aliases (lower-case, punctuation stripped). */
const ALIASES: Record<RosterField, string[]> = {
  name: ['name', 'full name', 'fullname', 'student', 'student name', 'player', 'player name', 'athlete', 'pupil', 'pupil name', 'legal name'],
  first: ['first name', 'firstname', 'forename', 'given name', 'preferred forename', 'first'],
  last: ['last name', 'lastname', 'surname', 'family name', 'legal surname', 'last'],
  dob: ['dob', 'date of birth', 'birth date', 'birthdate', 'birthday', 'born', 'd o b'],
  gender: ['gender', 'sex', 'boy girl', 'm f'],
  standard: ['class', 'year', 'year group', 'grade', 'form', 'standard', 'reg group', 'registration group', 'tutor group', 'homeroom', 'class section', 'level'],
  house: ['house', 'house name'],
  team: ['team', 'squad', 'side'],
  jersey: ['jersey', 'jersey no', 'jersey number', 'shirt', 'shirt no', 'shirt number', 'number', 'no', 'bib'],
  guardianName: ['guardian', 'guardian name', 'parent', 'parent name', 'contact name', 'primary contact', 'parent guardian', 'parent guardian name', 'emergency contact'],
  guardianEmail: ['guardian email', 'parent email', 'contact email', 'email', 'parent guardian email', 'primary contact email', 'e mail'],
  guardianPhone: ['guardian phone', 'parent phone', 'contact phone', 'phone', 'mobile', 'guardian mobile', 'parent mobile', 'contact number', 'primary contact phone', 'telephone', 'tel'],
};

const norm = (h: string) => h.toLowerCase().replace(/[_\-./#()]+/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

/** Split CSV text into rows of cells: quotes ("a, b" and "" escapes), CRLF,
 *  and the delimiter guessed from the first line (comma, semicolon or tab). */
export function parseCsv(text: string): string[][] {
  const src = (text ?? '').replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] ?? '';
  const counts = { ',': (first.match(/,/g) ?? []).length, ';': (first.match(/;/g) ?? []).length, '\t': (first.match(/\t/g) ?? []).length };
  const delim = counts['\t'] > counts[','] && counts['\t'] >= counts[';'] ? '\t' : counts[';'] > counts[','] ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"' && cell.trim() === '') { q = true; cell = ''; }
    else if (c === delim) { row.push(cell.trim()); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell.trim()); cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

/** Which column holds which field (index), from the header row. Unknown headers are ignored. */
export function mapHeaders(header: string[]): Partial<Record<RosterField, number>> {
  const out: Partial<Record<RosterField, number>> = {};
  const hs = header.map(norm);
  // exact alias first, then "contains" (e.g. "Student Date of Birth")
  for (const pass of ['exact', 'contains'] as const) {
    (Object.keys(ALIASES) as RosterField[]).forEach((f) => {
      if (out[f] != null) return;
      const i = hs.findIndex((h, j) => !Object.values(out).includes(j) && ALIASES[f].some((a) => (pass === 'exact' ? h === a : h.includes(a) && a.length >= 4)));
      if (i >= 0) out[f] = i;
    });
  }
  // "Email" / "Phone" alone after a "Guardian" column are the guardian's (already aliased);
  return out;
}

/** Does the first row look like a header (some cell matches a known field)? */
export const looksLikeHeader = (row: string[]): boolean => {
  const m = mapHeaders(row);
  return m.name != null || (m.first != null && m.last != null);
};

export interface RosterRow {
  /** 1-based line in the file (for messages) */
  line: number;
  fullName: string;
  dob?: string;
  gender?: 'Male' | 'Female';
  standard?: string;
  house?: string;
  team?: string;
  jersey?: number;
  guardian?: { name: string; email?: string; phone?: string };
  /** problems that stop this row importing */
  errors: string[];
  /** things to check (row still imports) */
  warnings: string[];
  /** an existing person this looks like (skipped by default) */
  duplicateOf?: { id: string; name: string; why: string };
  /** another row in this file with the same person */
  dupInFile?: number;
}

export interface ExistingPerson { id: string; fullName: string; dob?: string; phone?: string; guardianEmail?: string }

export interface RosterParse {
  rows: RosterRow[];
  /** the date order used, and whether the file couldn't tell (all dates ≤ 12/12) */
  dateOrder: DateOrder;
  ambiguousDates: boolean;
  /** the file's dates prove the other order than the region's */
  orderFromFile?: DateOrder;
  mapped: Partial<Record<RosterField, number>>;
  missingName: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const key = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();

function readGender(t: string): 'Male' | 'Female' | undefined {
  const s = t.trim().toLowerCase();
  if (!s) return undefined;
  if (/^(f|female|girl|g|w|woman)$/.test(s)) return 'Female';
  if (/^(m|male|boy|b|man)$/.test(s)) return 'Male';
  return undefined;
}

/**
 * Read a pasted / uploaded roster. `order` is the region's date order — a file
 * whose dates prove the other order (a 25 in the second place) is read that
 * way, and a file where every date fits both ways is flagged `ambiguousDates`
 * so the screen can ask. `existing` = the school's / team's people (duplicates).
 */
export function parseRoster(text: string, opts: { order?: DateOrder; country?: CountryCode; existing?: ExistingPerson[]; today?: Date; forceOrder?: DateOrder } = {}): RosterParse {
  const today = opts.today ?? new Date();
  const all = parseCsv(text);
  const header = all.length && looksLikeHeader(all[0]) ? all[0] : null;
  // no header: name, dob, gender, class, house (the order of the hint text)
  const mapped: Partial<Record<RosterField, number>> = header ? mapHeaders(header) : { name: 0, dob: 1, gender: 2, standard: 3, house: 4 };
  const body = header ? all.slice(1) : all;
  const cell = (r: string[], f: RosterField) => (mapped[f] != null ? (r[mapped[f]!] ?? '').trim() : '');
  const dobTexts = body.map((r) => cell(r, 'dob'));
  const found = dateOrderOf(dobTexts);
  const regionOrder = opts.order ?? 'DMY';
  const dateOrder: DateOrder = opts.forceOrder ?? (found === 'DMY' || found === 'MDY' ? found : regionOrder);
  const out: RosterRow[] = body.map((r, i) => {
    const line = i + (header ? 2 : 1);
    const errors: string[] = [], warnings: string[] = [];
    const fullName = (cell(r, 'name') || [cell(r, 'first'), cell(r, 'last')].filter(Boolean).join(' ')).replace(/\s+/g, ' ').trim();
    if (!fullName) errors.push('No name');
    const dobText = cell(r, 'dob');
    let dob: string | undefined;
    if (dobText) {
      const d = parseTypedDate(dobText.replace(/\s.*$/, ''), dateOrder, today);
      if (!d) errors.push(`Can't read the date of birth "${dobText}"`);
      else if (d > today.toISOString().slice(0, 10) || d < '1900-01-01') errors.push(`Date of birth ${dobText} isn't possible`);
      else dob = d;
    }
    const gText = cell(r, 'gender');
    const gender = readGender(gText);
    if (gText && !gender) warnings.push(`Gender "${gText}" left blank`);
    const jText = cell(r, 'jersey');
    let jersey: number | undefined;
    if (jText) { const n = Number(jText.replace(/^#/, '')); if (Number.isInteger(n) && n >= 0 && n <= 999) jersey = n; else warnings.push(`Jersey "${jText}" left blank`); }
    const gName = cell(r, 'guardianName');
    const gEmail = cell(r, 'guardianEmail').toLowerCase();
    const gPhoneText = cell(r, 'guardianPhone');
    let gPhone: string | undefined;
    if (gEmail && !EMAIL.test(gEmail)) errors.push(`Guardian email "${gEmail}" isn't an email address`);
    if (gPhoneText) {
      const p = normalizePhone(gPhoneText, opts.country);
      if (!p) errors.push(`Guardian phone "${gPhoneText}" isn't a phone number${opts.country ? '' : ' (add the country code, e.g. +44)'}`);
      else gPhone = p;
    }
    const guardian = gName || gEmail || gPhone ? { name: gName || 'Parent / guardian', ...(gEmail && EMAIL.test(gEmail) ? { email: gEmail } : {}), ...(gPhone ? { phone: gPhone } : {}) } : undefined;
    if (dob && ageOn(dob, today) < 18 && !guardian) warnings.push('Under 18 with no guardian contact');
    const standard = cell(r, 'standard') || undefined;
    const house = cell(r, 'house') || undefined;
    const team = cell(r, 'team') || undefined;
    return { line, fullName, ...(dob ? { dob } : {}), ...(gender ? { gender } : {}), ...(standard ? { standard } : {}), ...(house ? { house } : {}), ...(team ? { team } : {}), ...(jersey != null ? { jersey } : {}), ...(guardian ? { guardian } : {}), errors, warnings };
  });
  // duplicates: in the file, then against the people already there
  const seen = new Map<string, number>();
  for (const row of out) {
    if (!row.fullName) continue;
    const k = `${key(row.fullName)}|${row.dob ?? ''}`;
    if (seen.has(k)) row.dupInFile = seen.get(k);
    else seen.set(k, row.line);
  }
  const ex = opts.existing ?? [];
  for (const row of out) {
    if (!row.fullName) continue;
    const n = key(row.fullName);
    const hit = ex.find((p) => key(p.fullName) === n && (!row.dob || !p.dob || p.dob === row.dob));
    if (hit) { row.duplicateOf = { id: hit.id, name: hit.fullName, why: hit.dob && row.dob ? 'same name and date of birth' : 'same name' }; continue; }
    const byContact = ex.find((p) => (row.guardian?.email && p.guardianEmail === row.guardian.email && key(p.fullName).split(' ')[0] === n.split(' ')[0]));
    if (byContact) row.duplicateOf = { id: byContact.id, name: byContact.fullName, why: 'same first name and guardian email' };
  }
  return {
    rows: out, dateOrder, ambiguousDates: !opts.forceOrder && found === 'ambiguous', mapped,
    ...(found === 'DMY' || found === 'MDY' ? (found !== regionOrder ? { orderFromFile: found } : {}) : {}),
    missingName: mapped.name == null && (mapped.first == null || mapped.last == null),
  };
}

/** Whole years on a day ('YYYY-MM-DD'). */
export function ageOn(dob: string, today: Date = new Date()): number {
  const [y, m, d] = dob.split('-').map(Number);
  const t = today.toISOString().slice(0, 10).split('-').map(Number);
  return t[0] - y - (t[1] < m || (t[1] === m && t[2] < d) ? 1 : 0);
}

/** The rows that will import: no errors, not a duplicate (unless kept), first of any in-file repeat. */
export const importable = (rows: RosterRow[], keepDuplicates = false): RosterRow[] =>
  rows.filter((r) => !r.errors.length && r.dupInFile == null && (keepDuplicates || !r.duplicateOf));

/** A template a school can fill in (the header row + one example). */
export const ROSTER_TEMPLATE = (order: DateOrder = 'DMY'): string =>
  `Name,Date of birth,Gender,Class,House,Team,Jersey,Guardian name,Guardian email,Guardian phone\nAsha Rao,${order === 'MDY' ? '03/05/2012' : '05/03/2012'},F,Year 8,Red,U13 A,7,Meera Rao,meera@example.com,+44 7400 123456\n`;
