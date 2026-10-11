// SD-153 (international I-2a): school-sport market presets — graduating class,
// class ladders, school-year age cut-offs, age bands beyond "U14", terms and
// US sport names. India must behave exactly as before.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  MARKETS, MARKET_ORDER, marketForCountry, orgMarket, tournamentMarket, term, classKey, sameClass,
  nextClassInLadder, sportDisplayName, RESERVED_SPORT_IDS, isMarket,
} from '../src/core/markets.ts';
import {
  graduatingStandardOf, isGraduatingStandard, graduationWarning, nextStandard, suggestedGraduatingStandard, DEFAULT_GRADUATING_STANDARD,
} from '../src/core/org.ts';
import { ageCutoff, ageBasisOptions, AGE_BASIS_OPTIONS, isBoardCutoff } from '../src/core/age.ts';
import { ageBandOf, fitsBand, ageGroupsFor, AGE_GROUPS as DIV_AGE_GROUPS, bandRule, gradeNumber } from '../src/core/divisions.ts';
import { eligibleFor, ageLimit, trackEventsFor } from '../src/data/results/athletics.ts';
import { ageGroupFor } from '../src/data/results/entries.ts';
import { REGIONS, countryOfZone } from '../src/core/region.ts';
import type { Organization } from '../src/core/types.ts';

const school = (o: Partial<Organization> = {}): Organization => ({ id: 'o1', name: 'Hillview', type: 'School', members: [], ...o });

describe('markets', () => {
  test('every country maps to a market; India is the fallback', () => {
    assert.equal(marketForCountry('IN'), 'in');
    assert.equal(marketForCountry('AE'), 'gulf-indian');
    assert.equal(marketForCountry('QA'), 'gulf-british');
    assert.equal(marketForCountry('GB'), 'uk');
    assert.equal(marketForCountry('SG'), 'sg');
    assert.equal(marketForCountry('MY'), 'my');
    assert.equal(marketForCountry('AU'), 'au');
    assert.equal(marketForCountry('US'), 'us');
    assert.equal(marketForCountry('DE'), 'in');
    assert.equal(marketForCountry(undefined), 'in');
    assert.equal(MARKET_ORDER.length, Object.keys(MARKETS).length);
  });
  test('school-year months follow the region records', () => {
    for (const m of MARKET_ORDER) {
      const region = REGIONS[MARKETS[m].country];
      if (m === 'gulf-british') continue; // late-August start, region QA says September
      assert.equal(MARKETS[m].schoolYearStartMonth, region.schoolYearStartMonth, m);
    }
  });
  test('a community with no market is India; a saved one wins', () => {
    assert.equal(orgMarket({}), 'in');
    assert.equal(orgMarket({ market: 'nonsense' }), 'in');
    assert.equal(orgMarket({ market: 'uk' }), 'uk');
  });
  test('a tournament: host community market, else venue zone, else India', () => {
    const orgs = [{ id: 'o1', market: 'au' }, { id: 'o2' }];
    assert.equal(tournamentMarket({ hostOrgId: 'o1', timeZone: 'Europe/London' }, orgs, countryOfZone), 'au');
    assert.equal(tournamentMarket({ hostOrgId: 'o2', timeZone: 'Europe/London' }, orgs, countryOfZone), 'uk');
    assert.equal(tournamentMarket({ timeZone: 'America/Chicago' }, [], countryOfZone), 'us');
    assert.equal(tournamentMarket({}, [], countryOfZone), 'in'); // every older tournament
    assert.equal(tournamentMarket({ timeZone: 'Asia/Kolkata' }, [], countryOfZone), 'in');
  });
  test('terms: a small glossary', () => {
    assert.equal(term('in', 'fixtures'), 'Fixtures');
    assert.equal(term('us', 'fixtures'), 'Schedule');
    assert.equal(term('us', 'pitch'), 'Field');
    assert.equal(term('us', 'sportsDay'), 'Field day');
    assert.equal(term('au', 'sportsDay'), 'Carnival');
    assert.equal(term('uk', 'interHouse'), 'Inter-house');
    assert.equal(term(undefined, 'match'), 'Match');
  });
  test('US sport names are display-only; ids are reserved for the new sports', () => {
    assert.equal(sportDisplayName('football', 'Football', 'us'), 'Soccer');
    assert.equal(sportDisplayName('hockey', 'Hockey', 'us'), 'Field hockey');
    assert.equal(sportDisplayName('football', 'Football', 'in'), 'Football');
    assert.equal(sportDisplayName('football', 'Football', 'au'), 'Football');
    assert.equal(sportDisplayName('hockey', 'Hockey', 'uk'), 'Hockey');
    assert.equal(sportDisplayName('cricket', 'Cricket', 'us'), 'Cricket');
    assert.equal(sportDisplayName('american_football', 'X', 'us'), 'Football');
    assert.equal(sportDisplayName('american_football', 'X', 'uk'), 'American football');
    assert.equal(sportDisplayName('ice_hockey', 'X', 'us'), 'Hockey');
    assert.equal(sportDisplayName('ice_hockey', 'X', 'in'), 'Ice hockey');
    assert.deepEqual([...RESERVED_SPORT_IDS], ['american_football', 'ice_hockey']);
    assert.ok(!isMarket('US'));
  });
});

