/**
 * SD-123 — final placings of one match sport, taken from the tournament's real
 * structure (not one flat league over every match):
 *
 *   • knockout  → 1 = final winner, 2 = final loser; 3/4 from the 3rd-place
 *     match, or BOTH semi-final losers share 3rd (two bronzes) when there's no
 *     3rd-place match (or the organiser picks shared bronze); then everyone out
 *     in an earlier round shares that round's band (QF losers =5, R16 losers =9 …).
 *   • double-chance playoff (IPL) → final W/L, Qualifier 2 loser 3rd,
 *     Eliminator loser 4th.
 *   • groups / Super round / league → the teams that never reached the knockout
 *     come after it: a Super round or league in its own order, group exits banded
 *     by group finishing position (every group 3rd shares one band, …).
 *   • league only (no knockout match at all) → the league table order, exactly
 *     as before.
 *
 * Team ties (SD-48) count once: rubbers of a tie fold into one pairing (series
 * legs) for the knockout, and `teamStandings` collapses them for the tables.
 * Only DECIDED placings are returned — a finalist has no place until the final
 * is played. Pure: reads bracket.ts / groups.ts helpers, never edits them.
 */
import type { Match, SportId } from '../core/types';
import { knockoutStageRounds, pairingWinnerId, pairingLoserId, matchWinnerId, matchLoserId, type KnockoutPairing } from './bracket.ts';
import { deriveSeries, readSeriesMeta } from './series.ts';
import { standingsPhases } from './groups.ts';
import { teamStandings, type StandingsConfig } from './standings.ts';
import type { StructureShape } from './structureConfig.ts';

/** How the two semi-final losers are placed. 'playoff' (default): a 3rd-place
 *  match decides 3rd/4th when one is scheduled, else both share 3rd. 'shared':
 *  both semi-final losers always take bronze (any 3rd-place match is ignored). */
export type BronzeRule = 'playoff' | 'shared';

export interface EntrantPlace {
  teamId: string;
  name: string;
  colorHex?: string;
  /** 1-based finishing position (the top of a shared band: QF losers are all 5) */
  position: number;
  /** how many entrants share this position (1 = outright) */
  shared: number;
  played: number;
}

export interface SportPlaces {
  /** 'structure' = placed from the knockout; 'league' = the league table order */
  basis: 'structure' | 'league' | 'pending';
  places: EntrantPlace[];
  /** entrants in the sport (for "3rd of 7" and the N-down-to-1 points fallback) */
  fieldSize: number;
}

type Side = { id: string; name: string; colorHex?: string };

/** One pairing (single match or a multi-leg tie / team tie) per series. */
function pairingsOf(ms: Match[], stage: string): KnockoutPairing[] {
  const out: KnockoutPairing[] = [];
  const legs = ms.filter((m) => readSeriesMeta(m));
  for (const m of ms) if (!readSeriesMeta(m)) out.push({ key: m.id, stage: stage as KnockoutPairing['stage'], homeId: m.homeTeam.id, awayId: m.awayTeam.id, match: m });
  for (const s of deriveSeries(legs)) {
    out.push({ key: 'series:' + s.id, stage: stage as KnockoutPairing['stage'], homeId: s.teamA?.id ?? s.legs[0].homeTeam.id, awayId: s.teamB?.id ?? s.legs[0].awayTeam.id, series: s });
  }
  return out;
}
const winnerOf = (p: KnockoutPairing) => (p.series ? pairingWinnerId(p) : p.match ? matchWinnerId(p.match) : undefined);
const loserOf = (p: KnockoutPairing) => (p.series ? pairingLoserId(p) : p.match ? matchLoserId(p.match) : undefined);

/**
 * The decided placings of `sport` in a tournament's `matches`.
 * `shape` is the organiser's saved structure (structureConfig): a 'knockout' or
 * 'groups' sport with no knockout match yet has no placings (it's decided by
 * the bracket still to come), instead of a provisional league order.
 */
