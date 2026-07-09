import { beforeEach, describe, expect, it, vi } from 'vitest';

const { parseURLMock } = vi.hoisted(() => ({ parseURLMock: vi.fn() }));

vi.mock('rss-parser', () => ({
  default: vi.fn().mockImplementation(function MockParser() {
    return { parseURL: parseURLMock };
  }),
}));

import { fetchFeed } from './ghost';

beforeEach(() => {
  parseURLMock.mockReset();
});

describe('fetchFeed (ghost)', () => {
  it('normalizes items from /rss/', async () => {
    parseURLMock.mockResolvedValue({
      items: [
        {
          guid: 'https://blog.example.com/post-1',
          link: 'https://blog.example.com/post-1',
          title: 'First Post',
          isoDate: '2026-01-01T00:00:00.000Z',
          contentSnippet: 'A short summary.',
          creator: 'Jane Doe',
        },
      ],
    });

    const posts = await fetchFeed('blog.example.com');

    expect(parseURLMock).toHaveBeenCalledWith('https://blog.example.com/rss/');
    expect(posts).toEqual([
      {
        id: 'https://blog.example.com/post-1',
        title: 'First Post',
        publishedAt: '2026-01-01T00:00:00.000Z',
        isPaywalled: false,
        canonicalUrl: 'https://blog.example.com/post-1',
        description: 'A short summary.',
        coverImage: undefined,
        authors: [{ id: 'Jane Doe', name: 'Jane Doe' }],
        platform: 'ghost',
      },
    ]);
  });

  it('returns null when the feed has no items', async () => {
    parseURLMock.mockResolvedValue({ items: [] });
    expect(await fetchFeed('blog.example.com')).toBeNull();
  });

  it('returns null when the request fails', async () => {
    parseURLMock.mockRejectedValue(new Error('network error'));
    expect(await fetchFeed('blog.example.com')).toBeNull();
  });
});
