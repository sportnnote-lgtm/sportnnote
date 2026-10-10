/**
 * Score ticker model (parity #25) — what the OBS overlay and the host's preview
 * draw, for ANY sport. Pure (no React Native) so node tests load it.
 *
 * Built from the plugin's `summary()` (every sport works on day 1); a sport may
 * add richer cells with `tickerDetail` (cricket: batters, bowler, this over,
 * need/RRR) and a big moment banner with `tickerFlash` (wicket / four / six /
 * goal). Flashes are only ever asked for on a realtime INSERT (useLiveMatch's
 * `onRemoteEvent`), so a reload never replays old wickets.
 */
import type { SportPlugin } from './types';
import { finalBoard, type ResultLike } from './scoreline.ts';

export type TickerTone = 'wicket' | 'boundary' | 'extra';
export interface TickerChip { text: string; tone?: TickerTone }

export interface TickerTeam {
  short: string;
  name: string;
  color: string;
  logo?: string;
  /** '' = nothing to show yet (cricket: yet to bat) */
  score: string;
  /** small line after the score, e.g. cricket overs "(15.2)" */
  sub?: string;
}

export type TickerPhase = 'pre' | 'live' | 'done';

export interface TickerModel {
  home: TickerTeam;
  away: TickerTeam;
  /** the centre line: "Innings 2", "2nd Half", "⏸ Rain break", the result… */
  status: string;
  detail?: string;
  /** the side batting / serving — the corner theme's ▶ */
  batting?: 'home' | 'away';
  /** cells under the score: cricket's batters (left) and bowler (right) */
  left?: string[];
  right?: string[];
  /** cricket's "This over" balls */
  chips?: TickerChip[];
  /** the headline cell: "Need 23 off 14 · RRR 9.86" */
  banner?: string;
  phase: TickerPhase;
}

/** What a sport adds on top of its summary (all optional). `names` = the two
 *  short team names, for a result line like "Strikers won by 5 wkts". */
export interface TickerDetail {
  status?: string;
  detail?: string;
  homeScore?: string;
  awayScore?: string;
  homeSub?: string;
  awaySub?: string;
  batting?: 'home' | 'away';
  left?: string[];
  right?: string[];
  chips?: TickerChip[];
  banner?: string;
}

export interface TickerFlash {
  kind: 'wicket' | 'four' | 'six' | 'goal';
  text: string;
  /** a second, smaller line (who / how) */
  sub?: string;
  /** whose moment — a goal flashes in that team's colour */
  side?: 'home' | 'away';
}

export interface TickerSideMeta { name: string; short: string; color?: string; logo?: string }

export interface TickerMeta {
  home: TickerSideMeta;
  away: TickerSideMeta;
  /** kick-off already formatted for the viewer ("4:30 PM") */
  startsLabel?: string;
  /** a match closed by hand (#04 manualResultLine) — the final word */
  resultLine?: string;
  /** SD-20 — that result itself: a set/game sport then shows sets won + the
   *  marked line ("6-4, 3-2 ret."), not the live points it stopped at */
  result?: ResultLike | null;
  status?: 'scheduled' | 'live' | 'completed' | string;
  /** play paused (#13), e.g. "Rain break" */
  breakLabel?: string;
}

type TickerPlugin = Pick<SportPlugin<any>, 'summary' | 'isComplete' | 'tickerDetail'> & Partial<Pick<SportPlugin<any>, 'scoreLine' | 'lineScore' | 'retireTerms'>>;

const HOME_FALLBACK = '#4DA3FF';
const AWAY_FALLBACK = '#FF8A5C';

export function buildTicker(plugin: TickerPlugin, state: unknown, meta: TickerMeta, eventCount: number): TickerModel {
  const sm = plugin.summary(state as never);
  const complete = plugin.isComplete(state as never);
  const done = complete || !!meta.resultLine || meta.status === 'completed';
  const pre = !done && eventCount === 0 && meta.status !== 'live';
  const homeShort = meta.home.short || meta.home.name;
  const awayShort = meta.away.short || meta.away.name;
  const d: TickerDetail = pre ? {} : plugin.tickerDetail?.(state as never, { home: homeShort, away: awayShort }) ?? {};
  // SD-20: closed by hand mid-set → the final board (sets won + "6-4, 3-2 ret.").
  const fb = done && !complete && meta.result ? finalBoard(plugin, state, { result: meta.result }) : null;

  const team = (side: 'home' | 'away'): TickerTeam => {
    const m = meta[side];
    const score = pre ? '' : fb ? (side === 'home' ? fb.homeScore : fb.awayScore) : (side === 'home' ? d.homeScore ?? sm.homeScore : d.awayScore ?? sm.awayScore);
    const sub = pre ? undefined : side === 'home' ? d.homeSub : d.awaySub;
    return {
      short: side === 'home' ? homeShort : awayShort,
      name: m.name,
      color: m.color || (side === 'home' ? HOME_FALLBACK : AWAY_FALLBACK),
      ...(m.logo ? { logo: m.logo } : {}),
      score,
      ...(sub ? { sub } : {}),
    };
  };

  let status: string;
  if (pre) status = `${homeShort} vs ${awayShort}${meta.startsLabel ? ` · Starts ${meta.startsLabel}` : ''}`;
  else if (done) status = meta.resultLine ?? d.status ?? sm.statusLine;
  else if (meta.breakLabel) status = `⏸ ${meta.breakLabel}`;
  else status = d.status ?? sm.statusLine;

  const model: TickerModel = { home: team('home'), away: team('away'), status, phase: pre ? 'pre' : done ? 'done' : 'live' };
  if (pre) return model;
  const detail = fb ? fb.line : d.detail ?? sm.detailLine;
  if (detail) model.detail = detail;
  if (done) return model; // the result line says it all — no live cells
  if (d.batting) model.batting = d.batting;
  if (d.left?.length) model.left = d.left;
  if (d.right?.length) model.right = d.right;
  if (d.chips?.length) model.chips = d.chips;
  if (d.banner) model.banner = d.banner;
  return model;
}

/** "Rahul Sharma" → "Rahul S."; one word stays as it is. */
export function shortName(full?: string): string {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}
