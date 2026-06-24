import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Post } from './Post';
import { SubstackPostDetail } from '../types';

const basePost: SubstackPostDetail = {
  id: 1,
  title: 'Peter Thiel’s secret society, exposed',
  subtitle: 'An investigation',
  slug: 'peter-thiels-secret-society-exposed',
  post_date: '2026-06-24T12:00:00.000Z',
  audience: 'everyone',
  canonical_url: 'https://oligarchwatch.substack.com/p/peter-thiels-secret-society-exposed',
  description: 'Description',
  type: 'newsletter',
  body_html: '<p>Inside the story.</p>',
  publishedBylines: [{ id: 1, name: 'Author Name' }],
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

    render(<Post domain="oligarchwatch.substack.com" slug="post-slug" onBack={vi.fn()} />);

    expect(screen.getByText('Loading Post')).toBeInTheDocument();
  });

  it('renders a fetched article', async () => {
    mockFetch(basePost);

    render(<Post domain="oligarchwatch.substack.com" slug="peter-thiels-secret-society-exposed" onBack={vi.fn()} />);

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

    render(<Post domain="oligarchwatch.substack.com" slug="missing-post" onBack={onBack} />);

    expect(await screen.findByRole('heading', { name: 'Article Not Found' })).toBeInTheDocument();
    expect(screen.getByText('Failed to load post.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /return to feed/i }));
    expect(onBack).toHaveBeenCalled();
  });

  it('renders the missing post state when no post is returned', async () => {
    mockFetch(null);

    render(<Post domain="oligarchwatch.substack.com" slug="missing-post" onBack={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Article Not Found' })).toBeInTheDocument();
    expect(screen.getByText('The requested article could not be loaded.')).toBeInTheDocument();
  });

  it('renders the premium preview fallback for paid posts with preview HTML', async () => {
    mockFetch({
      ...basePost,
      audience: 'only_paid',
      body_html: '<p>Preview only.</p>',
    });

    render(<Post domain="oligarchwatch.substack.com" slug="paid-post" onBack={vi.fn()} />);

    expect(await screen.findByText('Preview only.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Premium Content' })).toBeInTheDocument();
  });

  it('renders the unavailable fallback for posts without body HTML', async () => {
    mockFetch({
      ...basePost,
      body_html: '',
    });

    render(<Post domain="oligarchwatch.substack.com" slug="empty-post" onBack={vi.fn()} />);

    expect(await screen.findByText('This content is entirely paywalled or unavailable.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Read original on Substack' })).toHaveAttribute(
      'href',
      basePost.canonical_url,
    );
  });
});
