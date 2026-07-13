import type { NormalizedPostDetail } from "../src/types";

const TTL_MS = 30 * 1000;
const MAX_ENTRIES = 50;

interface CacheEntry {
  post: NormalizedPostDetail;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Keeps the post fetched while rendering an article's HTML head long enough for
 * the browser's immediate /api/post request to reuse it. Entries are one-use so
 * live articles do not become generally cached or stale.
 */
export function cachePreviewPost(url: string, post: NormalizedPostDetail): void {
  if (cache.size >= MAX_ENTRIES && !cache.has(url)) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(url, { post, expiresAt: Date.now() + TTL_MS });
}

export function takePreviewPost(url: string): NormalizedPostDetail | undefined {
  const entry = cache.get(url);
  if (!entry) return undefined;

  cache.delete(url);
  return entry.expiresAt >= Date.now() ? entry.post : undefined;
}

export function clearPreviewPostCache(): void {
  cache.clear();
}
