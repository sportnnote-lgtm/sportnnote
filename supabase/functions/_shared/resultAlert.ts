/**
 * SD-131 — follower alerts for event results (athletics, swimming, weightlifting,
 * shooting, archery, rowing, canoe, cycling) and golf stroke-play rounds.
 *
 * Pure (no Deno / Node APIs, no imports) so the notify-followers edge function
 * and the app's tests share one copy of the rules and the wording:
 *   - phaseKind:    is this 'completed' field event a FINAL, a golf round, or a
 *                   heat / semi / mid-combined event that pushes nothing?
 *   - parseAlert:   the medal summary the app stores on a locked final
 *                   (field_events.format.alert) — validated, marks sanitised;
 *                   the function re-checks every id against the event's entries
 *                   and takes names from the database, never from the client.
 *   - recordsSetBy: the tournament record book's rows this event set.
 *   - alertText:    "🥇 Asha Rao won U14 Girls 100 m in 13.42 — meet record".
 */

export type Medal = 'gold' | 'silver' | 'bronze';

export interface AlertMedal {
  medal: Medal;
  /** an individual (players.id) */
  playerId?: string;
  /** a relay / crew / golf team (teams.id) */
  teamId?: string;
  /** the name on the result sheet (the function prefers the database's; may be
   *  '' when an id is given) */
  name: string;
  /** the mark as the sheet shows it: "13.42", "5.12", "1:02.34", "185", "−3 (69)", "38 pts" */
  mark?: string;
}

/** Stored on field_events.format.alert when a final is locked / a round finished. */
export interface ResultAlert {
  v: 1;
  kind: 'final' | 'golf';
  /** "U14 Girls 100 m" — the event, without the phase */
  event?: string;
  medals: AlertMedal[];
}

const MEDALS: Medal[] = ['gold', 'silver', 'bronze'];

/** A mark is short, plain text: digits, units, to-par signs. Anything else is dropped. */
export function cleanMark(s: unknown): string | undefined {
  if (typeof s !== 'string') return undefined;
  const t = s.trim();
  return t && t.length <= 24 && /^[0-9A-Za-z:.,+\-−() ]+$/.test(t) ? t : undefined;
}

const cleanName = (s: unknown): string | undefined => {
  if (typeof s !== 'string') return undefined;
  // names are re-read from the database when an id is given; this is the
  // fallback for a relay snapshot with no team row — no links, no newlines
  const t = s.replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, 60) : undefined;
};

const isId = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f-]{8,64}$/i.test(s);

/** The stored summary, validated. Null when absent / unusable. */
export function parseAlert(raw: unknown): ResultAlert | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.kind !== 'final' && r.kind !== 'golf') return null;
  const medals: AlertMedal[] = [];
  for (const m of Array.isArray(r.medals) ? r.medals.slice(0, 12) : []) {
    if (!m || typeof m !== 'object') continue;
    const x = m as Record<string, unknown>;
    if (!MEDALS.includes(x.medal as Medal)) continue;
    // a name is needed unless an id lets the function look it up
    const name = cleanName(x.name) ?? '';
    if (!name && !isId(x.playerId) && !isId(x.teamId)) continue;
    medals.push({
      medal: x.medal as Medal, name,
      ...(isId(x.playerId) ? { playerId: x.playerId } : {}),
      ...(isId(x.teamId) ? { teamId: x.teamId } : {}),
      ...(cleanMark(x.mark) ? { mark: cleanMark(x.mark) } : {}),
    });
  }
  return { v: 1, kind: r.kind, ...(cleanName(r.event) ? { event: cleanName(r.event) } : {}), medals };
}

/**
 * What a field event that just turned 'completed' is:
 *   'final' — a results final (the last planned round; the last event of a
 *             combined event);
 *   'golf'  — a golf round (format has no results phase);
 *   null    — a heat / semi-final / qualification round, or an event of a
 *             combined event before the last — nothing to push.
 */
export function phaseKind(sport: string, format: unknown): 'final' | 'golf' | null {
  const f = (format && typeof format === 'object' ? format : {}) as Record<string, unknown>;
  const res = f.results as Record<string, unknown> | undefined;
  if (!res || typeof res !== 'object') return sport === 'golf' ? 'golf' : null;
  const c = res.combined as { index?: number; events?: unknown[] } | undefined;
  if (c && Array.isArray(c.events) && typeof c.index === 'number' && c.index < c.events.length - 1) return null;
  const plan = res.plan as unknown[] | undefined;
  const phaseNo = Number(res.phaseNo) || 1;
  if (Array.isArray(plan) && plan[phaseNo] != null) return null;
  return 'final';
}

