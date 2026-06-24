import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Home } from './Home';

describe('Home', () => {
  it('submits valid input with parsed domain and slug', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<Home onNavigate={onNavigate} />);

    await user.type(screen.getByPlaceholderText(/pragmaticengineer/i), 'readtangle.substack.com/p/example-post');
    await user.keyboard('{Enter}');

    expect(onNavigate).toHaveBeenCalledWith('readtangle.substack.com', 'example-post');
  });

  it('shows an error for invalid input', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<Home onNavigate={onNavigate} />);

    await user.type(screen.getByPlaceholderText(/pragmaticengineer/i), 'https://');
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Please enter a valid Substack URL or handle.')).toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('fills the input from suggestion buttons', async () => {
    const user = userEvent.setup();
    render(<Home onNavigate={vi.fn()} />);

    const input = screen.getByPlaceholderText(/pragmaticengineer/i);
    await user.click(screen.getByRole('button', { name: 'Platformer' }));

    expect(input).toHaveValue('platformer.news');
  });
});
