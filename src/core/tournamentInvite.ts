/** Tournament join link (parity #10): one link per tournament whose code
 *  (`T-XXXXXX`) doubles as a PIN typed into "Join a team with a code". Pure + unit-tested. */
import { SHARE_BASE } from './shareText.ts';
import { inviteLabel } from './inviteText.ts';

/** The https link that opens JoinTournament on web / in the app. */
export const tournamentJoinLink = (token: string) => `${SHARE_BASE}/join-tournament/${token}`;

/** Extract a tournament code from a typed / scanned / pasted value: `T-ABC123`,
 *  `t-abc123`, `T ABC123`, `TABC123`, or a link …/join-tournament/T-ABC123
 *  (https or sportnnote://), or `?c=T-ABC123`. Returns `T-ABC123` or null. */
export function parseTournamentToken(input: string | null | undefined): string | null {
  const s = (input ?? '').trim();
  if (!s) return null;
  const pick = (raw: string): string | null => {
    const m = raw.toUpperCase().match(/^T[-\s]?([A-Z0-9]{6})$/);
    return m ? `T-${m[1]}` : null;
  };
  const path = s.match(/join-tournament\/([A-Za-z0-9-]+)/i);
  if (path) return pick(path[1]);
  const q = s.match(/[?&]c=([A-Za-z0-9-]+)/);
  if (q) return pick(q[1]);
  return pick(s);
}

/** Does this typed code look like a tournament code (so "Join a team with a code" forwards it)? */
export const isTournamentToken = (input: string | null | undefined) => parseTournamentToken(input) !== null;

/** The WhatsApp / share message: carries the link and the code. */
export function tournamentInviteMessage(opts: { tournamentName: string; inviterName?: string; token: string }): string {
  const by = opts.inviterName?.trim() ? ` ${opts.inviterName.trim()} invited your team 🏆` : '';
  return `Enter your team in ${inviteLabel('Tournament', opts.tournamentName)} on SportnNote!${by}\n\nOpen this to enter: ${tournamentJoinLink(opts.token)}\n\nOr in the app, go to Settings → Join a team with a code and enter code: ${opts.token}`;
}