/** "100 m U14 Girls — Final" → "100 m U14 Girls" (the phase name dropped). */
export function eventName(title: string, format: unknown): string {
  const res = (format as { results?: { eventTitle?: unknown } } | null)?.results;
  const t = typeof res?.eventTitle === 'string' && res.eventTitle.trim() ? res.eventTitle.trim() : title;
  return t.replace(/\s+—\s+[^—]+$/, '').trim() || title;
}

export interface RecordSet { scope: string; holder?: string }

/** The record-book rows (tournaments.formats[sport].records — JSON text or an
 *  array) set by this event (`eventKey`). */
export function recordsSetBy(raw: unknown, eventKey: unknown): RecordSet[] {
  if (typeof eventKey !== 'string' || !eventKey) return [];
  let list: unknown = raw;
  if (typeof raw === 'string') { try { list = JSON.parse(raw); } catch { return []; } }
  if (!Array.isArray(list)) return [];
  const out: RecordSet[] = [];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const x = r as Record<string, unknown>;
    if (x.eventKey !== eventKey || typeof x.scope !== 'string') continue;
    if (!out.some((o) => o.scope === x.scope && o.holder === x.holder)) out.push({ scope: x.scope, ...(typeof x.holder === 'string' ? { holder: x.holder } : {}) });
  }
  return out;
}

const SCOPE: Record<string, string> = { MR: 'meet record', SR: 'school record' };
const scopeText = (s: string) => SCOPE[s] ?? 'record';

const joinNames = (names: string[]) =>
  names.length <= 1 ? names[0] ?? '' : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

export interface AlertTextInput {
  kind: 'final' | 'golf';
  /** "U14 Girls 100 m" / the golf round's title */
  event: string;
  medals: Pick<AlertMedal, 'medal' | 'name' | 'mark'>[];
  records?: RecordSet[];
  /** the tournament's name (body line) */
  tournament?: string | null;
  /** a golf round inside a tournament reads "led the round", not "won" */
  inTournament?: boolean;
}

/** The push: a one-line title and a short body. Null when there is no winner to name. */
export function alertText(a: AlertTextInput): { title: string; body: string } | null {
  const golds = a.medals.filter((m) => m.medal === 'gold');
  if (!golds.length) return null;
  const who = joinNames(golds.map((m) => m.name));
  const mark = golds[0].mark;
  const recs = a.records ?? [];
  const goldNames = new Set(golds.map((m) => m.name));
  // a record set by the winner rides on the title; one set by someone else (a
  // shooting / archery qualification mark) goes in the body
  const own = recs.filter((r) => !r.holder || goldNames.has(r.holder));
  const others = recs.filter((r) => r.holder && !goldNames.has(r.holder));
  const body: string[] = [];
  let title: string;
  if (a.kind === 'golf') {
    title = a.inTournament
      ? `⛳ ${a.event} finished — ${who} ${golds.length > 1 ? 'shared' : 'led'} the round${mark ? ` on ${mark}` : ''}`
      : `⛳ ${who} ${golds.length > 1 ? 'tied to win' : 'won'} ${a.event}${mark ? ` — ${mark}` : ''}`;
  } else {
    const verb = golds.length > 1 ? 'shared gold in' : 'won';
    title = `🥇 ${who} ${verb} ${a.event}${mark ? ` in ${mark}` : ''}`;
    if (own.length) title += ` — ${[...new Set(own.map((r) => scopeText(r.scope)))].join(' & ')}`;
    const podium = (['silver', 'bronze'] as Medal[]).map((m) => {
      const names = a.medals.filter((x) => x.medal === m).map((x) => x.name);
      return names.length ? `${m === 'silver' ? '🥈' : '🥉'} ${names.join(', ')}` : '';
    }).filter(Boolean);
    if (podium.length) body.push(podium.join(' · '));
    for (const r of others) body.push(`${scopeText(r.scope)[0].toUpperCase()}${scopeText(r.scope).slice(1)} by ${r.holder}`);
  }
  if (a.tournament) body.push(a.tournament);
  return { title, body: body.join(' · ') || (a.kind === 'golf' ? 'Golf' : 'Final result') };
}

/** Medals in an ordered result (position 1 / 2 / 3; ties share the medal). */
export const medalFor = (position: number | null | undefined): Medal | undefined =>
  position != null && position >= 1 && position <= 3 ? MEDALS[position - 1] : undefined;
