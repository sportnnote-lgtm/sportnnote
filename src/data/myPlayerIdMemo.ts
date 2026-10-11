/**
 * Memo for "which player row belongs to this signed-in profile" (perf audit
 * F-10). `getMyPlayerId` used to be a fresh network read on every call — six to
 * eight at launch and more on every Home focus — although the answer only
 * changes when the account creates or claims its own player.
 *
 * Rules:
 *  - keyed by profile id: asking for another profile never returns the old id;
 *  - concurrent callers share one in-flight read;
 *  - only a found id is kept. "No player yet" (or a failed read) is never
 *    cached, so a player created anywhere else is picked up on the next call;
 *  - `clear()` drops everything, and a read that was already in flight when
 *    it was cleared cannot write its (possibly stale) answer back.
 *
 * Cleared on sign-out and account switch (core/auth.tsx) and set by
 * createMyPlayer (create or claim). Pure — no imports — so it is unit-tested.
 */
export interface PlayerIdMemo {
  get(profileId: string, load: (profileId: string) => Promise<string | null>): Promise<string | null>;
  /** Record a freshly created/claimed player id for this profile. */
  set(profileId: string, playerId: string | null): void;
  clear(): void;
}

export function createPlayerIdMemo(): PlayerIdMemo {
  let gen = 0;
  let key: string | null = null;
  let value: string | null = null;
  let inflight: { key: string; gen: number; promise: Promise<string | null> } | null = null;

  return {
    get(profileId, load) {
      if (key === profileId && value) return Promise.resolve(value);
      if (inflight && inflight.key === profileId && inflight.gen === gen) return inflight.promise;
      const myGen = gen;
      const promise = load(profileId).then(
        (id) => {
          if (myGen === gen && id) { key = profileId; value = id; }
          if (inflight?.promise === promise) inflight = null;
          return id;
        },
        (e: unknown) => {
          if (inflight?.promise === promise) inflight = null;
          throw e;
        },
      );
      inflight = { key: profileId, gen: myGen, promise };
      return promise;
    },
    set(profileId, playerId) {
      gen++;
      inflight = null;
      key = playerId ? profileId : null;
      value = playerId;
    },
    clear() {
      gen++;
      inflight = null;
      key = null;
      value = null;
    },
  };
}

/** The app-wide memo used by repos.getMyPlayerId. */
export const myPlayerIdMemo = createPlayerIdMemo();

/** Forget the cached player id (sign-out, account switch). */
export function clearMyPlayerIdCache(): void {
  myPlayerIdMemo.clear();
}
