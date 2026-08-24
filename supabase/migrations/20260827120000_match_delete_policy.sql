-- Match deletion — a fenced DELETE policy.
--
-- `matches` had SELECT / INSERT / UPDATE policies but no DELETE policy, so with
-- RLS on, a delete silently affected zero rows (PostgREST returns 204 and the
-- client thinks it succeeded). This adds deletion, but fences it two ways so a
-- played match's data can never be destroyed:
--   1. only a match's managers (scorer / host / tournament host) — same
--      `can_manage_match(id)` helper the UPDATE policy uses; and
--   2. only while the match is still pre-match (scheduled / postponed /
--      cancelled). A live or completed game has real scoring data (events, stat
--      lines, standings impact) and can only be Cancelled, never deleted.
--
-- Child rows (match_events, stat_lines, match_lineups, match_squads,
-- match_disputes, reminder_sends) are removed by ON DELETE CASCADE, which runs
-- as a referential action and is not itself subject to RLS — so no child delete
-- policies are needed.

drop policy if exists "delete match" on matches;
create policy "delete match" on matches for delete
  using (
    can_manage_match(id)
    and status in ('scheduled', 'postponed', 'cancelled')
  );