export function sportPlaces(
  matches: Match[], sport: SportId, cfg: StandingsConfig,
  opts: { bronze?: BronzeRule; shape?: StructureShape | null } = {},
): SportPlaces {
  const ms = matches.filter((m) => m.sport === sport);
  const sides = new Map<string, Side>();
  for (const m of ms) {
    sides.set(m.homeTeam.id, { id: m.homeTeam.id, name: m.homeTeam.name, colorHex: m.homeTeam.colorHex });
    sides.set(m.awayTeam.id, { id: m.awayTeam.id, name: m.awayTeam.name, colorHex: m.awayTeam.colorHex });
  }
  const rounds = knockoutStageRounds(ms);
  const at = (stage: string) => ms.filter((m) => m.stage === stage);
  const dc = { q1: at('q1'), el: at('eliminator'), q2: at('q2') };
  const hasDc = dc.q1.length > 0 || dc.el.length > 0;
  const third = at('third');

  // League only: the table order, exactly as the medal table always did.
  if (!rounds.length && !hasDc) {
    if (opts.shape === 'knockout' || opts.shape === 'groups') return { basis: 'pending', places: [], fieldSize: sides.size };
    const table = teamStandings(matches, sport, cfg);
    return {
      basis: 'league',
      places: table.map((t, i) => ({ teamId: t.teamId, name: t.name, colorHex: t.colorHex, position: i + 1, shared: 1, played: t.played })),
      fieldSize: table.length,
    };
  }

  // Games played per entrant (a team tie counts once) — for the row's "played".
  const playedBy = new Map<string, number>();
  const seen = new Set<string>();
  for (const m of ms) {
    if (m.status !== 'completed') continue;
    const sid = readSeriesMeta(m)?.id;
    for (const id of [m.homeTeam.id, m.awayTeam.id]) {
      const k = `${sid ?? m.id}|${id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      playedBy.set(id, (playedBy.get(id) ?? 0) + 1);
    }
  }

  const placed = new Map<string, { position: number; shared: number }>();
  const inKo = new Set<string>();
  for (const m of ms) if (m.stage && (rounds.some((r) => r.stage === m.stage) || ['third', 'q1', 'q2', 'eliminator'].includes(m.stage))) {
    inKo.add(m.homeTeam.id); inKo.add(m.awayTeam.id);
  }
  for (const r of rounds) for (const m of r.matches) for (const id of m.byes ?? []) inKo.add(id);
  const put = (ids: (string | undefined)[], position: number, shared: number) => {
    for (const id of ids) if (id && !placed.has(id)) placed.set(id, { position, shared });
  };

  // Each knockout round's losers share the band just below everyone still in
  // it: losers of a round of k pairings (+ play-in byes) start at k + byes + 1
  // (final loser 2nd, SF losers =3, QF losers =5 …), so a band is right even
  // before the later rounds are drawn.
  for (const r of rounds) {
    const byes = new Set(r.matches.flatMap((m) => m.byes ?? [])).size;
    const start = r.pairings.length + byes + 1;
    if (r.stage === 'final') {
      for (const p of r.pairings) { put([winnerOf(p)], 1, 1); put([loserOf(p)], 2, 1); }
      continue;
    }
    const losers = r.pairings.map(loserOf);
    if (r.stage === 'sf' && !hasDc) {
      const tp = opts.bronze === 'shared' ? [] : pairingsOf(third, 'third');
      if (tp.length === 1) {
        // A 3rd-place match: its winner 3rd, loser 4th (once played).
        put([winnerOf(tp[0])], start, 1);
        put([loserOf(tp[0])], start + 1, 1);
        continue;
      }
    }
    // No 3rd-place match (or shared bronze): both semi-final losers =3; any
    // other round's losers share their band.
    put(losers, start, r.pairings.length);
  }

  if (hasDc) {
    // Qualifier 2 loser 3rd, Eliminator loser 4th (Qualifier 1's loser plays on).
    const q2 = pairingsOf(dc.q2, 'q2')[0];
    const el = pairingsOf(dc.el, 'eliminator')[0];
    if (q2) put([loserOf(q2)], 3, 1);
    if (el) put([loserOf(el)], 4, 1);
  }

  // Teams that never reached the knockout: the Super round / league / Swiss in
  // table order, then group exits banded by their group position.
  let next = inKo.size + 1;
  const phases = standingsPhases(ms, sport, cfg);
  const out = (id: string) => !inKo.has(id) && !placed.has(id);
  for (const ph of phases.filter((p) => !p.key.startsWith('group:'))) {
    for (const row of ph.rows) if (out(row.teamId)) put([row.teamId], next++, 1);
  }
  const groups = phases.filter((p) => p.key.startsWith('group:'));
  const depth = Math.max(0, ...groups.map((g) => g.rows.length));
  for (let i = 0; i < depth; i++) {
    const band = groups.map((g) => g.rows[i]?.teamId).filter((id): id is string => !!id && out(id));
    put(band, next, band.length);
    next += band.length;
  }

  const places: EntrantPlace[] = [...placed.entries()]
    .filter(([id]) => sides.has(id))
    .map(([id, p]) => ({ teamId: id, name: sides.get(id)!.name, colorHex: sides.get(id)!.colorHex, ...p, played: playedBy.get(id) ?? 0 }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  return { basis: 'structure', places, fieldSize: sides.size };
}
