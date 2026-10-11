/**
 * Under-18 privacy on the client (pure — node tests load it). The server decides
 * what a viewer gets (players_view, migration protect_minors): a possible minor
 * (under 18, or no date of birth on file) shows a REDUCED card to anyone outside
 * their circle — signed-in strangers see name, number, sports, house/team, age;
 * logged-out visitors see initials, number, sports and house only. No photo,
 * city, school or bio either way. `restricted` says the card came back reduced.
 * These helpers only make the screens say so instead of looking broken.
 */
import { ageOf } from './age.ts';
import type { Player } from './types.ts';

type CardLike = Pick<Player, 'restricted' | 'dob' | 'age'> | null | undefined;

/** The server sent the reduced card for this viewer. */
export const isReducedCard = (p: CardLike): boolean => !!p?.restricted;

/** Logged-out visitors get adult profiles only; an under-18 (or unknown age, or a
 *  reduced card) shows the "members only" panel. */
export function guestSeesMembersOnly(p: CardLike): boolean {
  if (!p) return false;
  if (p.restricted) return true;
  const age = ageOf(p);
  return age === undefined || age < 18;
}

/** Following someone: anyone may follow an adult; an under-18's reduced card
 *  (you're not on their team / tournament / org, nor their guardian) can't be
 *  followed. Your own card always can. Guests are asked to sign in instead. */
export function canFollowCard(p: CardLike, viewer: { signedIn: boolean; isSelf?: boolean }): boolean {
  if (!viewer.signedIn || viewer.isSelf) return true;
  return !isReducedCard(p);
}

/** The line shown on a reduced card. */
export function reducedCardNote(p: CardLike, guest: boolean): string | undefined {
  if (!isReducedCard(p)) return undefined;
  return guest
    ? 'Under-18 or age not confirmed: only initials are public. Sign in to see more.'
    : 'Under-18 profile: their photo, city, school and bio are visible only to their teammates, coaches, tournament organisers and parent/guardian. Only they can follow this player.';
}

/** Avatar letters: "Meera Rao" → "MR", the logged-out "M. R." → "MR", "" → "?". */
export function avatarInitials(name: string | null | undefined): string {
  const letters = (name ?? '')
    .replace(/\./g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase());
  return letters.slice(0, 2).join('') || '?';
}

/** A name to print next to a score for a player row we may not have (a logged-
 *  out viewer gets initials from the server, or nothing at all): never crash,
 *  never an empty string. */
export function displayNameOf(p: Pick<Player, 'fullName'> | null | undefined, fallback = 'Player'): string {
  const n = (p?.fullName ?? '').trim();
  return n || fallback;
}