describe('graduating class', () => {
  test('India keeps the silent Grade 10 default', () => {
    assert.equal(DEFAULT_GRADUATING_STANDARD, 'Grade 10');
    assert.equal(graduatingStandardOf(school()), 'Grade 10');
    assert.equal(graduatingStandardOf(school({ market: 'in' })), 'Grade 10');
    assert.equal(graduatingStandardOf(school({ type: 'College' })), undefined);
  });
  test('other markets have no silent default — the school is asked, prefilled', () => {
    assert.equal(graduatingStandardOf(school({ market: 'uk' })), undefined);
    assert.equal(graduatingStandardOf(school({ market: 'uk', graduatingStandard: 'Year 11' })), 'Year 11');
    assert.equal(suggestedGraduatingStandard('uk'), 'Year 13');
    assert.equal(suggestedGraduatingStandard('gulf-british'), 'Year 13');
    assert.equal(suggestedGraduatingStandard('gulf-indian'), 'Grade 12');
    assert.equal(suggestedGraduatingStandard('us'), 'Grade 12');
    assert.equal(suggestedGraduatingStandard('sg'), 'Secondary 4');
    assert.ok(MARKETS.sg.graduating.includes('Secondary 5'));
    assert.equal(suggestedGraduatingStandard('au'), 'Year 12');
    assert.equal(suggestedGraduatingStandard('in'), 'Grade 10');
    assert.ok(MARKETS.uk.graduating.includes('Year 11'));
  });
  test('matching is by class, not exact text', () => {
    const india = school();
    for (const s of ['Grade 10', 'grade 10', 'Class 10', 'Class X', 'Std 10-A', 'Class X-B', '10th', '10', 'Grade 10 A', 'Grade 10A', 'Standard X'])
      assert.equal(isGraduatingStandard(india, s), true, s);
    for (const s of ['Grade 9', 'Class IX', 'Year 10', 'Grade 11', '', undefined]) assert.equal(isGraduatingStandard(india, s), false, String(s));
    const uk = school({ market: 'uk', graduatingStandard: 'Year 13' });
    assert.equal(isGraduatingStandard(uk, 'Year 13'), true);
    assert.equal(isGraduatingStandard(uk, 'Y13'), true);
    assert.equal(isGraduatingStandard(uk, 'Yr 13'), true);
    assert.equal(isGraduatingStandard(uk, 'Grade 13'), false);
    assert.equal(isGraduatingStandard(school({ market: 'us', graduatingStandard: 'Grade 12' }), 'Senior'), true);
    assert.equal(isGraduatingStandard(school({ market: 'uk' }), 'Year 13'), false); // unset
  });
  test('rollover warns when the graduating class is unset or matches nobody', () => {
    assert.equal(graduationWarning(school({ market: 'uk' }), ['Year 12', 'Year 13']), 'unset');
    assert.equal(graduationWarning(school({ market: 'uk', graduatingStandard: 'Grade 10' }), ['Year 12', 'Year 13']), 'unknown');
    assert.equal(graduationWarning(school({ market: 'uk', graduatingStandard: 'Year 13' }), ['Year 12', 'Year 13']), undefined);
    assert.equal(graduationWarning(school(), ['Class X-A', 'Class 9']), undefined);
    assert.equal(graduationWarning(school({ type: 'College' }), ['Year 1']), 'unset');
    assert.equal(graduationWarning(school({ market: 'uk', graduatingStandard: 'Year 13' }), []), undefined);
  });
});

