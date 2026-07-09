import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

describe('App routing', () => {
  it('strips query strings before rendering routed content', async () => {
    const fetch = vi.fn().mockImplementation(() => {
      expect(window.location.search).toBe('');

      return Promise.resolve({
        ok: true,
        json: vi.fn().mockResolvedValue({ platform: 'substack', posts: [] }),
      });
    });
    vi.stubGlobal('fetch', fetch);
    window.history.pushState({}, '', '/publication.substack.com?utm_source=feed#latest');

    render(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/publication.substack.com');
      expect(window.location.search).toBe('');
      expect(window.location.hash).toBe('#latest');
    });

    await screen.findByText('No recent posts found for this newsletter.');
    expect(fetch).toHaveBeenCalledWith('/api/feed?domain=publication.substack.com');
  });

  it('opens shared PWA target URLs as clean Unstack routes', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        id: '1',
        title: 'Shared Post',
        publishedAt: '2026-06-24T12:00:00.000Z',
        isPaywalled: false,
        canonicalUrl: 'https://readtangle.substack.com/p/shared-post',
        description: 'Description',
        platform: 'substack',
        bodyHtml: '<p>Shared body.</p>',
        isPreviewOnly: false,
        siteName: 'Substack',
      }),
    });
    vi.stubGlobal('fetch', fetch);
    window.history.pushState(
      {},
      '',
      '/share-target?url=https%3A%2F%2Freadtangle.substack.com%2Fp%2Fshared-post',
    );

    render(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/readtangle.substack.com/p/shared-post');
      expect(window.location.search).toBe('');
    });

    expect(await screen.findByRole('heading', { name: 'Shared Post' })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      `/api/post?url=${encodeURIComponent('https://readtangle.substack.com/p/shared-post')}`,
    );
  });
});
