/**
 * SD-129 — printable sheets for a meet (A4, one HTML document each): start
 * lists, heat sheets (lanes / order, bibs, houses, blank time & place columns
 * for the lane judges), field-event cards (attempt grids officials fill by
 * hand), results sheets (places, marks, wind, Q / q / PB / records), the house
 * (medal) table and the timetable. Pure HTML strings — printed on the web with
 * window.print(), on the phone with expo-print (core/printSheet.ts).
 */
import { formatMark } from './marks.ts';
import { categoryLabel, type DisciplineDef, type PhaseFormat, type RankedEntry, type ResultEntry, type ResultFlag } from './model.ts';
import { SESSION_LABEL, hhmm, dayKey, dayLabel, type TimetableDay, type TimetableItem } from './timetable.ts';

export interface MeetHeader {
  /** the meet / tournament name */
  name: string;
  host?: string;
  city?: string;
  /** "12–13 Nov 2026" */
  dates?: string;
  /** an http(s) / data: image URL (anything else is left out) */
  logoUrl?: string;
}

export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const CSS = `
@page { size: A4 portrait; margin: 12mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #111; font: 11pt/1.35 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
.page { max-width: 186mm; margin: 0 auto; padding: 12px; }
.land .page { max-width: 273mm; }
header.meet { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 10px; }
header.meet img { width: 44px; height: 44px; object-fit: contain; }
header.meet .n { font-size: 15pt; font-weight: 800; }
header.meet .s { font-size: 9pt; color: #444; }
h1 { font-size: 14pt; margin: 6px 0 2px; }
h2 { font-size: 12pt; margin: 14px 0 4px; break-after: avoid; }
.sub { color: #444; font-size: 9.5pt; margin-bottom: 6px; }
table { width: 100%; border-collapse: collapse; margin: 4px 0 10px; break-inside: auto; }
tr { break-inside: avoid; }
th, td { border: 1px solid #999; padding: 4px 5px; text-align: left; vertical-align: middle; font-size: 10pt; }
th { background: #eee; font-size: 9pt; text-transform: uppercase; letter-spacing: .3px; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
td.c, th.c { text-align: center; }
td.blank { min-width: 22mm; height: 9mm; }
td.box { width: 12mm; height: 10mm; }
.tries { display: flex; gap: 2px; justify-content: center; }
.tries span { display: inline-block; width: 4.5mm; height: 6mm; border: 1px solid #bbb; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 4px; margin-right: 4px; vertical-align: middle; }
.flags { font-weight: 700; font-size: 9pt; }
.sign { display: flex; gap: 24px; margin-top: 14px; font-size: 9.5pt; }
.sign div { flex: 1; border-top: 1px solid #111; padding-top: 3px; }
.note { font-size: 9pt; color: #444; }
.sheet + .sheet { break-before: page; }
footer { margin-top: 10px; font-size: 8pt; color: #666; border-top: 1px solid #ccc; padding-top: 4px; }
.bar { position: sticky; top: 0; background: #f4f4f4; border-bottom: 1px solid #ccc; padding: 8px 12px; display: flex; gap: 8px; align-items: center; font: 14px sans-serif; }
.bar button { font: 600 14px sans-serif; padding: 8px 14px; border-radius: 8px; border: 1px solid #111; background: #111; color: #fff; cursor: pointer; }
@media print { .bar { display: none; } .page { padding: 0; max-width: none; } }
@media screen and (max-width: 600px) { body { font-size: 10pt; } th, td { padding: 3px; font-size: 9pt; } .page { padding: 8px; } }
`;

/** The meet header block. */
export function meetHeaderHtml(h: MeetHeader): string {
  const logo = h.logoUrl && /^(https?:|data:image\/)/.test(h.logoUrl) ? `<img src="${esc(h.logoUrl)}" alt="">` : '';
  const sub = [h.host, h.city, h.dates].filter(Boolean).map(esc).join(' · ');
  return `<header class="meet">${logo}<div><div class="n">${esc(h.name)}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div></header>`;
}

