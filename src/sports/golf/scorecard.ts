/**
 * SD-88 (GF-11) — the classic scorecard layout: Out / In / Total columns,
 * par and stroke-index rows, birdie circles and bogey squares. PURE (tests in
 * tests/golf-handicap-team-match.test.mts); drawn by
 * components/golf/GolfScorecard.tsx.
 */
import { stablefordPoints, toParLabel, type GolfCard, type HoleScore, type Hole } from './engine.ts';

/** The shape drawn round a score: ◎ eagle or better, ◯ birdie, plain par,
 *  □ bogey, ▣ double bogey or worse. */
export type ScoreShape = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double';

export function scoreShape(strokes: HoleScore | undefined, par: number): ScoreShape | null {
  if (typeof strokes !== 'number') return null;
  const d = strokes - par;
  return d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'double';
}

export interface CardColumn {
  kind: 'hole' | 'out' | 'in' | 'total';
  label: string;
  /** hole indexes (into the round's holes) this column covers */
  idx: number[];
}

/** 18 holes: 1–9, Out, 10–18, In, Tot. Any other round: its holes + Tot. */
export function cardColumns(holes: Hole[]): CardColumn[] {
  const holeCol = (i: number): CardColumn => ({ kind: 'hole', label: String(holes[i].n), idx: [i] });
  const all = holes.map((_, i) => i);
  if (holes.length === 18) {
    const front = all.slice(0, 9), back = all.slice(9);
    return [...front.map(holeCol), { kind: 'out', label: 'Out', idx: front }, ...back.map(holeCol), { kind: 'in', label: 'In', idx: back }, { kind: 'total', label: 'Tot', idx: all }];
  }
  return [...all.map(holeCol), { kind: 'total', label: 'Tot', idx: all }];
}

/** Sum the numbers over a column; null when none of them has a value. */
export function sumOver(values: (number | null | undefined)[], idx: number[]): number | null {
  let t = 0, any = false;
  for (const i of idx) { const v = values[i]; if (typeof v === 'number') { t += v; any = true; } }
  return any ? t : null;
}

export interface CardRows {
  par: number[];
  si: number[];
  /** gross strokes (null = not played, 'P' = picked up) */
  strokes: HoleScore[];
  /** strokes received per hole (handicap dots) */
  received: number[];
  /** gross − strokes received; null on a pick-up or an empty hole */
  net: (number | null)[];
  points: (number | null)[];
  /** null when putts weren't tracked on the card */
  putts: (number | null)[] | null;
  /** any hole picked up (stroke play: no return) */
  pickedUp: boolean;
}

export function cardRows(holes: Hole[], card: Pick<GolfCard, 'strokes' | 'putts'>, received: number[]): CardRows {
  const strokes = holes.map((_, i) => card.strokes[i] ?? null);
  return {
    par: holes.map((h) => h.par),
    si: holes.map((h) => h.si),
    strokes,
    received: holes.map((_, i) => received[i] ?? 0),
    net: strokes.map((s, i) => (typeof s === 'number' ? s - (received[i] ?? 0) : null)),
    points: strokes.map((s, i) => (s == null ? null : stablefordPoints(s, holes[i].par, received[i] ?? 0))),
    putts: card.putts?.some((p) => typeof p === 'number') ? holes.map((_, i) => card.putts?.[i] ?? null) : null,
    pickedUp: strokes.some((s) => s === 'P'),
  };
}

/** A plain-text card to share: "Asha · 76 (+4) · Out 38 · In 38". */
export function cardShareText(name: string, course: string, holes: Hole[], card: Pick<GolfCard, 'strokes' | 'putts'>, received: number[]): string {
  const r = cardRows(holes, card, received);
  const cols = cardColumns(holes);
  const gross = (c: CardColumn) => sumOver(r.strokes.map((s) => (typeof s === 'number' ? s : null)), c.idx);
  const tot = cols[cols.length - 1];
  const g = gross(tot);
  const parPlayed = sumOver(r.strokes.map((s, i) => (typeof s === 'number' ? r.par[i] : null)), tot.idx) ?? 0;
  const parts = [`⛳ ${name} · ${course}`];
  if (g != null) parts.push(`${g}${r.pickedUp ? ' (NR)' : ` (${toParLabel(g - parPlayed)})`}`);
  const sub = cols.filter((c) => c.kind === 'out' || c.kind === 'in').map((c) => `${c.label} ${gross(c) ?? '–'}`);
  if (sub.length) parts.push(sub.join(' · '));
  const line = (label: string, vals: (string | number)[]) => `${label}: ${vals.join(' ')}`;
  return [
    parts.join(' · '),
    line('Hole', holes.map((h) => h.n)),
    line('Par ', r.par),
    line('Shot', r.strokes.map((s) => (s == null ? '-' : s))),
  ].join('\n');
}
