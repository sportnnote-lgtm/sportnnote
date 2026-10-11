/** SD-144 — baseball's per-match record candidates (SD-51 hook, set on the
 *  plugin by the registry through matchRecordHooks.ts). PURE: from the final
 *  state only. Team high, biggest win, no-hitters and perfect games (a team
 *  that allowed no hit / no base runner over a complete game of at least the
 *  format's innings, credited to the pitcher when one pitched it all), the
 *  cycle (single, double, triple and home run by one batter), grand slams and
 *  the most strikeouts pitched in a game. */
import { block, scoreItems, type MatchRecordItem, type MatchRecordsBlock } from '../matchRecords.ts';
import { lastInning, other, type BaseballState, type Side } from './engine.ts';
import { baseballTotals, reachedBase } from './totals.ts';

export function baseballMatchRecords(s: BaseballState): MatchRecordsBlock | null {
  if (!s?.g?.ended) return null;
  const items: MatchRecordItem[] = scoreItems(s.g.score.home, s.g.score.away, { teamHigh: true, biggestWin: true });
  const complete = lastInning(s) >= s.cfg.innings && s.g.endReason !== 'called';
  for (const field of ['home', 'away'] as Side[]) {
    const bat = other(field);
    const pas = s.events.filter((e) => e.type === 'pa' && e.side === bat && !s.g.ann[e.id]?.ignored);
    if (!complete || !pas.length) continue;
    const pitchers = s.g.spells.filter((x) => x.side === field);
    const solo = pitchers.length === 1 ? pitchers[0] : undefined;
    const who = solo ? { ...(solo.id ? { playerId: solo.id } : {}), ...(solo.name ? { playerName: solo.name } : {}) } : { note: 'combined' };
    if (s.g.hits[bat] === 0) items.push({ type: 'noHitter', value: 1, text: `${s.g.score[field]}–${s.g.score[bat]}`, side: field, ...who });
    if (!pas.some(reachedBase) && !s.events.some((e) => e.type === 'runner' && e.side === bat && e.moves?.some((m) => m.to !== -1))) {
      items.push({ type: 'perfectGame', value: 1, text: `${pas.length} up, ${pas.length} down`, side: field, ...who });
    }
  }
  const hits = new Map<string, { side: Side; name?: string; set: Set<string> }>();
  for (const e of s.events) {
    if (e.type !== 'pa' || !e.side || !e.batter?.id || s.g.ann[e.id]?.ignored) continue;
    if (e.outcome === '1B' || e.outcome === '2B' || e.outcome === '3B' || e.outcome === 'HR') {
      const r = hits.get(e.batter.id) ?? { side: e.side, name: e.batter.name, set: new Set<string>() };
      r.set.add(e.outcome);
      hits.set(e.batter.id, r);
    }
    if (e.outcome === 'HR' && (s.g.ann[e.id]?.runs ?? 0) >= 4) items.push({ type: 'grandSlam', value: 4, text: 'Grand slam', side: e.side, playerId: e.batter.id, playerName: e.batter.name });
  }
  for (const [id, r] of hits) if (r.set.size === 4) items.push({ type: 'cycle', value: 1, text: 'Hit for the cycle', side: r.side, playerId: id, playerName: r.name });
  const t = baseballTotals(s);
  const k = Object.entries(t).filter(([, x]) => (x.stats.kPitched ?? 0) > 0).sort((a, b) => b[1].stats.kPitched - a[1].stats.kPitched)[0];
  if (k) {
    const sp = s.g.spells.find((x) => x.id === k[0]);
    items.push({ type: 'mostKPitched', value: k[1].stats.kPitched, text: `${k[1].stats.kPitched} K`, side: k[1].side, playerId: k[0], ...(sp?.name ? { playerName: sp.name } : {}) });
  }
  return block(items);
}
