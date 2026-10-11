/**
 * Legal L15 (migration protect_minors) — follower alerts about a player under 18
 * (or with no date of birth) go only to followers still in that player's circle:
 * teammates, coaches, tournament / org people and their guardian. A follow made
 * before the migration, or by someone who has since left the team, is kept but
 * gets no match-time / venue / result pushes.
 *
 * Pure apart from the one RPC call (no Deno / Node APIs), so the app's node tests
 * can load it too.
 */
export interface FollowPair { follower_id: string; target_id: string }

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
};

/** Before the migration the function doesn't exist → keep every follow (as before). */
const isMissingFunction = (e: { code?: string; message?: string }) =>
  ['PGRST202', '42883'].includes(e.code ?? '') || /allowed_player_follows/i.test(e.message ?? '') && /not find|does not exist/i.test(e.message ?? '');

/** The (follower, player) follows of these players that may get alerts; null =
 *  no filter available (pre-migration). Any other error → none (fail closed). */
export async function allowedPlayerFollows(client: RpcClient, playerIds: string[]): Promise<FollowPair[] | null> {
  if (!playerIds.length) return [];
  const { data, error } = await client.rpc('allowed_player_follows', { p_player_ids: playerIds });
  if (error) return isMissingFunction(error) ? null : [];
  return (data ?? []) as FollowPair[];
}

/** Keep only allowed follows (all of them when `allowed` is null). */
export function keepAllowedFollows<T extends { follower_id: string; target_id?: string }>(rows: T[], allowed: FollowPair[] | null): T[] {
  if (!allowed) return rows;
  const ok = new Set(allowed.map((a) => `${a.follower_id}:${a.target_id}`));
  return rows.filter((r) => ok.has(`${r.follower_id}:${r.target_id}`));
}
