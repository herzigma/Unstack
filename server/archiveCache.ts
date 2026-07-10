import type { ArchiveSnapshot } from "../src/types";

const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 500;

type CacheValue = ArchiveSnapshot | null;

interface CacheEntry {
  value: CacheValue;
  expiresAt: number;
}

/**
 * Caches both hits and misses (null) for archive.is lookups, keyed by the original
 * article URL. archive.is has no server-side cache to lean on and rate-limits its
 * own lookup endpoints aggressively -- without this, a popular link re-triggers a
 * fresh search/fetch/parse on every page view.
 */
const cache = new Map<string, CacheEntry>();

export function getCached(url: string): CacheValue | undefined {
  const entry = cache.get(url);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(url);
    return undefined;
  }
  return entry.value;
}

export function setCached(url: string, value: CacheValue): void {
  if (cache.size >= MAX_ENTRIES && !cache.has(url)) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(url, { value, expiresAt: Date.now() + TTL_MS });
}

export function clearCache(): void {
  cache.clear();
}
