import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

describe('App routing', () => {
  it('strips query strings before rendering routed content', async () => {
    const fetch = vi.fn().mockImplementation(() => {
      expect(window.location.search).toBe('');

      return Promise.resolve({
        ok: true,
        json: vi.fn().mockResolvedValue([]),
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
});
