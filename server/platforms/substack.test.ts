import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseSubstackPreloads,
  normalizeDetail,
  extractPostFromHtml,
  fetchPostFallbackApi,
  fetchFeed,
} from './substack';

function mockFetchOnce(text: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      text: vi.fn().mockResolvedValue(text),
    }),
  );
}

function buildPreloadHtml(data: Record<string, unknown>): string {
  const jsonText = JSON.stringify(data);
  return `<script>window._preloads = JSON.parse(${JSON.stringify(jsonText)})</script>`;
}

const RAW_POST = {
  id: 42,
  title: 'Test Post',
  subtitle: 'A subtitle',
  slug: 'test-post',
  post_date: '2026-01-15T12:00:00.000Z',
  audience: 'everyone',
  canonical_url: 'https://example.substack.com/p/test-post',
  description: 'Short desc',
  cover_image: 'https://img.example.com/cover.jpg',
  body_html: '<p>Hello world</p>',
  publishedBylines: [{ id: 7, name: 'Alice', photo_url: 'https://img.example.com/alice.jpg' }],
};

describe('parseSubstackPreloads', () => {
  it('parses a valid preload blob', () => {
    const html = buildPreloadHtml({ post: RAW_POST });
    const result = parseSubstackPreloads(html);
    expect(result).toEqual({ post: RAW_POST });
  });

  it('returns null when no window._preloads is present', () => {
    expect(parseSubstackPreloads('<html><body>No preloads here</body></html>')).toBeNull();
  });

  it('returns null for malformed inner JSON without throwing', () => {
    const html = `<script>window._preloads = JSON.parse("not valid json")</script>`;
    expect(() => parseSubstackPreloads(html)).toThrow();
  });
});

describe('normalizeDetail', () => {
  it('maps raw Substack fields to the normalized shape', () => {
    const result = normalizeDetail(RAW_POST);

    expect(result.id).toBe('42');
    expect(result.title).toBe('Test Post');
    expect(result.subtitle).toBe('A subtitle');
    expect(result.publishedAt).toBe('2026-01-15T12:00:00.000Z');
    expect(result.canonicalUrl).toBe('https://example.substack.com/p/test-post');
    expect(result.description).toBe('Short desc');
    expect(result.coverImage).toBe('https://img.example.com/cover.jpg');
    expect(result.bodyHtml).toBe('<p>Hello world</p>');
    expect(result.platform).toBe('substack');
    expect(result.siteName).toBe('Substack');
    expect(result.authors).toEqual([
      { id: '7', name: 'Alice', photoUrl: 'https://img.example.com/alice.jpg' },
    ]);
  });

  it('sets isPaywalled true and isPreviewOnly true when audience is only_paid and body exists', () => {
    const result = normalizeDetail({ ...RAW_POST, audience: 'only_paid' });
    expect(result.isPaywalled).toBe(true);
    expect(result.isPreviewOnly).toBe(true);
  });

  it('sets isPreviewOnly false when paywalled but body is empty', () => {
    const result = normalizeDetail({ ...RAW_POST, audience: 'only_paid', body_html: '' });
    expect(result.isPaywalled).toBe(true);
    expect(result.isPreviewOnly).toBe(false);
  });

  it('sets isPaywalled false for everyone audience', () => {
    const result = normalizeDetail(RAW_POST);
    expect(result.isPaywalled).toBe(false);
    expect(result.isPreviewOnly).toBe(false);
  });
});

describe('extractPostFromHtml', () => {
  it('extracts from data.post key', () => {
    const html = buildPreloadHtml({ post: RAW_POST });
    expect(extractPostFromHtml(html)).toEqual(RAW_POST);
  });

  it('extracts from data.postDetail key', () => {
    const html = buildPreloadHtml({ postDetail: RAW_POST });
    expect(extractPostFromHtml(html)).toEqual(RAW_POST);
  });

  it('extracts from data.pub.post key', () => {
    const html = buildPreloadHtml({ pub: { post: RAW_POST } });
    expect(extractPostFromHtml(html)).toEqual(RAW_POST);
  });

  it('returns null for non-Substack HTML', () => {
    expect(extractPostFromHtml('<html><body>Regular page</body></html>')).toBeNull();
  });
});

describe('fetchPostFallbackApi', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls the API for a /p/<slug> URL and returns parsed JSON', async () => {
    mockFetchOnce(JSON.stringify(RAW_POST));
    const result = await fetchPostFallbackApi('https://example.substack.com/p/test-post');
    expect(result).toEqual(RAW_POST);
    expect(fetch).toHaveBeenCalledWith(
      'https://example.substack.com/api/v1/posts/test-post',
      expect.any(Object),
    );
  });

  it('returns null without making a network call for non-/p/ URLs', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await fetchPostFallbackApi('https://blog.example.com/some-article');
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const result = await fetchPostFallbackApi('https://example.substack.com/p/test-post');
    expect(result).toBeNull();
  });
});

describe('fetchFeed', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns normalized summaries from a successful API array response', async () => {
    mockFetchOnce(JSON.stringify([RAW_POST]));
    const result = await fetchFeed('example.substack.com');
    expect(result).not.toBeNull();
    expect(result![0].id).toBe('42');
    expect(result![0].platform).toBe('substack');
    expect(result![0].title).toBe('Test Post');
  });

  it('falls back to archive HTML preload when API returns non-JSON', async () => {
    const archiveData = { newPostsForArchive: [RAW_POST] };
    const archiveHtml = buildPreloadHtml(archiveData);

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({ text: vi.fn().mockResolvedValue('Not JSON') })
        .mockResolvedValueOnce({ text: vi.fn().mockResolvedValue(archiveHtml) }),
    );

    const result = await fetchFeed('example.substack.com');
    expect(result).not.toBeNull();
    expect(result![0].title).toBe('Test Post');
  });

  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const result = await fetchFeed('example.substack.com');
    expect(result).toBeNull();
  });
});