describe('class ladders and the next class', () => {
  test('India: increments as before, keeping the label style', () => {
    assert.equal(nextStandard('Grade 9'), 'Grade 10');
    assert.equal(nextStandard('Class 9-A'), 'Class 10-A');
    assert.equal(nextStandard('Year 1'), 'Year 2');
    assert.equal(nextStandard('10'), '11');
    assert.equal(nextStandard('Class IX'), 'Class IX'); // roman: typed by hand, as before
    assert.equal(nextStandard('Nursery'), 'Nursery');
  });
  test('never invents a class past the top', () => {
    assert.equal(nextStandard('Grade 12'), '');
    assert.equal(nextStandard('Year 13', 'uk'), '');
    assert.equal(nextStandard('Year 13'), ''); // even on the India ladder
    assert.equal(nextStandard('Year 12', 'au'), '');
    assert.equal(nextStandard('JC2', 'sg'), '');
    assert.equal(nextStandard('Upper 6', 'my'), '');
    assert.equal(nextStandard('Grade 12', 'us'), '');
    assert.equal(nextStandard('Year 12', 'uk'), 'Year 13');
  });
  test('follows the ladder where the name changes', () => {
    assert.equal(nextStandard('Primary 6', 'sg'), 'Secondary 1');
    assert.equal(nextStandard('Secondary 5', 'sg'), 'JC1');
    assert.equal(nextStandard('Reception', 'uk'), 'Year 1');
    assert.equal(nextStandard('FS2', 'gulf-british'), 'Year 1');
    assert.equal(nextStandard('KG2', 'gulf-indian'), 'Grade 1');
    assert.equal(nextStandard('Prep', 'au'), 'Year 1');
    assert.equal(nextStandard('Kindergarten', 'us'), 'Grade 1');
    assert.equal(nextStandard('Year 6', 'my'), 'Form 1');
    assert.equal(nextStandard('Form 5', 'my'), 'Lower 6');
    assert.equal(nextStandard('Year 7-B', 'uk'), 'Year 8-B');
  });
  test('class keys', () => {
    assert.deepEqual(classKey('Class X-B'), { family: 'g', n: 10 });
    assert.deepEqual(classKey('Year 11'), { family: 'y', n: 11 });
    assert.deepEqual(classKey('Sophomore'), { family: 'g', n: 10 });
    assert.equal(classKey('Reception'), undefined);
    assert.equal(classKey('Mix'), undefined);
    assert.ok(sameClass('Secondary 4', 'Sec 4'));
    assert.ok(!sameClass('Secondary 4', 'Primary 4'));
    assert.equal(nextClassInLadder('Nursery', 'in'), null);
  });
});

