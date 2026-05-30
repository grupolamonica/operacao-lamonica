/**
 * Ranking data layer — cache invalidation helper.
 *
 * Exports ONE cache-bust helper: `bustRankingCache`. Call this after every ranking
 * write so the next read recomputes from fresh source data (D-09-04).
 *
 * Why busting matters:
 *   Evaluations, driver_blocks, and route_scores are fetched live from Supabase on
 *   each request — they are NOT Redis-cached. The practical cached lever is the
 *   Google-Sheets trips CSV (TTL 60s, key `ranking:sheets:trips` from ranking.sheets.ts).
 *   Busting this key forces an immediate re-fetch of the CSV on the next read, so
 *   scoring recomputes against the freshest available source within one request cycle.
 *
 * LAZY Redis import: `../../redis/client` throws at module-load if REDIS_URL is
 * unset (fail-fast in the client). Importing it at top-level here would crash the
 * pure-composition unit tests (ranking.scoring.test / ranking.service.test) that
 * import ranking modules without Redis configured. The same deferred-import pattern
 * used in ranking.sheets.ts (`async function getRedis()`) is applied here.
 *
 * Redis errors propagate to the caller — this module does NOT swallow them. The
 * endpoint layer decides whether to treat a Redis failure as best-effort or fatal.
 */

import { SHEET_TRIPS_CACHE_KEY } from './ranking.sheets';

// Lazy redis import — mirrors ranking.sheets.ts exactly (never top-level).
async function getRedis() {
  const { redis } = await import('../../redis/client');
  return redis;
}

/**
 * Deletes the ranking sheets trips cache key from Redis.
 *
 * After any ranking write (evaluation, block, unblock, route-score change), call
 * this so the next `/api/ranking/*` read recomputes from the freshest CSV + DB data.
 */
export async function bustRankingCache(): Promise<void> {
  const redis = await getRedis();
  await redis.del(SHEET_TRIPS_CACHE_KEY);
}
