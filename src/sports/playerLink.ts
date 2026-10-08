/**
 * Tap-a-name → player profile, for the read-only live views (lineups, bench,
 * timelines, box scores). Spread the result onto the existing <Text> so styles
 * and (masked) text stay exactly as they were; with no handler or no known id
 * it returns nothing and the name renders as plain text.
 */
import type { Player } from '../core/types';

type OnPlayer = ((playerId: string) => void) | undefined;

export function playerLink(id: string | undefined, label: string, onPlayer: OnPlayer) {
  if (!onPlayer || !id) return {};
  return {
    onPress: () => onPlayer(id),
    accessibilityRole: 'link' as const,
    accessibilityLabel: `Open ${label}`,
  };
}

/** Resolve a player's id from the name an event recorded (events often carry
 *  names only), searching the given rosters. */
export function idByName(name: string | undefined, ...rosters: (Player[] | undefined)[]): string | undefined {
  if (!name) return undefined;
  for (const r of rosters) {
    const p = r?.find((x) => x.fullName === name);
    if (p) return p.id;
  }
  return undefined;
}