describe('age cut-offs', () => {
  test('31 Aug at the start of the school year (UK / British-curriculum Gulf)', () => {
    assert.equal(ageCutoff('aug31', '2027-06-15'), '2026-08-31'); // a June 2027 meet
    assert.equal(ageCutoff('aug31', '2026-09-20'), '2026-08-31');
    assert.equal(ageCutoff('aug31', '2026-08-31'), '2026-08-31');
    assert.equal(ageCutoff('aug31', '2026-08-30'), '2025-08-31');
    assert.equal(ageCutoff('aug31', '2027-01-10'), '2026-08-31');
    assert.ok(isBoardCutoff(ageCutoff('aug31', '2027-06-15'))); // last day of a month — privacy rule holds
  });
  test('1 Sep (US default)', () => {
    assert.equal(ageCutoff('sep1', '2027-04-01'), '2026-09-01');
    assert.equal(ageCutoff('sep1', '2026-09-01'), '2026-09-01');
    assert.equal(ageCutoff('sep1', '2026-08-31'), '2025-09-01');
  });
  test('existing bases unchanged', () => {
    assert.equal(ageCutoff(undefined, '2026-11-20'), '2026-12-31');
    assert.equal(ageCutoff('dec31', '2027-06-15'), '2027-12-31');
    assert.equal(ageCutoff('2026-10-01', '2026-11-20'), '2026-10-01');
  });
  test('region and market cut-offs are wired', () => {
    assert.equal(MARKETS.uk.ageCutoff, REGIONS.GB.ageCutoff);
    assert.equal(MARKETS.us.ageCutoff, REGIONS.US.ageCutoff);
    assert.equal(MARKETS.in.ageCutoff, 'dec31');
    assert.equal(MARKETS['gulf-british'].ageCutoff, 'aug31');
    assert.equal(MARKETS.sg.ageCutoff, 'dec31');
    assert.equal(MARKETS.au.ageCutoff, 'dec31');
  });
  test('cut-off choices: India = the standard three; UK leads with 31 Aug', () => {
    assert.deepEqual(ageBasisOptions(MARKETS.in.ageCutoff, 'dec31'), AGE_BASIS_OPTIONS);
    assert.equal(ageBasisOptions(MARKETS.uk.ageCutoff, 'dec31')[0].value, 'aug31');
    assert.equal(ageBasisOptions(MARKETS.us.ageCutoff)[0].value, 'sep1');
    assert.equal(ageBasisOptions('dec31', 'aug31')[0].value, 'aug31'); // keeps a saved school-year basis
  });
  test('help text has no India-only wording outside India', () => {
    for (const m of MARKET_ORDER) {
      if (m === 'in' || m === 'gulf-indian') continue;
      assert.ok(!/SGFI|CBSE|circular/i.test(MARKETS[m].cutoffHint), m);
    }
    assert.ok(!/circular/i.test(MARKETS.in.cutoffHint));
  });
});

