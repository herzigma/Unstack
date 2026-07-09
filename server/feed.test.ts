import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./platforms/substack', () => ({ fetchFeed: vi.fn() }));
vi.mock('./platforms/ghost', () => ({ fetchFeed: vi.fn() }));
vi.mock('./platforms/medium', () => ({ fetchFeed: vi.fn() }));

import * as substack from './platforms/substack';
import * as ghost from './platforms/ghost';
import * as medium from './platforms/medium';
import { getFeed } from './feed';

beforeEach(() => {
  vi.mocked(substack.fetchFeed).mockReset();
  vi.mocked(ghost.fetchFeed).mockReset();
  vi.mocked(medium.fetchFeed).mockReset();
});

describe('getFeed cascade', () => {
  it('uses Substack when it matches', async () => {
    vi.mocked(substack.fetchFeed).mockResolvedValue([{ id: '1' } as any]);

    const result = await getFeed('example.substack.com');

    expect(result.platform).toBe('substack');
    expect(ghost.fetchFeed).not.toHaveBeenCalled();
    expect(medium.fetchFeed).not.toHaveBeenCalled();
  });

  it('falls through to Ghost when Substack does not match', async () => {
    vi.mocked(substack.fetchFeed).mockResolvedValue(null);
    vi.mocked(ghost.fetchFeed).mockResolvedValue([{ id: '1' } as any]);

    const result = await getFeed('blog.example.com');

    expect(result.platform).toBe('ghost');
    expect(medium.fetchFeed).not.toHaveBeenCalled();
  });

  it('falls through to Medium when Substack and Ghost do not match', async () => {
    vi.mocked(substack.fetchFeed).mockResolvedValue(null);
    vi.mocked(ghost.fetchFeed).mockResolvedValue(null);
    vi.mocked(medium.fetchFeed).mockResolvedValue([{ id: '1' } as any]);

    const result = await getFeed('journal.example.com');

    expect(result.platform).toBe('medium');
  });

  it('returns platform null with no posts when nothing matches', async () => {
    vi.mocked(substack.fetchFeed).mockResolvedValue(null);
    vi.mocked(ghost.fetchFeed).mockResolvedValue(null);
    vi.mocked(medium.fetchFeed).mockResolvedValue(null);

    const result = await getFeed('unknown.example.com');

    expect(result).toEqual({ platform: null, posts: [] });
  });
});
