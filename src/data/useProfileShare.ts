/** Share a player's profile — record + one line per sport + /p/<id> link. */
import { useCallback } from 'react';
import { usePlayerProfile } from './hooks';
import { sportSummary } from './stats';
import { getSport } from '../sports/registry';
import { profileShareText } from '../core/shareText';
import { shareMessage } from '../core/share';
import type { SportId } from '../core/types';

export function useProfileShare(playerId: string | null) {
  const { player, stats } = usePlayerProfile(playerId);
  return useCallback(() => {
    if (!player || !playerId) return;
    const sports = (stats?.bySport ?? []).map((b) => {
      const sp = getSport(b.sport as SportId);
      const summary = sportSummary(b);
      return [`${sp.icon} ${sp.name}`, `${b.matches} ${b.matches === 1 ? 'match' : 'matches'}`, summary].filter(Boolean).join(' · ');
    });
    void shareMessage(profileShareText({
      name: player.fullName, matches: stats?.matches ?? 0, wins: stats?.wins ?? 0, sports, playerId,
    }), 'profile');
  }, [player, stats, playerId]);
}
