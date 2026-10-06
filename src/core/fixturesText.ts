/**
 * Organiser fixtures, two ways (pure, unit-tested):
 *   • fixturesShareText — a WhatsApp message grouped by day ("📅 Sat, 12 Oct").
 *   • fixturesPrintHtml — a clean printable page (the web "Print / PDF" button).
 * Times come in already formatted by the caller (timezone-aware).
 */

export interface FixtureRow {
  /** ISO start time (sorting + day grouping); may be empty for unscheduled */
  startsAt: string;
  day: string;   // "Sat, 12 Oct"
  time: string;  // "10:00 am"
  home: string;
  away: string;
  sportIcon?: string;
  venue?: string;
  /** "Group A", "Semi-final", … */
  stage?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function byDay(rows: FixtureRow[]): Array<[string, FixtureRow[]]> {
  const sorted = [...rows].sort((a, b) => (a.startsAt || '9').localeCompare(b.startsAt || '9'));
  const out: Array<[string, FixtureRow[]]> = [];
  for (const r of sorted) {
    const day = r.day || 'Date to be confirmed';
    const last = out[out.length - 1];
    if (last && last[0] === day) last[1].push(r);
    else out.push([day, [r]]);
  }
  return out;
}

export function fixturesShareText(o: { tournament: string; rows: FixtureRow[]; link?: string; maxRows?: number }): string {
  const max = o.maxRows ?? 40;
  const rows = o.rows.slice(0, max);
  const lines = [`🏆 ${o.tournament} — fixtures`];
  for (const [day, list] of byDay(rows)) {
    lines.push('', `📅 ${day}`);
    for (const r of list) {
      const extra = [r.stage, r.venue].filter(Boolean).join(' · ');
      lines.push(`${r.time ? `${r.time} ` : ''}${r.sportIcon ? `${r.sportIcon} ` : ''}${r.home} vs ${r.away}${extra ? ` (${extra})` : ''}`);
    }
  }
  if (o.rows.length > max) lines.push('', `…and ${o.rows.length - max} more`);
  if (o.link) lines.push('', `Live scores & updates: ${o.link}`);
  return lines.join('\n');
}

export function fixturesPrintHtml(o: { tournament: string; rows: FixtureRow[]; subtitle?: string }): string {
  const days = byDay(o.rows).map(([day, list]) => `
    <h2>${esc(day)}</h2>
    <table>
      <thead><tr><th>Time</th><th>Match</th><th>Stage</th><th>Venue</th><th>Result</th></tr></thead>
      <tbody>${list.map((r) => `
        <tr><td>${esc(r.time)}</td><td>${r.sportIcon ? esc(r.sportIcon) + ' ' : ''}<b>${esc(r.home)}</b> vs <b>${esc(r.away)}</b></td><td>${esc(r.stage ?? '')}</td><td>${esc(r.venue ?? '')}</td><td class="res"></td></tr>`).join('')}
      </tbody>
    </table>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(o.tournament)} — fixtures</title>
<style>
  body { font: 13px/1.4 -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #111; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 2px; } .sub { color: #555; margin: 0 0 16px; }
  h2 { font-size: 14px; margin: 18px 0 6px; border-bottom: 2px solid #111; padding-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #ccc; vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; color: #555; } td.res { width: 70px; border-left: 1px solid #ccc; }
  .foot { margin-top: 20px; color: #777; font-size: 11px; }
  @media print { body { margin: 10mm; } h2 { break-after: avoid; } tr { break-inside: avoid; } }
</style></head><body>
<h1>${esc(o.tournament)}</h1><p class="sub">${esc(o.subtitle ?? 'Fixtures')}</p>${days || '<p>No fixtures scheduled yet.</p>'}
<p class="foot">Live scores on SportnNote · sportnnote.in</p>
</body></html>`;
}
