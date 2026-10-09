/**
 * Cricket's score-ticker cells and flashes (parity #25). Pure — reads the state
 * only; while a Super Over is live its own innings state drives the cells.
 */
import { oversStr, runRate, symbolTone, outcome, type CricketState } from './engine.ts';
import { shortName, type TickerChip, type TickerDetail, type TickerFlash } from '../ticker.ts';

/** The innings the ticker follows: the Super Over's while one is in play. */
const active = (s: CricketState): CricketState => (s.superOver && !s.ended ? s.superOver.state : s);

const targetTag = (s: CricketState) => (s.revision === 'dls' ? ' (DLS)' : s.revision === 'manual' ? ' (revised target)' : '');
const lowerFirst = (t: string) => (t ? t[0].toLowerCase() + t.slice(1) : t);

/** Has this side batted (or is it batting) in this innings state? */
const hasBatted = (x: CricketState, side: 'home' | 'away') =>
  side === x.battingSide || x.innings === 2 || x.scores[side].balls > 0 || x.scores[side].runs > 0;

export function cricketTickerDetail(s: CricketState, names: { home: string; away: string }): TickerDetail {
  const x = active(s);
  const inSO = x !== s;
  const bpo = x.ballsPerOver;
  const d: TickerDetail = {};

  for (const side of ['home', 'away'] as const) {
    const inn = x.scores[side];
    const batted = hasBatted(x, side);
    const score = batted ? `${inn.runs}/${inn.wickets}` : '';
    const sub = batted ? `${inSO ? 'SO ' : ''}(${oversStr(inn.balls, bpo)})` : undefined;
    if (side === 'home') { d.homeScore = score; d.homeSub = sub; } else { d.awayScore = score; d.awaySub = sub; }
  }

  if (s.ended) {
    const o = outcome(s);
    d.status = o.winner ? `${names[o.winner]} ${lowerFirst(o.text)}` : o.text;
    return d;
  }

  d.batting = x.battingSide;
  // Scores level, Super Over not started yet: the summary's status says it.
  if (s.pendingTie && !s.superOver) return d;

  // Crease and bowler.
  const bat = (id: string | undefined, name: string | undefined, star: boolean) => {
    if (!id) return undefined;
    const c = x.batting[id];
    return `${shortName(c?.name ?? name)}${star ? '*' : ''} ${c?.runs ?? 0} (${c?.balls ?? 0})`;
  };
  const left = [bat(x.strikerId, x.strikerName, true), bat(x.nonStrikerId, x.nonStrikerName, false)].filter((t): t is string => !!t);
  if (left.length) d.left = left;
  if (x.bowlerId) {
    const b = x.bowling[x.bowlerId];
    d.right = [`${shortName(b?.name ?? x.bowlerName)} ${b?.wickets ?? 0}-${b?.runs ?? 0} (${oversStr(b?.balls ?? 0, bpo)})`];
  }

  const chips: TickerChip[] = (x.thisOver ?? []).map((sym) => {
    const t = symbolTone(sym);
    return t === 'plain' ? { text: sym } : { text: sym, tone: t };
  });
  if (chips.length) d.chips = chips;

  // Headline: the chase, the innings break or the run rate.
  const inn = x.scores[x.battingSide];
  const so = inSO ? `Super Over${s.superOver!.round > 1 ? ` ${s.superOver!.round}` : ''} · ` : '';
  let banner: string | undefined;
  if (x.innings === 2 && x.target !== undefined) {
    if (!x.strikerId && !x.nonStrikerId && inn.balls === 0) {
      banner = `${so}Innings break · Target ${x.target}${targetTag(x)}`;
    } else {
      const need = Math.max(0, x.target - inn.runs);
      const left = (x.inn2Overs ?? x.oversLimit) * bpo - inn.balls;
      banner = x.oversLimit >= 999
        ? `${so}Need ${need}${targetTag(x)}`
        : `${so}Need ${need} off ${Math.max(0, left)}${targetTag(x)} · RRR ${runRate(need, Math.max(0, left), bpo)}`;
    }
  } else if (inn.balls > 0) {
    banner = `${so}CRR ${runRate(inn.runs, inn.balls, bpo)}`;
  } else if (so) {
    banner = so.replace(/ · $/, '');
  }
  if (banner && x.freeHit) banner += ' · FREE HIT';
  if (banner) d.banner = banner;
  return d;
}

/** The newest timeline event and a key that tells two apart across a Super Over. */
function newest(s: CricketState): { key: string; ev?: CricketState['events'][number]; at: CricketState } {
  const x = s.superOver ? s.superOver.state : s;
  const ev = x.events[x.events.length - 1];
  if (ev) return { key: `${s.superOver && x !== s ? s.superOver.round : 0}:${ev.id}`, ev, at: x };
  const main = s.events[s.events.length - 1];
  return { key: main ? `0:${main.id}` : '', ev: main, at: s };
}

/** A wicket → WICKET!, a real boundary → FOUR / SIX. Penalties, adjustments,
 *  an all-run 4 and overthrows (no 'boundary' tone) never flash; retired hurt
 *  isn't a wicket. */
export function cricketTickerFlash(prev: CricketState, next: CricketState): TickerFlash | null {
  const a = newest(prev);
  const b = newest(next);
  if (!b.ev || b.key === a.key) return null;
  const ev = b.ev;
  if (ev.tone === 'wicket' && ev.label !== 'RETIRED HURT') {
    return { kind: 'wicket', text: 'WICKET!', ...(ev.detail ? { sub: ev.detail } : {}), side: ev.side };
  }
  if (ev.tone === 'boundary' && (ev.label === 'FOUR' || ev.label === 'SIX')) {
    const px = prev.superOver ? prev.superOver.state : prev;
    const who = shortName(px.strikerName);
    return { kind: ev.label === 'FOUR' ? 'four' : 'six', text: `${ev.label}!`, ...(who ? { sub: who } : {}), side: ev.side };
  }
  return null;
}
