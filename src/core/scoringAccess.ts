/**
 * Who may score (and end) a match. Pure — mirrors the server's
 * `can_manage_match()` (migration 0025): a listed scorer (`scorer_ids`, or the
 * legacy single `scorer_id`), a host of the match (`host_ids`), or a manager of
 * its tournament (listed hosts / an org-hosted event's Owner/Admin/Organizer —
 * see core/org.ts `tournamentHostPlayerIds`).
 *
 * Hosts can score by default: they don't have to add themselves as a scorer
 * first. Taking the scoring lock (`claim_scoring`) adds them to `scorer_ids`.
 * Everyone else is a viewer.
 */
export interface ScoringAccessInput {
  myPlayerId: string | null | undefined;
  scorerIds?: readonly string[] | null;
  /** legacy single scorer */
  scorerId?: string | null;
  /** the match's own hosts */
  hostIds?: readonly string[] | null;
  /** the tournament's hosts (incl. an org-hosted event's Owner/Admin/Organizer) */
  tournamentHostIds?: readonly string[] | null;
}

/** Is this player one of the match's listed scorers? */
export function isListedScorer(i: Pick<ScoringAccessInput, 'myPlayerId' | 'scorerIds' | 'scorerId'>): boolean {
  const me = i.myPlayerId;
  if (!me) return false;
  return (i.scorerIds ?? []).includes(me) || i.scorerId === me;
}

/** Is this player a host of the match or of its tournament? */
export function isMatchHost(i: Pick<ScoringAccessInput, 'myPlayerId' | 'hostIds' | 'tournamentHostIds'>): boolean {
  const me = i.myPlayerId;
  if (!me) return false;
  return (i.hostIds ?? []).includes(me) || (i.tournamentHostIds ?? []).includes(me);
}

/** May this player score / end the match? Listed scorer OR host. */
export function canScoreMatch(i: ScoringAccessInput): boolean {
  return isListedScorer(i) || isMatchHost(i);
}
