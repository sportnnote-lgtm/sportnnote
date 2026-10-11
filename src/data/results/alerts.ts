/**
 * SD-131 — the medal summary a locked final (or a finished golf round) leaves on
 * its field_events row (`format.alert`), read by the notify-followers edge
 * function to push "🥇 Asha Rao won U14 Girls 100 m in 13.42 — meet record" to
 * followers of the athletes, their teams / houses and the tournament.
 *
 * Same shape as supabase/functions/_shared/resultAlert.ts (ResultAlert); the
 * function validates it, checks every id against the event's entries and takes
 * names from the database. Pure.
 */
import type { RankedEntry } from './model.ts';

export type AlertMedalKind = 'gold' | 'silver' | 'bronze';

export interface AlertMedal { medal: AlertMedalKind; playerId?: string; teamId?: string; name: string; mark?: string }
export interface ResultAlert { v: 1; kind: 'final' | 'golf'; event?: string; medals: AlertMedal[] }

const MEDALS: AlertMedalKind[] = ['gold', 'silver', 'bronze'];
const medalAt = (p: number | null | undefined): AlertMedalKind | undefined => (p != null && p >= 1 && p <= 3 ? MEDALS[p - 1] : undefined);

/** A results final: the podium of the ranked rows (ties share a medal). */
export function finalAlert(rows: Pick<RankedEntry, 'position' | 'entry' | 'bestText'>[], event?: string): ResultAlert {
  const medals: AlertMedal[] = [];
  for (const r of rows) {
    const medal = medalAt(r.position);
    if (!medal) continue;
    const e = r.entry;
    medals.push({
      medal, name: e.name,
      ...(e.athleteId ? { playerId: e.athleteId } : e.team?.id ? { teamId: e.team.id } : {}),
      ...(r.bestText ? { mark: r.bestText } : {}),
    });
  }
  return { v: 1, kind: 'final', ...(event ? { event } : {}), medals };
}

/** A combined event: the podium of the final standings, marks in points. */
export function combinedAlert(rows: { athleteId: string; name: string; position: number | null; total: number; out?: boolean }[], event?: string): ResultAlert {
  const medals: AlertMedal[] = [];
  for (const r of rows) {
    const medal = r.out ? undefined : medalAt(r.position);
    if (medal) medals.push({ medal, playerId: r.athleteId, name: r.name, mark: `${r.total} pts` });
  }
  return { v: 1, kind: 'final', ...(event ? { event } : {}), medals };
}

const toPar = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `−${Math.abs(n)}`);

/** A golf round: whoever is first on the round's leaderboard, with the score
 *  in its measure ("−3 (69)", "net −2", "38 pts"). */
export function golfAlert(
  rows: { id: string; position: number | null; total: number; grossTotal: number; playoff?: 'pending' | 'won' | 'lost' }[],
  nameOf: (playerId: string) => string,
  o: { scoring: 'stroke' | 'stableford'; net?: boolean; event?: string },
): ResultAlert {
  // a playoff for first: the winner only once it's recorded
  const won = rows.filter((r) => r.playoff === 'won');
  const firsts = won.length ? won : rows.filter((r) => r.position === 1 && r.playoff !== 'pending' && r.playoff !== 'lost');
  const mark = (r: (typeof rows)[number]) =>
    o.scoring === 'stableford' ? `${r.total} pts` : o.net ? `net ${toPar(r.total)}` : `${toPar(r.total)} (${r.grossTotal})`;
  return {
    v: 1, kind: 'golf', ...(o.event ? { event: o.event } : {}),
    medals: firsts.map((r) => ({ medal: 'gold' as const, playerId: r.id, name: nameOf(r.id), mark: mark(r) })),
  };
}
