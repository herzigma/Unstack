import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Feed } from './Feed';
import { NormalizedPostSummary } from '../types';

const post: NormalizedPostSummary = {
  id: '1',
  title: 'A useful dispatch',
  subtitle: 'A sharp subtitle',
  publishedAt: '2026-06-24T12:00:00.000Z',
  isPaywalled: false,
  canonicalUrl: 'https://example.substack.com/p/useful-dispatch',
  description: 'Description',
  authors: [{ id: '1', name: 'Reporter' }],
  platform: 'substack',
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

describe('Feed', () => {
  it('shows a loading state while fetching', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));

    render(<Feed domain="example.substack.com" onNavigate={vi.fn()} onPostClick={vi.fn()} />);

    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders fetched posts and handles post clicks', async () => {
    const user = userEvent.setup();
    const onPostClick = vi.fn();
    mockFetch({ platform: 'substack', posts: [post] });

    render(<Feed domain="example.substack.com" onNavigate={vi.fn()} onPostClick={onPostClick} />);

    await screen.findByRole('heading', { name: 'A useful dispatch' });
    expect(screen.getByText('A sharp subtitle')).toBeInTheDocument();

    await user.click(screen.getByRole('heading', { name: 'A useful dispatch' }));
    expect(onPostClick).toHaveBeenCalledWith('https://example.substack.com/p/useful-dispatch');
  });

  it('renders the empty feed state for a known platform with no posts', async () => {
    mockFetch({ platform: 'substack', posts: [] });

    render(<Feed domain="example.substack.com" onNavigate={vi.fn()} onPostClick={vi.fn()} />);

    expect(await screen.findByText('No recent posts found for this newsletter.')).toBeInTheDocument();
  });

  it('steers toward a direct link when no feed convention matched', async () => {
    mockFetch({ platform: null, posts: [] });

    render(<Feed domain="example.beehiiv.com" onNavigate={vi.fn()} onPostClick={vi.fn()} />);

    expect(await screen.findByText("This site doesn't support feed browsing.")).toBeInTheDocument();
    expect(screen.getByText('Try pasting a direct article link instead.')).toBeInTheDocument();
  });

  it('renders fetch errors and lets users return to search', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn(),
      }),
    );

    render(<Feed domain="example.substack.com" onNavigate={onNavigate} onPostClick={vi.fn()} />);

    expect(await screen.findByText('Error loading feed')).toBeInTheDocument();
    expect(screen.getByText('Failed to load newsletter feed.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try another feed' }));
    expect(onNavigate).toHaveBeenCalledWith('', null);
  });
});
