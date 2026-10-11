/**
 * SD-48 — the tie result goes out ONCE. A tie rubber's own "Full time" reaches
 * only the followers of its players (server: notify-followers); when the
 * rubber that decides the tie is sent, team and tournament followers get one
 * "🏆 Riverside beat Hilltop 3–1" alert. Rubbers still to play are set aside
 * in "stop at the majority" mode (settleTie). Runs after the SD-111 hold has
 * sent the result, so a mis-tap undone inside the hold never announces a tie.
 */
import { afterRubberResult } from './repos';
import { followStore } from './followStore';
import { notify } from '../core/notifications';

export async function announceTieResult(matchId: string, ids: { homeTeamId?: string; awayTeamId?: string; tournamentId?: string; sportName: string }): Promise<void> {
  const r = await afterRubberResult(matchId).catch(() => null);
  if (!r?.decidedNow) return;
  const wants = (!!ids.homeTeamId && followStore.wants('team', ids.homeTeamId, 'result')) ||
    (!!ids.awayTeamId && followStore.wants('team', ids.awayTeamId, 'result')) ||
    (!!ids.tournamentId && followStore.wants('tournament', ids.tournamentId, 'result'));
  if (wants) void notify({ title: r.text, body: `${ids.sportName} · team tie result`, matchId });
}
