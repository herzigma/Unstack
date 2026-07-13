import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArchiveSnapshot } from '../src/types';

const providerMocks = vi.hoisted(() => ({
  wayback: vi.fn(),
  archiveIs: vi.fn(),
}));

vi.mock('./platforms/wayback', () => ({
  getWaybackCandidate: providerMocks.wayback,
}));

vi.mock('./platforms/archive', () => ({
  getArchiveIsCandidate: providerMocks.archiveIs,
}));

import { getArchiveCandidate, meetsGainThreshold } from './archive';

function candidate(source: ArchiveSnapshot['source'], textLength: number): ArchiveSnapshot {
  return {
    source,
    snapshotUrl: source === 'wayback'
      ? 'https://web.archive.org/web/20260710095548/https://example.com/article'
      : 'https://archive.is/339i0',
    snapshotDate: null,
    bodyHtml: '<p>Archived article</p>',
    textLength,
  };
}

describe('archive broker', () => {
  beforeEach(() => {
    providerMocks.wayback.mockReset();
    providerMocks.archiveIs.mockReset();
  });

  it('returns a sufficiently fuller Wayback copy without touching archive.is', async () => {
    providerMocks.wayback.mockResolvedValue(candidate('wayback', 9000));

    const result = await getArchiveCandidate('https://example.com/article', 600);

    expect(result?.source).toBe('wayback');
    expect(providerMocks.archiveIs).not.toHaveBeenCalled();
  });

  it('falls through to archive.is when Wayback has no capture', async () => {
    providerMocks.wayback.mockResolvedValue(null);
    providerMocks.archiveIs.mockResolvedValue(candidate('archive.is', 9000));

    const result = await getArchiveCandidate('https://example.com/article', 600);

    expect(result?.source).toBe('archive.is');
  });

  it('falls through when the Wayback capture is not substantially fuller', async () => {
    providerMocks.wayback.mockResolvedValue(candidate('wayback', 3500));
    providerMocks.archiveIs.mockResolvedValue(candidate('archive.is', 9000));

    const result = await getArchiveCandidate('https://example.com/article', 3200);

    expect(result?.source).toBe('archive.is');
  });

  it('isolates a provider exception and continues down the ladder', async () => {
    providerMocks.wayback.mockRejectedValue(new Error('Wayback unavailable'));
    providerMocks.archiveIs.mockResolvedValue(candidate('archive.is', 9000));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await getArchiveCandidate('https://example.com/article', 600);

    expect(result?.source).toBe('archive.is');
    warnSpy.mockRestore();
  });
});

describe('meetsGainThreshold', () => {
  it('accepts a 14.3x gain (662 -> 9459 chars, the WaPo case)', () => {
    expect(meetsGainThreshold(9459, 662)).toBe(true);
  });

  it('rejects a 1.1x gain (3268 -> 3586 chars, the Atlantic case)', () => {
    expect(meetsGainThreshold(3586, 3268)).toBe(false);
  });

  it('accepts any successful extraction when the original had no text', () => {
    expect(meetsGainThreshold(500, 0)).toBe(true);
  });

  it('rejects an empty archive when the original also failed', () => {
    expect(meetsGainThreshold(0, 0)).toBe(false);
  });
});
