import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedPostDetail } from '../src/types';
import {
  clearPostCache,
  getCachedPost,
  isPostCacheable,
  POST_CACHE_TTL_MS,
  setCachedPost,
} from './postCache';

const substantialText = 'A complete article sentence with useful public content. '.repeat(40);
const post: NormalizedPostDetail = {
  id: 'https://example.com/article',
  title: 'Article',
  publishedAt: '',
  isPaywalled: false,
  canonicalUrl: 'https://example.com/article',
  platform: 'generic',
  bodyHtml: `<p>${substantialText}</p>`,
  isPreviewOnly: false,
};

describe('post cache', () => {
  beforeEach(() => {
    clearPostCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps successful substantial posts for a fixed 48 hours', () => {
    setCachedPost(post.canonicalUrl, post);

    vi.advanceTimersByTime(POST_CACHE_TTL_MS - 1);
    expect(getCachedPost(post.canonicalUrl)?.title).toBe('Article');

    vi.advanceTimersByTime(2);
    expect(getCachedPost(post.canonicalUrl)).toBeUndefined();
  });

  it('does not extend expiration when a cached article is read', () => {
    setCachedPost(post.canonicalUrl, post);
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(getCachedPost(post.canonicalUrl)).toBeDefined();
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
    expect(getCachedPost(post.canonicalUrl)).toBeUndefined();
  });

  it('classifies thin, preview-only, and paywalled results as uncacheable', () => {
    expect(isPostCacheable(post)).toBe(true);
    expect(isPostCacheable({ ...post, bodyHtml: '<p>Thin.</p>' })).toBe(false);
    expect(isPostCacheable({ ...post, isPreviewOnly: true })).toBe(false);
    expect(isPostCacheable({ ...post, isPaywalled: true })).toBe(false);
    expect(isPostCacheable(post, 'https://example.com/article?token=secret')).toBe(false);
  });

  it('returns a copy so callers cannot mutate the cached post', () => {
    setCachedPost(post.canonicalUrl, post);
    const first = getCachedPost(post.canonicalUrl)!;
    first.title = 'Mutated';

    expect(getCachedPost(post.canonicalUrl)?.title).toBe('Article');
  });
});
