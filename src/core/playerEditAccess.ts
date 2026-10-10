/**
 * Who may edit a player's details, and what an admin edit may change
 * (CricHeroes parity #12). The server decides (`can_edit_player` /
 * `guard_player_write`, migrations 0044 + 0048 for school-community staff);
 * these pure rules shape the UI and the patch so the client never even sends what the server would refuse or ignore.
 */
import type { Player } from './types';

export type EditAccess = 'self' | 'admin' | 'none';

/** 'self' = my own player; 'admin' = an UNCLAIMED, unreported player I may
 *  manage (canAdmin from the server / demo rule); otherwise 'none'. A claimed
 *  player is never 'admin' — once someone joins, their profile is theirs. */
export function editAccess(args: {
  meId?: string | null;
  player: Pick<Player, 'id' | 'profileId' | 'reported'>;
  canAdmin: boolean;
}): EditAccess {
  const { meId, player, canAdmin } = args;
  if (meId && meId === player.id) return 'self';
  if (!player.profileId && !player.reported && canAdmin) return 'admin';
  return 'none';
}

/** The fields an admin edit may carry (a subset of repos' PlayerPatch). */
export type AdminPlayerPatch = Partial<
  Pick<Player, 'fullName' | 'city' | 'gender' | 'bio' | 'jerseyNo' | 'sports' | 'phone' | 'email' | 'photoUrl' | 'sportDetails' | 'dob' | 'guardian'>
>;

/** Everything the edit form could hold, privacy/verification included — those are dropped. */
export type PlayerForm = AdminPlayerPatch &
  Partial<Pick<Player, 'showPhone' | 'showEmail' | 'findableByContact' | 'verification' | 'phoneVerified' | 'emailVerified' | 'houseName'>>;

const clean = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

/**
 * The patch an admin save sends:
 * - never privacy (showPhone / showEmail / findableByContact), verification or
 *   the verified flags, nor the house (the server locks those for admins too);
 * - phone / email only when the original was empty (identity keys lock once set);
 * - strings trimmed, empty strings → undefined (left as they are);
 * - a guardian only when it carries a name (never the hidden read placeholder).
 */
export function adminPatch(form: PlayerForm, original: Pick<Player, 'phone' | 'email'>): AdminPlayerPatch {
  const out: AdminPlayerPatch = {};
  const fullName = clean(form.fullName);
  if (fullName) out.fullName = fullName;
  const city = clean(form.city);
  if (city) out.city = city;
  const gender = clean(form.gender);
  if (gender) out.gender = gender;
  const bio = clean(form.bio);
  if (bio) out.bio = bio;
  const dob = clean(form.dob);
  if (dob) out.dob = dob;
  const photoUrl = clean(form.photoUrl);
  if (photoUrl) out.photoUrl = photoUrl;
  if (form.jerseyNo !== undefined && Number.isFinite(form.jerseyNo)) out.jerseyNo = form.jerseyNo;
  if (!clean(original.phone)) {
    const phone = clean(form.phone);
    if (phone) out.phone = phone;
  }
  if (!clean(original.email)) {
    const email = clean(form.email);
    if (email) out.email = email;
  }
  const g = form.guardian;
  if (g && !g.hidden && clean(g.name)) {
    out.guardian = { name: g.name.trim(), phone: clean(g.phone), email: clean(g.email) };
  }
  if (form.sports !== undefined) out.sports = form.sports;
  if (form.sportDetails !== undefined) out.sportDetails = form.sportDetails;
  return out;
}
