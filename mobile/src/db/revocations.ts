import { db } from './database';

export interface CachedRevocationList {
  token: string;
  iat: number;
  fetchedAt: number;
}

/** The cached SR1 list (docs/05 `revocations`, 1 row), or null when none has been synced yet. */
export function getRevocationList(): CachedRevocationList | null {
  const r = db().getFirstSync<{ token: string; iat: number; fetched_at: number }>(
    'SELECT token, iat, fetched_at FROM revocations WHERE id = 1',
  );
  return r === null ? null : { token: r.token, iat: r.iat, fetchedAt: r.fetched_at };
}
