import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Post } from './Post';
import { NormalizedPostDetail } from '../types';

const basePost: NormalizedPostDetail = {
  id: '1',
  title: 'Peter Thiel’s secret society, exposed',
  subtitle: 'An investigation',
  publishedAt: '2026-06-24T12:00:00.000Z',
  isPaywalled: false,
  canonicalUrl: 'https://oligarchwatch.substack.com/p/peter-thiels-secret-society-exposed',
  description: 'Description',
  authors: [{ id: '1', name: 'Author Name' }],
  platform: 'substack',
  bodyHtml: '<p>Inside the story.</p>',
  isPreviewOnly: false,
  siteName: 'Substack',
};

function mockFetch(data: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      json: vi.fn().mockResolvedValue(data),
    }),
  );
}

describe('Post', () => {
  it('shows a loading state while fetching', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));

    render(<Post domain="oligarchwatch.substack.com" url={basePost.canonicalUrl} onBack={vi.fn()} />);

    expect(screen.getByText('Loading Post')).toBeInTheDocument();
  });

  it('renders a fetched article', async () => {
    mockFetch(basePost);

    render(<Post domain="oligarchwatch.substack.com" url={basePost.canonicalUrl} onBack={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Peter Thiel’s secret society, exposed' })).toBeInTheDocument();
    expect(screen.getByText('Inside the story.')).toBeInTheDocument();
    expect(screen.getByText('Author Name')).toBeInTheDocument();
    expect(document.title).toBe('[Unstack] Peter Thiel’s secret society, exposed');
  });

  it('renders the error state and calls onBack', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn(),
      }),
    );

    render(<Post domain="oligarchwatch.substack.com" url="https://oligarchwatch.substack.com/p/missing-post" onBack={onBack} />);

    expect(await screen.findByRole('heading', { name: 'Article Not Found' })).toBeInTheDocument();
    expect(screen.getByText('Failed to load post.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /return to feed/i }));
    expect(onBack).toHaveBeenCalled();
  });

  it('renders the missing post state when no post is returned', async () => {
    mockFetch(null);

    render(<Post domain="oligarchwatch.substack.com" url="https://oligarchwatch.substack.com/p/missing-post" onBack={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Article Not Found' })).toBeInTheDocument();
    expect(screen.getByText('The requested article could not be loaded.')).toBeInTheDocument();
  });

  it('renders the premium preview fallback for paid posts with preview HTML', async () => {
    mockFetch({
      ...basePost,
      isPaywalled: true,
      isPreviewOnly: true,
      bodyHtml: '<p>Preview only.</p>',
    });

    render(<Post domain="oligarchwatch.substack.com" url="https://oligarchwatch.substack.com/p/paid-post" onBack={vi.fn()} />);

    expect(await screen.findByText('Preview only.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Premium Content' })).toBeInTheDocument();
  });

  it('renders the unavailable fallback for posts without body HTML', async () => {
    mockFetch({
      ...basePost,
      bodyHtml: '',
    });

    render(<Post domain="oligarchwatch.substack.com" url="https://oligarchwatch.substack.com/p/empty-post" onBack={vi.fn()} />);

    expect(await screen.findByText('This content is entirely paywalled or unavailable.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Read original on Substack' })).toHaveAttribute(
      'href',
      basePost.canonicalUrl,
    );
  });

  describe('archive.is fallback', () => {
    const archiveSnapshot = {
      source: 'archive.is' as const,
      snapshotUrl: 'https://archive.is/339i0',
      snapshotDate: '10 Jul 2026 09:55',
      bodyHtml: '<p>The full, unpaywalled article body from archive.is.</p>',
      textLength: 9459,
    };

    function mockPostThenArchive(post: unknown, archiveStatus: number, archiveBody?: unknown) {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.startsWith('/api/post')) {
          return Promise.resolve({ ok: true, json: vi.fn().mockResolvedValue(post) });
        }
        return Promise.resolve({
          status: archiveStatus,
          json: vi.fn().mockResolvedValue(archiveBody),
        });
      });
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    it('swaps in the archive.is copy when the post is flagged as worth checking', async () => {
      mockPostThenArchive(
        { ...basePost, bodyHtml: '<p>Stub only.</p>', archiveWorthChecking: true },
        200,
        archiveSnapshot,
      );

      render(<Post domain="washingtonpost.com" url={basePost.canonicalUrl} onBack={vi.fn()} />);

      expect(await screen.findByText('Stub only.')).toBeInTheDocument();
      expect(await screen.findByText(/Fuller copy found on archive.is/)).toBeInTheDocument();
      expect(await screen.findByText('The full, unpaywalled article body from archive.is.')).toBeInTheDocument();
    });

    it('lets the reader toggle back to the original after a swap', async () => {
      const user = userEvent.setup();
      mockPostThenArchive(
        { ...basePost, bodyHtml: '<p>Stub only.</p>', archiveWorthChecking: true },
        200,
        archiveSnapshot,
      );

      render(<Post domain="washingtonpost.com" url={basePost.canonicalUrl} onBack={vi.fn()} />);
      await screen.findByText('The full, unpaywalled article body from archive.is.');

      await user.click(screen.getByRole('button', { name: /show original instead/i }));

      expect(screen.getByText('Stub only.')).toBeInTheDocument();
      expect(screen.getByText('Showing the original article.')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /show archived copy/i }));
      expect(screen.getByText('The full, unpaywalled article body from archive.is.')).toBeInTheDocument();
    });

    it('does not check archive.is when the post is not flagged', async () => {
      const fetchMock = mockPostThenArchive({ ...basePost, archiveWorthChecking: false }, 204);

      render(<Post domain="oligarchwatch.substack.com" url={basePost.canonicalUrl} onBack={vi.fn()} />);

      await screen.findByText('Inside the story.');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/archive'));
    });

    it('leaves the page unchanged when archive.is has no better copy (204)', async () => {
      mockPostThenArchive({ ...basePost, bodyHtml: '<p>Stub only.</p>', archiveWorthChecking: true }, 204);

      render(<Post domain="washingtonpost.com" url={basePost.canonicalUrl} onBack={vi.fn()} />);

      await screen.findByText('Stub only.');
      expect(screen.queryByText(/Fuller copy found on archive.is/)).not.toBeInTheDocument();
      expect(
        await screen.findByText(/Showing what Unstack could retrieve from the original source/),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /check archive\.is/i })).toHaveAttribute(
        'href',
        `https://archive.is/search/?q=${encodeURIComponent(basePost.canonicalUrl)}`,
      );
      expect(screen.getByRole('link', { name: /check wayback/i })).toHaveAttribute(
        'href',
        `https://web.archive.org/web/*/${basePost.canonicalUrl}`,
      );
    });

    it('keeps the original content and links to archive.is when the lookup request fails', async () => {
      const fetchMock = vi.fn().mockImplementation((requestUrl: string) => {
        if (requestUrl.startsWith('/api/post')) {
          return Promise.resolve({
            ok: true,
            json: vi.fn().mockResolvedValue({
              ...basePost,
              bodyHtml: '<p>Original-source preview.</p>',
              archiveWorthChecking: true,
            }),
          });
        }
        return Promise.reject(new Error('archive unavailable'));
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<Post domain="washingtonpost.com" url={basePost.canonicalUrl} onBack={vi.fn()} />);

      expect(await screen.findByText('Original-source preview.')).toBeInTheDocument();
      const archiveLink = await screen.findByRole('link', { name: /check archive\.is/i });
      expect(archiveLink).toHaveAttribute('target', '_blank');
      expect(archiveLink).toHaveAttribute('rel', 'noopener noreferrer');
      expect(screen.getByRole('link', { name: /check wayback/i })).toHaveAttribute(
        'target',
        '_blank',
      );
    });

    it('labels a Wayback result with its provider', async () => {
      mockPostThenArchive(
        { ...basePost, bodyHtml: '<p>Stub only.</p>', archiveWorthChecking: true },
        200,
        {
          ...archiveSnapshot,
          source: 'wayback',
          snapshotUrl: 'https://web.archive.org/web/20260710095548/https://example.com/article',
        },
      );

      render(<Post domain="washingtonpost.com" url={basePost.canonicalUrl} onBack={vi.fn()} />);

      expect(await screen.findByText(/Fuller copy found on the Wayback Machine/)).toBeInTheDocument();
    });
  });
});
