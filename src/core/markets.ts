/**
 * SD-153 (international I-2a) — school-sport MARKET PRESETS.
 *
 * A market is how schools in one place name their classes, when students
 * graduate, which day ages are counted on, which age bands meets use, and a few
 * words (fixtures / schedule, sports day / carnival / field day). It is a
 * `market` setting on the community (organisation), set when the community is
 * created (from the creator's region) and editable. A tournament / meet takes
 * its host community's market, else the market of its venue time zone, else
 * India.
 *
 * Presets only fill in DEFAULTS the organiser can still change; no engine logic
 * depends on them. INDIA ('in') IS TODAY'S BEHAVIOUR: Grade 1–12 classes, a
 * Grade 10 graduating class, 31 Dec age cut-off, U11/U14/U16/U19/Open bands,
 * Indian / UK school-English words, Football and Hockey. A community with no
 * market (every community created before SD-153) is India.
 *
 * Foreign rules that matter (ESAA / BSME 31 Aug, NSG divisions, US state ages)
 * are from general knowledge — marked "verify" — and every one is editable.
 * Pure: no RN imports (node tests).
 */
import type { AgeCutoff, CountryCode } from './region.ts';

export type MarketId = 'in' | 'gulf-british' | 'gulf-indian' | 'uk' | 'sg' | 'my' | 'au' | 'us';

/** Words that differ by market. A small glossary, not i18n (English only). */
export type TermKey = 'fixtures' | 'match' | 'pitch' | 'sportsDay' | 'interHouse' | 'house';

export interface MarketPreset {
  id: MarketId;
  /** "UK", "Gulf — British curriculum" … */
  name: string;
  flag: string;
  /** the country whose region record matches this market best */
  country: CountryCode;
  /** classes in order, youngest first — drives "next class" at rollover */
  classLadder: string[];
  /** graduating-class choices, the usual one first (prefill when a school is created) */
  graduating: string[];
  /** month (1–12) the school year starts — seeds the first academic year */
  schoolYearStartMonth: number;
  /** default day ages are counted on for meets (core/age.ts AgeBasis) */
  ageCutoff: AgeCutoff;
  /** age bands offered for divisions and meet categories (core/divisions.ts ageBandOf reads them) */
  ageBands: string[];
  /** grade bands ("Grades 9–12") are checked against the class timeline */
  gradeEligibility?: boolean;
  /** help text under the cut-off picker: who sets the date here */
  cutoffHint: string;
  terms: Record<TermKey, string>;
}

