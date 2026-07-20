/** Role capability helpers. `support` is the admin/superset role — it can do
 *  everything an organizer/scorer can, plus review verifications. */
import type { Role } from './types';

/** Internal support/admin — gated access to the verification review console. */
export const isSupport = (r?: Role) => r === 'support';

/** May organize: create tournaments, manage matches. */
export const canOrganize = (r?: Role) => r === 'organizer' || r === 'support';

/** May score ad-hoc/local games (the per-match assigned scorer is separate). */
export const canScoreByRole = (r?: Role) => r === 'scorer' || r === 'organizer' || r === 'support';
