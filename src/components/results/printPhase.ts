/** SD-129 — glue between the screens and the printable sheets: the meet
 *  header from a tournament, one phase's sheets (start list / heat sheet,
 *  field card, results) and the plain ranking used by the meet booklets. */
import type { Tournament } from '../../core/types';
import {
  disciplineOf, phaseDiscipline, rankByHeat, rankEntries, qualify, withQualification, looseLegal, phaseNameOf, dayLabel, dayKey,
  sheetDoc, startListSheet, fieldCardSheet, resultsSheet,
  type DisciplineDef, type MeetHeader, type MeetPhase, type PhaseFormat, type PhaseInfoForPrint, type RankedEntry, type ResultEntry,
} from '../../data/results';
import { printSheet, type PrintOutcome } from '../../core/printSheet';

export function meetHeaderOf(t?: Pick<Tournament, 'name' | 'hostName' | 'city' | 'startDate' | 'endDate' | 'logoUrl'> | null, fallback = 'Meet'): MeetHeader {
  if (!t) return { name: fallback };
  const a = t.startDate?.slice(0, 10), b = t.endDate?.slice(0, 10);
  const dates = a ? (b && b !== a ? `${dayLabel(dayKey(new Date(a + 'T12:00:00')))} – ${dayLabel(dayKey(new Date(b + 'T12:00:00')))} ${b.slice(0, 4)}` : `${dayLabel(dayKey(new Date(a + 'T12:00:00')))} ${a.slice(0, 4)}`) : undefined;
  return { name: t.name, host: t.hostName, city: t.city, dates, logoUrl: t.logoUrl };
}

export type SheetKind = 'start' | 'card' | 'results';

/** Is this discipline filled in on an attempt card (jumps / throws / lifts)? */
export const hasCard = (def?: Pick<DisciplineDef, 'capture'> | null): boolean => !!def && (def.capture === 'attempts' || def.capture === 'heights' || def.capture === 'lifts');

/** A phase's ranking for a printed booklet — places per heat with Q / q, or
 *  one list for a timed final. (The event screen prints its own ranking, with
 *  PB / SB / record markers.) */
export function bookletRanking(f: PhaseFormat, def: DisciplineDef, entries: ResultEntry[]): { heats: Map<number, RankedEntry[]>; overall: boolean } {
  const timed = f.phase === 'final' && f.heats > 1 && def.capture === 'single' && !(f.races?.length && f.races.length > 1);
  if (timed) return { heats: new Map([[0, rankEntries(entries, def, { handLegal: looseLegal(f) })]]), overall: true };
  const byHeat = rankByHeat(entries, def, { handLegal: looseLegal(f) });
  const q = f.progression ? qualify(byHeat, def, f.progression) : null;
  return { heats: new Map([...byHeat].map(([h, rows]) => [h, q ? withQualification(rows, q) : rows])), overall: false };
}

/** Plain-ranked results can be printed for these (brackets, combined, stage
 *  races and order events print from their own event page). */
export const bookletOk = (f: PhaseFormat, def?: DisciplineDef | null): boolean =>
  !!def && !f.combined && !f.cyc && !f.carry?.length && ['single', 'attempts', 'heights', 'lifts'].includes(def.capture) && def.sport !== 'archery';

export function phasePrintInfo(p: MeetPhase, eventTitle: string, slot?: { at?: string; area?: string }): PhaseInfoForPrint | null {
  const base = disciplineOf(p.format.discipline);
  if (!base) return null;
  const def = phaseDiscipline(base, p.format);
  return { eventTitle, roundLabel: phaseNameOf(p.format), def, format: p.format, at: slot?.at, area: slot?.area };
}

/** Print one sheet document (web: a new tab + the print dialog; phone: the
 *  system print dialog, or 'failed' on an app build without printing). */
export function printDoc(title: string, header: MeetHeader, sheets: string[], o: { landscape?: boolean; autoPrint?: boolean } = {}): Promise<PrintOutcome> {
  return printSheet(sheetDoc({ title, header, sheets, landscape: o.landscape }), { autoPrint: o.autoPrint });
}

/** The sheets for one phase, as the event screen prints them. */
export function phaseSheet(kind: SheetKind, info: PhaseInfoForPrint, entries: ResultEntry[], ranked?: { heats: Map<number, RankedEntry[]>; overall: boolean; official: boolean; notes?: Map<string, string> }): string {
  if (kind === 'card') return fieldCardSheet(info, entries);
  if (kind === 'results' && ranked) return resultsSheet(info, ranked.heats, { overall: ranked.overall, official: ranked.official, notes: ranked.notes });
  return startListSheet(info, entries);
}