const range = (prefix: string, from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix} ${from + i}`);

const TERMS_COMMON: Record<TermKey, string> = {
  fixtures: 'Fixtures', match: 'Match', pitch: 'Pitch', sportsDay: 'Sports day', interHouse: 'Inter-house', house: 'House',
};

export const MARKETS: Record<MarketId, MarketPreset> = {
  in: {
    id: 'in', name: 'India', flag: '🇮🇳', country: 'IN',
    classLadder: range('Grade', 1, 12),
    graduating: ['Grade 10', 'Grade 12'],
    schoolYearStartMonth: 4,
    ageCutoff: 'dec31',
    ageBands: ['U11', 'U14', 'U16', 'U19', 'Open'],
    cutoffHint: 'Your school association or league may publish its own date (in India, for example SGFI, CBSE or your state association) — check its latest rules.',
    terms: TERMS_COMMON,
  },
  'gulf-british': {
    id: 'gulf-british', name: 'Gulf — British curriculum', flag: '🇦🇪', country: 'QA',
    classLadder: ['FS1', 'FS2', ...range('Year', 1, 13)],
    graduating: ['Year 13', 'Year 11'],
    schoolYearStartMonth: 8,
    // British-curriculum schools usually follow England's 31 Aug rule (BSME / FOBISIA — verify).
    ageCutoff: 'aug31',
    ageBands: ['U11', 'U13', 'U15', 'U19', 'Open'],
    cutoffHint: 'British-curriculum schools usually count age on 31 August at the start of the school year (check your association, e.g. BSME or FOBISIA).',
    terms: TERMS_COMMON,
  },
  'gulf-indian': {
    id: 'gulf-indian', name: 'Gulf — Indian curriculum', flag: '🇦🇪', country: 'AE',
    classLadder: ['KG1', 'KG2', ...range('Grade', 1, 12)],
    graduating: ['Grade 12', 'Grade 10'],
    schoolYearStartMonth: 4,
    ageCutoff: 'dec31',
    ageBands: ['U14', 'U17', 'U19', 'Open'],
    cutoffHint: 'CBSE and other boards publish their own cut-off date for school games — check the latest rules.',
    terms: TERMS_COMMON,
  },
  uk: {
    id: 'uk', name: 'United Kingdom', flag: '🇬🇧', country: 'GB',
    classLadder: ['Reception', ...range('Year', 1, 13)],
    graduating: ['Year 13', 'Year 11'],
    schoolYearStartMonth: 9,
    ageCutoff: 'aug31',
    // ESAA athletics groups (Junior Y8–9, Inter Y10–11, Senior Y12–13 — verify).
    ageBands: ['U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U18', 'Junior', 'Inter', 'Senior', 'Open'],
    cutoffHint: 'In England and Wales, school sport counts age on 31 August at the start of the school year (ESAA, ESFA — check your association).',
    terms: TERMS_COMMON,
  },
  sg: {
    id: 'sg', name: 'Singapore', flag: '🇸🇬', country: 'SG',
    classLadder: [...range('Primary', 1, 6), ...range('Secondary', 1, 5), 'JC1', 'JC2'],
    graduating: ['Secondary 4', 'Secondary 5', 'JC2'],
    schoolYearStartMonth: 1,
    ageCutoff: 'dec31',
    // NSG divisions go by birth year: C = 14 and under, B = 16 and under, A = 18 and under on 31 Dec (verify).
    ageBands: ['C Division', 'B Division', 'A Division', 'Open'],
    cutoffHint: 'NSG divisions go by year of birth, which is the age on 31 December — e.g. C Division is 14 and under on 31 December.',
    terms: TERMS_COMMON,
  },
  my: {
    id: 'my', name: 'Malaysia', flag: '🇲🇾', country: 'MY',
    classLadder: [...range('Year', 1, 6), ...range('Form', 1, 5), 'Lower 6', 'Upper 6'],
    graduating: ['Form 5', 'Upper 6'],
    schoolYearStartMonth: 1,
    ageCutoff: 'dec31',
    ageBands: ['U12', 'U15', 'U18', 'Open'],
    cutoffHint: 'School sport (MSSM) groups go by year of birth, which is the age on 31 December — check your state’s rules.',
    terms: TERMS_COMMON,
  },
  au: {
    id: 'au', name: 'Australia', flag: '🇦🇺', country: 'AU',
    classLadder: ['Prep', ...range('Year', 1, 12)],
    graduating: ['Year 12'],
    schoolYearStartMonth: 1,
    ageCutoff: 'dec31',
    ageBands: ['10–12 years', '12 & Under', '13–15 years', '16 & Under', '19 & Under', 'Open'],
    cutoffHint: 'School Sport Australia counts age on 31 December of the competition year (12 & Under = 12 or younger that day) — check your state’s rules.',
    terms: { ...TERMS_COMMON, sportsDay: 'Carnival' },
  },
  us: {
    id: 'us', name: 'United States', flag: '🇺🇸', country: 'US',
    classLadder: ['Kindergarten', ...range('Grade', 1, 12)],
    graduating: ['Grade 12'],
    schoolYearStartMonth: 8,
    // State associations set their own maximum-age dates (often 1 Aug or 1 Sep — verify).
    ageCutoff: 'sep1',
    ageBands: ['Grades 9–12', 'Grades 6–8', '12 & Under', '14 & Under', 'Open'],
    gradeEligibility: true,
    cutoffHint: 'State associations set their own age limits. Grade events (Grades 9–12) use each student’s grade on the meet day from the school’s class timeline.',
    terms: { fixtures: 'Schedule', match: 'Game', pitch: 'Field', sportsDay: 'Field day', interHouse: 'Intramural', house: 'House' },
  },
};

export const MARKET_ORDER: MarketId[] = ['in', 'gulf-indian', 'gulf-british', 'uk', 'sg', 'my', 'au', 'us'];
export const FALLBACK_MARKET: MarketId = 'in';

export const isMarket = (m: unknown): m is MarketId => typeof m === 'string' && m in MARKETS;
export const marketFor = (m: string | null | undefined): MarketPreset => MARKETS[isMarket(m) ? m : FALLBACK_MARKET];

/** The usual school market for a country. UAE → Indian curriculum (most of our
 *  Gulf pilots; April school year like region AE), Qatar → British curriculum
 *  (September year like region QA). Unknown → India. */
export function marketForCountry(c: string | null | undefined): MarketId {
  switch (c) {
    case 'AE': return 'gulf-indian';
    case 'QA': return 'gulf-british';
    case 'GB': return 'uk';
    case 'SG': return 'sg';
    case 'MY': return 'my';
    case 'AU': return 'au';
    case 'US': return 'us';
    default: return 'in';
  }
}

/** A community's market. No market saved (every community before SD-153) = India. */
export const orgMarket = (org: { market?: string | null } | null | undefined): MarketId =>
  isMarket(org?.market) ? org!.market as MarketId : FALLBACK_MARKET;

/** A tournament's market: its host community's saved market, else the market of
 *  the venue time zone (SD-150 stamps it on new tournaments), else India. Never
 *  the viewer's region, so every viewer sees the same age groups. */
export function tournamentMarket(
  t: { hostOrgId?: string | null; timeZone?: string | null } | null | undefined,
  orgs: readonly { id: string; market?: string | null }[] = [],
  zoneCountry?: (zone: string) => string | undefined,
): MarketId {
  const org = t?.hostOrgId ? orgs.find((o) => o.id === t.hostOrgId) : undefined;
  if (isMarket(org?.market)) return org!.market as MarketId;
  const c = t?.timeZone && zoneCountry ? zoneCountry(t.timeZone) : undefined;
  return c ? marketForCountry(c) : FALLBACK_MARKET;
}

/** A market word, e.g. term('us', 'fixtures') → "Schedule". */
export const term = (m: MarketId | string | null | undefined, key: TermKey): string => marketFor(m).terms[key];

/* --------------------------------- classes --------------------------------- */

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };
const US_YEARS: Record<string, number> = { freshman: 9, sophomore: 10, junior: 11, senior: 12 };

/** Family words → one key. Indian "Class / Std / Standard / Grade" are one
 *  family; "Year" is another (UK Year 11 ≠ Grade 11). Bare numbers ("10",
 *  "10th") match any family. */
const FAMILY: [RegExp, string][] = [
  [/^(grade|grades|gr|class|cls|std|standard|stds)\.?$/, 'g'],
  [/^(year|years|yr|yrs|y)\.?$/, 'y'],
  [/^(secondary|sec|s)\.?$/, 'sec'],
  [/^(primary|pri|p)\.?$/, 'p'],
  [/^(form|f)\.?$/, 'form'],
  [/^(jc|junior college)$/, 'jc'],
  [/^(kg|kindergarten|k)$/, 'kg'],
  [/^(fs|foundation stage)$/, 'fs'],
];

/** A class label's identity: { family, n } — "Class X", "Grade 10", "Std 10-A",
 *  "10th" → { 'g' | '', 10 }. Section letters ("10-A", "10 B") are ignored.
 *  undefined when the label has no number ("Reception", "Prep"). */
export function classKey(label: string | null | undefined): { family: string; n: number } | undefined {
  let s = (label ?? '').trim().toLowerCase().replace(/[()]/g, ' ').replace(/\s+/g, ' ');
  if (!s) return undefined;
  if (US_YEARS[s]) return { family: 'g', n: US_YEARS[s] };
  // strip a trailing section: "10-a", "10 a", "x-b", "10a"
  s = s.replace(/(\d|\b[ivx]+)\s*[-/ ]\s*[a-h]$/i, '$1').replace(/(\d)[a-h]$/i, '$1');
  const m = /^(.*?)\s*(\d+|[ivx]+)(?:st|nd|rd|th)?$/i.exec(s);
  if (!m) return undefined;
  const head = m[1].trim().replace(/[-.]$/, '').trim();
  const num = /^\d+$/.test(m[2]) ? Number(m[2]) : ROMAN[m[2].toLowerCase()];
  if (!num) return undefined;
  if (!head) return { family: '', n: num };
  const fam = FAMILY.find(([re]) => re.test(head));
  // A roman numeral needs a family word ("Class X"), so "Mix" isn't class 9.
  if (!fam && !/^\d+$/.test(m[2])) return undefined;
  return { family: fam ? fam[1] : head, n: num };
}

/** Do two class labels name the same class? "Grade 10" = "Class X" = "Std 10-A"
 *  = "10th"; "Year 11" ≠ "Grade 11". Exact text always matches. */
export function sameClass(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return true;
  const ka = classKey(a), kb = classKey(b);
  if (!ka || !kb || ka.n !== kb.n) return false;
  return ka.family === kb.family || !ka.family || !kb.family;
}

/** The class after `standard` in the market's ladder ("Primary 6" → "Secondary 1",
 *  "Year 13" → undefined). `undefined` = the top of the ladder: there is no next
 *  class, the student graduates or leaves — never an invented "Year 14". */
export function nextClassInLadder(standard: string, market: MarketId | string | null | undefined): string | null | undefined {
  const ladder = marketFor(market).classLadder;
  const i = ladder.findIndex((c) => sameClass(c, standard));
  if (i < 0) return null; // not on this ladder — caller falls back
  return i + 1 < ladder.length ? ladder[i + 1] : undefined;
}

/** The highest class a family has anywhere (Grade 12, Year 13, Secondary 5,
 *  JC 2…), so rollover can refuse "Grade 13" / "Year 14". */
const FAMILY_TOP: Record<string, number> = { g: 12, y: 13, sec: 5, p: 6, form: 6, jc: 2, kg: 2, fs: 2 };
export const isBeyondTop = (label: string): boolean => {
  const k = classKey(label);
  return !!k && FAMILY_TOP[k.family] !== undefined && k.n > FAMILY_TOP[k.family];
};

/* ------------------------------ sport names ------------------------------ */

/**
 * Display names that differ by market (ids never change). In the US "football"
 * is American football and "hockey" is ice hockey, so our sports show as Soccer
 * and Field hockey there. Ready for the future ids `american_football` and
 * `ice_hockey` (not built yet): they read "Football" / "Hockey" in the US and
 * "American football" / "Ice hockey" everywhere else.
 */
const SPORT_NAMES: Partial<Record<MarketId, Record<string, string>>> = {
  us: { football: 'Soccer', hockey: 'Field hockey', american_football: 'Football', ice_hockey: 'Hockey' },
};
const SPORT_NAMES_ELSEWHERE: Record<string, string> = { american_football: 'American football', ice_hockey: 'Ice hockey' };
/** Reserved for the new sports — do not reuse for anything else. */
export const RESERVED_SPORT_IDS = ['american_football', 'ice_hockey'] as const;

export function sportDisplayName(sportId: string, standard: string, market: MarketId | string | null | undefined): string {
  return SPORT_NAMES[isMarket(market) ? market : FALLBACK_MARKET]?.[sportId] ?? SPORT_NAMES_ELSEWHERE[sportId] ?? standard;
}
