import type { ArchiveSnapshot } from "../src/types";

const HIT_TTL_MS = 48 * 60 * 60 * 1000;
const MISS_TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 500;

type CacheValue = ArchiveSnapshot | null;

interface CacheEntry {
  value: CacheValue;
  expiresAt: number;
}

/**
 * Caches both hits and authoritative misses (null), keyed by provider + original
 * article URL. Keeping providers separate lets the broker fall through when one
 * archive has no capture without suppressing another archive's result.
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
  const ttl = value === null ? MISS_TTL_MS : HIT_TTL_MS;
  cache.set(url, { value, expiresAt: Date.now() + ttl });
}

export function clearCache(): void {
  cache.clear();
}
