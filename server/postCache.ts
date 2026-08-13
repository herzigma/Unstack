import type { NormalizedPostDetail } from "../src/types";

export const POST_CACHE_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_ENTRIES = 250;
const MIN_TEXT_LENGTH = 1500;
const MAX_BODY_HTML_CHARS = 500_000;

interface CacheEntry {
  post: NormalizedPostDetail;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function estimateTextLength(html: string): number {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
}

function clonePost(post: NormalizedPostDetail): NormalizedPostDetail {
  return {
    ...post,
    authors: post.authors?.map((author) => ({ ...author })),
  };
}

/** Cache only complete public-looking extractions; never freeze errors or previews for two days. */
export function isPostCacheable(
  post: NormalizedPostDetail,
  requestUrl = post.canonicalUrl,
): boolean {
  let hasSensitiveQuery = true;
  try {
    const parsed = new URL(requestUrl);
    hasSensitiveQuery = [...parsed.searchParams.keys()].some((key) =>
      /^(access_token|auth|authorization|key|session|signature|sig|token)$/i.test(key),
    );
  } catch {
    // Invalid URLs are never suitable cache keys.
  }
  return (
    !hasSensitiveQuery &&
    !post.isPaywalled &&
    !post.isPreviewOnly &&
    post.bodyHtml.length <= MAX_BODY_HTML_CHARS &&
    estimateTextLength(post.bodyHtml) >= MIN_TEXT_LENGTH
  );
}

export function getCachedPost(url: string): NormalizedPostDetail | undefined {
  const entry = cache.get(url);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(url);
    return undefined;
  }
  return clonePost(entry.post);
}

export function setCachedPost(url: string, post: NormalizedPostDetail): void {
  if (cache.size >= MAX_ENTRIES && !cache.has(url)) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(url, { post: clonePost(post), expiresAt: Date.now() + POST_CACHE_TTL_MS });
}

export function clearPostCache(): void {
  cache.clear();
}