/** A whole printable document: one or more sheets, each under the meet header. */
export function sheetDoc(o: { title: string; header: MeetHeader; sheets: string[]; landscape?: boolean; printedAt?: Date; toolbar?: boolean }): string {
  const at = o.printedAt ?? new Date();
  const foot = `<footer>Printed ${esc(at.toDateString())} ${esc(hhmm(at))} · SportnNote</footer>`;
  const body = o.sheets.map((s) => `<section class="sheet page">${meetHeaderHtml(o.header)}${s}${foot}</section>`).join('');
  const bar = o.toolbar === false ? '' : `<div class="bar"><button onclick="window.print()">🖨 Print / Save as PDF</button><span>${esc(o.title)}</span></div>`;
  const land = o.landscape ? '<style>@page { size: A4 landscape; }</style>' : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(o.title)}</title><style>${CSS}</style>${land}</head><body class="${o.landscape ? 'land' : ''}">${bar}${body}</body></html>`;
}

/* ------------------------------- the sheets ------------------------------- */

export interface PhaseInfoForPrint {
  /** "100 m U14 Boys" */
  eventTitle: string;
  /** "Heats" / "Final" */
  roundLabel: string;
  def: DisciplineDef;
  format?: Pick<PhaseFormat, 'category' | 'implement' | 'bar' | 'board' | 'races'>;
  /** scheduled start (ISO) and area */
  at?: string;
  area?: string;
  /** how a heat / race is named ("Heat 2", "Final A") */
  heatName?: (h: number) => string;
}

const teamCell = (t?: { name: string; colorHex?: string }) => (t ? `${t.colorHex && /^#[0-9a-f]{3,8}$/i.test(t.colorHex) ? `<span class="dot" style="background:${t.colorHex}"></span>` : ''}${esc(t.name)}` : '');
const whenLine = (p: PhaseInfoForPrint) => [categoryLabel(p.format?.category), p.at ? `${dayLabel(dayKey(p.at))} ${new Date(p.at).getFullYear()} ${hhmm(p.at)}` : '', p.area, p.format?.implement ? `Implement ${p.format.implement}` : '', p.format?.board ? `Board ${p.format.board} m` : ''].filter(Boolean).map(esc).join(' · ');
const byHeat = (entries: ResultEntry[]) => {
  const m = new Map<number, ResultEntry[]>();
  for (const e of entries) m.set(e.heat, [...(m.get(e.heat) ?? []), e]);
  return [...m].sort((a, b) => a[0] - b[0]);
};
const legs = (e: ResultEntry) => (e.result.members?.length ? `<div class="note">${e.result.members.filter((m) => !m.cox).slice(0, 6).map((m) => esc(m.name)).join(' · ')}</div>` : '');

/** A start list / heat sheet: per heat, the lane (or order), bib, name, house
 *  and blank columns for the time and place (lane judges / timekeepers). */
export function startListSheet(p: PhaseInfoForPrint, entries: ResultEntry[], opts: { judges?: boolean } = {}): string {
  const lanes = !!p.def.lanes && p.def.capture === 'single';
  const judges = opts.judges !== false;
  const heats = byHeat(entries);
  const name = p.heatName ?? ((h: number) => (heats.length > 1 ? `Heat ${h}` : ''));
  const bibs = entries.some((e) => e.result.bib);
  const body = heats.map(([h, list]) => {
    const rows = [...list].sort((a, b) => (lanes ? (a.result.lane ?? 99) - (b.result.lane ?? 99) : (a.result.order ?? 99) - (b.result.order ?? 99)) || a.name.localeCompare(b.name));
    const title = name(h);
    return `${title ? `<h2>${esc(title)} <span class="note">(${rows.length})</span></h2>` : ''}<table><thead><tr><th class="c">${lanes ? 'Lane' : 'Order'}</th>${bibs ? '<th>Bib</th>' : ''}<th>Name</th><th>House / team</th>${judges ? '<th>Time / mark</th><th class="c">Place</th>' : ''}</tr></thead><tbody>${
      rows.map((e) => `<tr><td class="c">${esc((lanes ? e.result.lane : e.result.order) ?? '')}</td>${bibs ? `<td>${esc(e.result.bib ?? '')}</td>` : ''}<td>${esc(e.name)}${legs(e)}</td><td>${teamCell(e.team)}</td>${judges ? '<td class="blank"></td><td class="box"></td>' : ''}</tr>`).join('')
    }</tbody></table>`;
  }).join('');
  return `<h1>${esc(p.eventTitle)} — ${esc(p.roundLabel)}</h1><div class="sub">${whenLine(p)}</div>${body || '<p class="note">No entries yet.</p>'}${p.def.capture === 'single' ? '<div class="sign"><div>Starter / referee</div><div>Chief timekeeper</div></div>' : '<div class="sign"><div>Chief judge</div><div>Recorder</div></div>'}`;
}

/** A field-event card for the officials: horizontal jumps / throws — the
 *  trials (3 + 3) with a box for each; vertical jumps — every bar height with
 *  three tries (O / X / –); weightlifting — 3 snatch + 3 clean & jerk. */
export function fieldCardSheet(p: PhaseInfoForPrint, entries: ResultEntry[]): string {
  const d = p.def;
  const heats = byHeat(entries);
  let head: string, cells: string;
  if (d.capture === 'heights') {
    const bar = (p.format?.bar?.length ? p.format.bar : []).slice(0, 14);
    const cols = bar.length ? bar.map((h) => formatMark(h, d)) : Array.from({ length: 10 }, () => '');
    head = cols.map((c) => `<th class="c">${esc(c) || '&nbsp;&nbsp;&nbsp;&nbsp;'}</th>`).join('') + '<th>Best</th><th class="c">Pl</th>';
    cells = cols.map(() => '<td><div class="tries"><span></span><span></span><span></span></div></td>').join('') + '<td class="blank"></td><td class="box"></td>';
  } else if (d.capture === 'lifts') {
    head = ['S1', 'S2', 'S3', 'CJ1', 'CJ2', 'CJ3'].map((c) => `<th class="c">${c}</th>`).join('') + '<th>Total</th><th class="c">Pl</th>';
    cells = Array.from({ length: 6 }, () => '<td class="box"></td>').join('') + '<td class="blank"></td><td class="box"></td>';
  } else {
    const n = (d.attempts?.count ?? 3) + (d.attempts?.extra ?? 3);
    const wind = d.wind === 'attempt';
    head = Array.from({ length: n }, (_, i) => `<th class="c">${i + 1}${wind ? '<br><span class="note">wind</span>' : ''}</th>`).join('') + '<th>Best</th><th class="c">Pl</th>';
    cells = Array.from({ length: n }, (_, i) => `<td class="box"${i === (d.attempts?.count ?? 3) - 1 ? ' style="border-right:3px double #111"' : ''}></td>`).join('') + '<td class="blank"></td><td class="box"></td>';
  }
  const name = p.heatName ?? ((h: number) => (heats.length > 1 ? `Group ${String.fromCharCode(64 + h)}` : ''));
  const bibs = entries.some((e) => e.result.bib);
  const body = heats.map(([h, list]) => {
    const rows = [...list].sort((a, b) => (a.result.order ?? 99) - (b.result.order ?? 99) || a.name.localeCompare(b.name));
    const title = name(h);
    return `${title ? `<h2>${esc(title)}</h2>` : ''}<table><thead><tr><th class="c">#</th>${bibs ? '<th>Bib</th>' : ''}<th>Name</th><th>House</th>${head}</tr></thead><tbody>${
      rows.map((e) => `<tr><td class="c">${esc(e.result.order ?? '')}</td>${bibs ? `<td>${esc(e.result.bib ?? '')}</td>` : ''}<td>${esc(e.name)}</td><td>${teamCell(e.team)}</td>${cells}</tr>`).join('')
    }</tbody></table>`;
  }).join('');
  const key = d.capture === 'heights' ? 'O = cleared · X = failed · – = passed. Three failures in a row: out.' : d.capture === 'lifts' ? 'Write the declared weight; circle a good lift, cross a no lift.' : `Write the mark (m), X = foul, – = pass. After trial ${d.attempts?.count ?? 3} the best ${d.attempts?.finalists ?? 8} get ${d.attempts?.extra ?? 3} more.`;
  return `<h1>${esc(p.eventTitle)} — ${esc(p.roundLabel)}</h1><div class="sub">${whenLine(p)}</div><div class="note">${esc(key)}</div>${body || '<p class="note">No entries yet.</p>'}<div class="sign"><div>Chief judge</div><div>Recorder</div></div>`;
}

const FLAG_NOTE: Partial<Record<ResultFlag, string>> = { Q: 'Q = qualified by place', q: 'q = qualified by mark', PB: 'PB = personal best', SB: 'SB = season best', MR: 'MR = meet record', SR: 'SR = school record' };

/** A results sheet: per heat (or one overall list), place, bib, name, house,
 *  the mark (with wind), the trials for a field event, and the markers; the
 *  records set are listed under it. */
export function resultsSheet(p: PhaseInfoForPrint, heats: Map<number, RankedEntry[]>, o: { overall?: boolean; official?: boolean; notes?: Map<string, string> } = {}): string {
  const d = p.def;
  const wind = d.wind === 'race' || d.wind === 'attempt';
  const attempts = d.capture === 'attempts';
  const list = [...heats].sort((a, b) => a[0] - b[0]);
  const name = p.heatName ?? ((h: number) => `Heat ${h}`);
  const used = new Set<ResultFlag>();
  const bibs = [...heats.values()].flat().some((r) => r.entry.result.bib);
  const body = list.map(([h, rows]) => {
    const head = !o.overall && list.length > 1 ? `<h2>${esc(name(h))}</h2>` : '';
    return `${head}<table><thead><tr><th class="c">Pl</th>${bibs ? '<th>Bib</th>' : ''}<th>Name</th><th>House</th>${attempts ? '<th>Trials</th>' : ''}<th class="num">Mark</th>${wind ? '<th class="num">Wind</th>' : ''}<th></th></tr></thead><tbody>${
      rows.map((r) => {
        r.flags.forEach((f) => used.add(f));
        const trials = attempts ? `<td class="note">${(r.entry.result.attempts ?? []).map((a) => (a.foul ? 'X' : a.pass ? '–' : a.mark != null ? formatMark(a.mark, d) : '')).map(esc).join(' · ')}</td>` : '';
        const mark = r.bestText || (r.status !== 'ok' ? r.status : '');
        const note = o.notes?.get(r.id);
        return `<tr><td class="c">${esc(r.position != null ? r.label : '')}</td>${bibs ? `<td>${esc(r.entry.result.bib ?? '')}</td>` : ''}<td>${esc(r.entry.name)}${legs(r.entry)}</td><td>${teamCell(r.entry.team)}</td>${trials}<td class="num">${esc(mark)}</td>${wind ? `<td class="num">${r.wind != null ? esc(`${r.wind > 0 ? '+' : r.wind < 0 ? '−' : ''}${Math.abs(r.wind).toFixed(1)}`) : ''}</td>` : ''}<td class="flags">${esc(r.flags.filter((f) => f !== 'w').join(' '))}${note ? ` <span class="note">${esc(note)}</span>` : ''}</td></tr>`;
      }).join('')
    }</tbody></table>`;
  }).join('');
  const recs = [...heats.values()].flat().filter((r) => r.flags.some((f) => f === 'MR' || f === 'SR' || f === '=MR' || f === '=SR'));
  const recLine = recs.length ? `<p><b>Records:</b> ${recs.map((r) => `${esc(r.entry.name)} ${esc(r.bestText)} (${esc(r.flags.filter((f) => /MR|SR/.test(f)).join(', '))})`).join('; ')}</p>` : '';
  const legend = [...used].map((f) => FLAG_NOTE[f]).filter(Boolean).join(' · ');
  return `<h1>${esc(p.eventTitle)} — ${esc(p.roundLabel)}${o.official ? '' : ' <span class="note">(unofficial)</span>'}</h1><div class="sub">${whenLine(p)}</div>${body || '<p class="note">No results yet.</p>'}${recLine}${legend ? `<p class="note">${esc(legend)}</p>` : ''}<div class="sign"><div>Referee</div><div>Results / recorder</div></div>`;
}

export interface TableRow { name: string; colorHex?: string; golds: number; silvers: number; bronzes: number; total: number }

/** The house (medal) table. */
export function medalTableSheet(rows: TableRow[], o: { title?: string; note?: string } = {}): string {
  const body = rows.length ? `<table><thead><tr><th class="c">#</th><th>House / team</th><th class="num">Gold</th><th class="num">Silver</th><th class="num">Bronze</th><th class="num">Points</th></tr></thead><tbody>${
    rows.map((r, i) => `<tr><td class="c">${i + 1}</td><td>${teamCell(r)}</td><td class="num">${r.golds}</td><td class="num">${r.silvers}</td><td class="num">${r.bronzes}</td><td class="num"><b>${esc(Math.round(r.total * 100) / 100)}</b></td></tr>`).join('')
  }</tbody></table>` : '<p class="note">No final has finished yet.</p>';
  return `<h1>${esc(o.title ?? 'House table')}</h1>${o.note ? `<div class="sub">${esc(o.note)}</div>` : ''}${body}`;
}

/** The timetable, day by day and session by session. */
export function timetableSheet(days: TimetableDay[], o: { unscheduled?: TimetableItem[] } = {}): string {
  const dayHtml = days.filter((d) => d.sessions.length).map((d) => `<h2>${esc(d.label)}</h2>${d.sessions.map((s) => `<table><thead><tr><th colspan="4">${esc(SESSION_LABEL[s.session])}</th></tr><tr><th class="num">Time</th><th>Event</th><th>Round</th><th>Area</th></tr></thead><tbody>${
    s.items.map((i) => `<tr><td class="num">${esc(hhmm(i.at))}</td><td>${esc(i.eventTitle)}</td><td>${esc(i.roundLabel)}${i.heats > 1 ? ` <span class="note">(${i.heats})</span>` : ''}</td><td>${esc(i.area ?? '')}</td></tr>`).join('')
  }</tbody></table>`).join('')}`).join('');
  const un = o.unscheduled?.length ? `<h2>Time to be announced</h2><table><tbody>${o.unscheduled.map((i) => `<tr><td>${esc(i.eventTitle)}</td><td>${esc(i.roundLabel)}</td></tr>`).join('')}</tbody></table>` : '';
  return `<h1>Timetable</h1>${dayHtml || '<p class="note">Nothing is scheduled yet.</p>'}${un}`;
}
