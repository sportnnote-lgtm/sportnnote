/**
 * SD-134 — write a chess round's results from the arbiter's one-screen sheet.
 * Each board goes through the game's own log exactly as the game screen
 * records it: the RESULT event (with both players' profile credits), the
 * profile stat lines, then the completed snapshot (winner → standings, the
 * follower push). A board already decided, or being scored on another phone,
 * is skipped and reported.
 */
import { getSport } from '../sports/registry';
import { getMatchEvents, appendMatchEvent, updateMatchSnapshot, recordStatLine, releaseScoring } from './repos';
import { effectiveLog } from '../sports/amend';
import { withMatchRecords } from '../sports/matchRecords';
import { actionLineCredits } from './lineOpponent';
import { boardResultAction, type BoardPick } from '../sports/chess/roundSheet';
import type { Match, MatchEventRecord, Player } from '../core/types';

export interface BoardWrite { match: Match; pick: BoardPick; white: 'home' | 'away' }
export interface RoundWriteResult { saved: string[]; skipped: { matchId: string; why: 'decided' | 'locked' | 'error'; message?: string }[] }

const toAction = (e: MatchEventRecord) => ({ type: e.type, side: e.side ?? undefined, payload: e.payload ?? undefined, attribution: e.attribution ?? undefined });
const newId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); });

/** Each side's player (a one-player entrant's roster). */
function sidePlayer(m: Match, side: 'home' | 'away', players: Map<string, Player>): { id: string; fullName: string } | undefined {
  const t = side === 'home' ? m.homeTeam : m.awayTeam;
  const id = t.roster?.length === 1 ? t.roster[0] : undefined;
  const p = id ? players.get(id) : undefined;
  return p ? { id: p.id, fullName: p.fullName } : undefined;
}

export async function recordRoundResults(writes: BoardWrite[], players: Map<string, Player>): Promise<RoundWriteResult> {
  const plugin = getSport('chess');
  const out: RoundWriteResult = { saved: [], skipped: [] };
  for (const w of writes) {
    const m = w.match;
    try {
      const log = await getMatchEvents(m.id);
      let s: unknown = plugin.createInitialState(m.format as Record<string, unknown> | undefined);
      for (const e of effectiveLog(log)) s = plugin.reducer(s as never, toAction(e));
      if (plugin.isComplete(s as never) || m.status === 'completed') { out.skipped.push({ matchId: m.id, why: 'decided' }); continue; }
      const action = boardResultAction(w.pick, w.white, { home: sidePlayer(m, 'home', players), away: sidePlayer(m, 'away', players) });
      // the colour the arbiter sees is the game's: write SET_WHITE only if the log differs
      const cur = (s as { white?: string }).white;
      const seq0 = log.reduce((mx, e) => Math.max(mx, e.seq), 0);
      if (cur !== w.white) {
        await appendMatchEvent(m.id, { seq: seq0 + 1, type: 'SET_WHITE', side: null, payload: { side: w.white }, attribution: null, clientId: newId() });
        s = plugin.reducer(s as never, { type: 'SET_WHITE', payload: { side: w.white } });
      }
      const rec: MatchEventRecord = {
        seq: seq0 + (cur !== w.white ? 2 : 1), type: 'RESULT', side: action.side ?? null,
        payload: action.attribution2 ? { ...action.payload, _attr2: action.attribution2 } : action.payload,
        attribution: action.attribution ?? null, clientId: newId(),
      };
      await appendMatchEvent(m.id, rec);
      s = plugin.reducer(s as never, { type: 'RESULT', side: action.side, payload: action.payload });
      // the profile lines, as the live hook credits them
      const credits = actionLineCredits(action, { home: m.homeTeam.name, away: m.awayTeam.name },
        { home: m.homeTeam.roster ?? [], away: m.awayTeam.roster ?? [] });
      for (const c of credits) await recordStatLine({ matchId: m.id, playerId: c.playerId, sport: 'chess', stat: c.stat, by: c.by, opponent: c.opponent, tracked: c.tracked });
      await updateMatchSnapshot(m.id, withMatchRecords(plugin, s as never, true), true);
      void releaseScoring(m.id).catch(() => {});
      out.saved.push(m.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      out.skipped.push({ matchId: m.id, why: /not_active_scorer/.test(msg) ? 'locked' : 'error', message: msg });
    }
  }
  return out;
}
