import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArchiveSnapshot } from '../src/types';
import { clearCache, getCached, setCached } from './archiveCache';

const snapshot: ArchiveSnapshot = {
  source: 'wayback',
  snapshotUrl: 'https://web.archive.org/web/20260710172315/https://example.com/article',
  snapshotDate: null,
  bodyHtml: '<p>Archived article.</p>',
  textLength: 17,
};

describe('archive cache TTLs', () => {
  beforeEach(() => {
    clearCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps immutable snapshot hits for 48 hours', () => {
    setCached('wayback:https://example.com/article', snapshot);
    vi.advanceTimersByTime(48 * 60 * 60 * 1000 - 1);
    expect(getCached('wayback:https://example.com/article')).toEqual(snapshot);
    vi.advanceTimersByTime(2);
    expect(getCached('wayback:https://example.com/article')).toBeUndefined();
  });

  it('expires misses after one hour so newly-created captures can appear', () => {
    setCached('wayback:https://example.com/missing', null);
    vi.advanceTimersByTime(60 * 60 * 1000 - 1);
    expect(getCached('wayback:https://example.com/missing')).toBeNull();
    vi.advanceTimersByTime(2);
    expect(getCached('wayback:https://example.com/missing')).toBeUndefined();
  });
});
