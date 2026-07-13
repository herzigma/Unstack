import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../archiveCache';
import {
  fetchWaybackSnapshot,
  findWaybackSnapshot,
  getWaybackCandidate,
} from './wayback';

const paragraph =
  'This is substantive archived article text that gives Readability enough content to identify the main story. ';
const ARTICLE_HTML = `<html><head><title>Archived story</title></head><body><article><h1>Archived story</h1><p>${paragraph.repeat(20)}</p></article></body></html>`;

function availability(snapshot?: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(
      snapshot
        ? { archived_snapshots: { closest: snapshot } }
        : { archived_snapshots: {} },
    ),
  };
}

function htmlResponse(html: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: 'https://web.archive.org/web/20260710095548/https://example.com/article',
    text: vi.fn().mockResolvedValue(html),
  };
}

describe('Wayback provider', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    clearCache();
  });

  it('uses the documented availability response and normalizes snapshot URLs to HTTPS', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      availability({
        available: true,
        status: '200',
        timestamp: '20260710095548',
        url: 'http://web.archive.org/web/20260710095548/http://example.com/article',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await findWaybackSnapshot('https://example.com/article');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://archive.org/wayback/available?url=https%3A%2F%2Fexample.com%2Farticle',
    );
    expect(result).toEqual({
      snapshotUrl: 'https://web.archive.org/web/20260710095548/http://example.com/article',
      timestamp: '20260710095548',
      snapshotDate: '10 Jul 2026 09:55 UTC',
    });
  });

  it('rejects an unexpected snapshot host returned by the availability service', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        availability({
          available: true,
          status: '200',
          timestamp: '20260710095548',
          url: 'https://attacker.example/snapshot',
        }),
      ),
    );

    await expect(findWaybackSnapshot('https://example.com/article')).rejects.toThrow(
      'unexpected snapshot URL',
    );
  });

  it('extracts an article from a reachable Wayback replay', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse(ARTICLE_HTML)));

    const result = await fetchWaybackSnapshot(
      'https://web.archive.org/web/20260710095548/https://example.com/article',
    );

    expect(result?.bodyHtml).toContain('substantive archived article text');
  });

  it('returns and caches a provider-labelled candidate', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        availability({
          available: true,
          status: '200',
          timestamp: '20260710095548',
          url: 'https://web.archive.org/web/20260710095548/https://example.com/article',
        }),
      )
      .mockResolvedValueOnce(htmlResponse(ARTICLE_HTML));
    vi.stubGlobal('fetch', fetchMock);

    const first = await getWaybackCandidate('https://example.com/article');
    const second = await getWaybackCandidate('https://example.com/article');

    expect(first).toMatchObject({
      source: 'wayback',
      snapshotDate: '10 Jul 2026 09:55 UTC',
    });
    expect(first?.textLength).toBeGreaterThan(1000);
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches an authoritative availability miss', async () => {
    const fetchMock = vi.fn().mockResolvedValue(availability());
    vi.stubGlobal('fetch', fetchMock);

    await getWaybackCandidate('https://example.com/missing');
    await getWaybackCandidate('https://example.com/missing');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not cache a transient availability error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('temporary DNS failure'));
    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await getWaybackCandidate('https://example.com/temporarily-unavailable');
    await getWaybackCandidate('https://example.com/temporarily-unavailable');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });
});
