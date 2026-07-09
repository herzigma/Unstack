import { beforeEach, describe, expect, it, vi } from 'vitest';

const { parseURLMock } = vi.hoisted(() => ({ parseURLMock: vi.fn() }));

vi.mock('rss-parser', () => ({
  default: vi.fn().mockImplementation(function MockParser() {
    return { parseURL: parseURLMock };
  }),
}));

import { fetchFeed } from './medium';

beforeEach(() => {
  parseURLMock.mockReset();
});

describe('fetchFeed (medium)', () => {
  it('normalizes items from a custom domain /feed', async () => {
    parseURLMock.mockResolvedValue({
      items: [
        {
          guid: 'https://journal.example.com/p/abc123',
          link: 'https://journal.example.com/p/abc123',
          title: 'A Medium Post',
          isoDate: '2026-01-01T00:00:00.000Z',
          contentSnippet: 'A short summary.',
          creator: 'Jane Doe',
        },
      ],
    });

    const posts = await fetchFeed('journal.example.com');

    expect(parseURLMock).toHaveBeenCalledWith('https://journal.example.com/feed');
    expect(posts).toEqual([
      {
        id: 'https://journal.example.com/p/abc123',
        title: 'A Medium Post',
        publishedAt: '2026-01-01T00:00:00.000Z',
        isPaywalled: false,
        canonicalUrl: 'https://journal.example.com/p/abc123',
        description: 'A short summary.',
        authors: [{ id: 'Jane Doe', name: 'Jane Doe' }],
        platform: 'medium',
      },
    ]);
  });

  it('does not attempt a feed lookup for the bare medium.com hostname', async () => {
    const posts = await fetchFeed('medium.com');
    expect(posts).toBeNull();
    expect(parseURLMock).not.toHaveBeenCalled();
  });

  it('returns null when the feed has no items', async () => {
    parseURLMock.mockResolvedValue({ items: [] });
    expect(await fetchFeed('journal.example.com')).toBeNull();
  });

  it('returns null when the request fails', async () => {
    parseURLMock.mockRejectedValue(new Error('network error'));
    expect(await fetchFeed('journal.example.com')).toBeNull();
  });
});
