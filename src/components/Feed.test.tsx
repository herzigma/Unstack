import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Feed } from './Feed';
import { SubstackPostItem } from '../types';

const post: SubstackPostItem = {
  id: 1,
  title: 'A useful dispatch',
  subtitle: 'A sharp subtitle',
  slug: 'useful-dispatch',
  post_date: '2026-06-24T12:00:00.000Z',
  audience: 'everyone',
  canonical_url: 'https://example.substack.com/p/useful-dispatch',
  description: 'Description',
  type: 'newsletter',
  publishedBylines: [{ id: 1, name: 'Reporter' }],
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
    mockFetch([post]);

    render(<Feed domain="example.substack.com" onNavigate={vi.fn()} onPostClick={onPostClick} />);

    await screen.findByRole('heading', { name: 'A useful dispatch' });
    expect(screen.getByText('A sharp subtitle')).toBeInTheDocument();

    await user.click(screen.getByRole('heading', { name: 'A useful dispatch' }));
    expect(onPostClick).toHaveBeenCalledWith('useful-dispatch');
  });

  it('renders the empty feed state', async () => {
    mockFetch([]);

    render(<Feed domain="example.substack.com" onNavigate={vi.fn()} onPostClick={vi.fn()} />);

    expect(await screen.findByText('No recent posts found for this newsletter.')).toBeInTheDocument();
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

  it('renders invalid feed responses as errors', async () => {
    mockFetch({ posts: [] });

    render(<Feed domain="example.substack.com" onNavigate={vi.fn()} onPostClick={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Invalid feed format received.')).toBeInTheDocument();
    });
  });
});
