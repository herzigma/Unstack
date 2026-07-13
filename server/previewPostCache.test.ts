import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cachePreviewPost, clearPreviewPostCache, takePreviewPost } from './previewPostCache';
import type { NormalizedPostDetail } from '../src/types';

const post: NormalizedPostDetail = {
  id: 'story',
  title: 'Story',
  publishedAt: '',
  isPaywalled: false,
  canonicalUrl: 'https://publisher.example/story',
  platform: 'generic',
  bodyHtml: '<p>Body</p>',
  isPreviewOnly: false,
};

describe('preview post cache', () => {
  beforeEach(() => {
    clearPreviewPostCache();
    vi.useRealTimers();
  });

  it('reuses a preview-fetched post exactly once', () => {
    cachePreviewPost(post.canonicalUrl, post);

    expect(takePreviewPost(post.canonicalUrl)).toBe(post);
    expect(takePreviewPost(post.canonicalUrl)).toBeUndefined();
  });

  it('rejects entries after the short handoff window', () => {
    vi.useFakeTimers();
    cachePreviewPost(post.canonicalUrl, post);
    vi.advanceTimersByTime(30_001);

    expect(takePreviewPost(post.canonicalUrl)).toBeUndefined();
  });
});