describe('age bands beyond U-labels', () => {
  test('India bands unchanged', () => {
    assert.deepEqual([...ageGroupsFor('in')], [...DIV_AGE_GROUPS]);
    assert.deepEqual([...ageGroupsFor(undefined)], ['U11', 'U14', 'U16', 'U19', 'Open']);
  });
  test('parses the market labels', () => {
    assert.deepEqual(ageBandOf('U14'), { maxAge: 13 });
    assert.deepEqual(ageBandOf('Under 14'), { maxAge: 13 });
    assert.deepEqual(ageBandOf('12 & Under'), { maxAge: 12 });
    assert.deepEqual(ageBandOf('12 and under'), { maxAge: 12 });
    assert.deepEqual(ageBandOf('12U'), { maxAge: 12 });
    assert.deepEqual(ageBandOf('10–12 years'), { minAge: 10, maxAge: 12 });
    assert.deepEqual(ageBandOf('13-15'), { minAge: 13, maxAge: 15 });
    assert.deepEqual(ageBandOf('35+'), { minAge: 35 });
    assert.deepEqual(ageBandOf('C Division'), { maxAge: 14 });
    assert.deepEqual(ageBandOf('B Div'), { maxAge: 16 });
    assert.deepEqual(ageBandOf('A Division'), { maxAge: 18 });
    assert.deepEqual(ageBandOf('Junior'), { minAge: 12, maxAge: 13 });
    assert.deepEqual(ageBandOf('Inter'), { minAge: 14, maxAge: 15 });
    assert.deepEqual(ageBandOf('Grades 9–12'), { minGrade: 9, maxGrade: 12 });
    assert.deepEqual(ageBandOf('Year 7'), { minGrade: 7, maxGrade: 7 });
    assert.deepEqual(ageBandOf('Year 7-8'), { minGrade: 7, maxGrade: 8 });
    assert.deepEqual(ageBandOf('Open'), {});
    assert.deepEqual(ageBandOf('Staff'), {});
    for (const m of MARKET_ORDER) for (const b of MARKETS[m].ageBands) if (b !== 'Open') assert.notDeepEqual(ageBandOf(b), {}, `${m} ${b}`);
  });
  test('min ages, max ages and grades', () => {
    const band = ageBandOf('10–12 years');
    assert.equal(fitsBand(band, { age: 9 }), false);
    assert.equal(fitsBand(band, { age: 10 }), true);
    assert.equal(fitsBand(band, { age: 12 }), true);
    assert.equal(fitsBand(band, { age: 13 }), false);
    assert.equal(fitsBand(band, {}), true); // unknown never excludes
    const hs = ageBandOf('Grades 9–12');
    assert.equal(fitsBand(hs, { grade: 'Grade 10' }), true);
    assert.equal(fitsBand(hs, { grade: 'Freshman' }), true);
    assert.equal(fitsBand(hs, { grade: 'Grade 8' }), false);
    assert.equal(fitsBand(hs, { age: 30 }), true); // grade bands don't check age
    assert.equal(gradeNumber('Grade 10-A'), 10);
    assert.equal(bandRule('12 & Under'), '12 or younger on the cut-off day');
    assert.equal(bandRule('Grades 9–12'), 'grades 9 to 12 on the meet day');
    assert.equal(bandRule('Open'), undefined);
  });
  test('athletics eligibility understands them (U-labels unchanged)', () => {
    assert.equal(eligibleFor({ age: 'U14', gender: 'M' }, { gender: 'M', age: 13 }), true);
    assert.equal(eligibleFor({ age: 'U14', gender: 'M' }, { gender: 'M', age: 14 }), false);
    assert.equal(eligibleFor({ age: '12 & Under', gender: 'F' }, { gender: 'F', age: 12 }), true);
    assert.equal(eligibleFor({ age: '12 & Under', gender: 'F' }, { gender: 'F', age: 13 }), false);
    assert.equal(eligibleFor({ age: '10–12 years', gender: 'F' }, { gender: 'F', age: 9 }), false);
    assert.equal(eligibleFor({ age: 'C Division', gender: 'M' }, { gender: 'M', age: 14 }), true);
    assert.equal(eligibleFor({ age: 'C Division', gender: 'M' }, { gender: 'M', age: 15 }), false);
    assert.equal(eligibleFor({ age: 'Inter', gender: 'M' }, { gender: 'M', age: 13 }), false);
    assert.equal(eligibleFor({ age: 'Grades 9–12', gender: 'M' }, { gender: 'M', age: 15, grade: 'Grade 8' }), false);
    assert.equal(eligibleFor({ age: 'Grades 9–12', gender: 'M' }, { gender: 'M', age: 15, grade: 'Grade 9' }), true);
    assert.equal(eligibleFor({ age: 'Grades 9–12', gender: 'M' }, { gender: 'M', age: 15 }), true);
    assert.equal(eligibleFor({ age: 'Open' }, { age: 40 }), true);
    assert.equal(ageLimit('U14'), 14);
    assert.equal(ageLimit('12 & Under'), 13);
    assert.equal(ageLimit('Open'), undefined);
    assert.equal(ageGroupFor(12, MARKETS.au.ageBands.filter((b) => !b.includes('–'))), '12 & Under');
  });
  test('market bands run a sensible track programme', () => {
    const keys = (age: string) => trackEventsFor({ age, gender: 'M' }).map((e) => e.discipline);
    assert.deepEqual(keys('U14'), keys('U14')); // stable
    assert.deepEqual(keys('12 & Under'), keys('U14'));
    assert.deepEqual(keys('Junior'), keys('U14'));
    assert.deepEqual(keys('C Division'), keys('U16'));
    assert.deepEqual(keys('Open'), keys('Open'));
    assert.ok(keys('Grades 9–12').includes('ath.110mh'));
  });
});
