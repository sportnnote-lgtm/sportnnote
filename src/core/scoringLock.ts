/**
 * One active scorer at a time (migration 0039). Pure — what the lock means
 * for THIS device.
 */
export interface ScoringLock {
  /** false = the database doesn't have the lock yet (pre-migration) */
  supported: boolean;
  holderId?: string | null;
  holderName?: string | null;
  /** the holder's device; null = handed over, binds on their first tap */
  device?: string | null;
  /** last scoring activity (ISO) */
  at?: string | null;
}

export type LockStatus = 'unsupported' | 'free' | 'mine' | 'mine-other-device' | 'other';

export function lockStatus(lock: ScoringLock | null | undefined, myPlayerId: string | null | undefined, deviceId: string): LockStatus {
  if (!lock || !lock.supported) return 'unsupported';
  if (!lock.holderId) return 'free';
  if (myPlayerId && lock.holderId === myPlayerId) {
    return !lock.device || lock.device === deviceId ? 'mine' : 'mine-other-device';
  }
  return 'other';
}

/** May this device write events right now? (Free → the first tap takes the lock.) */
export const canWriteWith = (status: LockStatus) => status === 'mine' || status === 'free' || status === 'unsupported';
