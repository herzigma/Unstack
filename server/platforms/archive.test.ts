import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findSnapshot,
  findSnapshotDetailed,
  fetchSnapshot,
  fetchSnapshotDetailed,
  getArchiveIsCandidate,
} from './archive';
import { clearCache } from '../archiveCache';

function mockFetchSequence(...texts: string[]) {
  const fn = vi.fn();
  for (const text of texts) {
    fn.mockResolvedValueOnce({ text: vi.fn().mockResolvedValue(text) });
  }
  vi.stubGlobal('fetch', fn);
  return fn;
}

function mockFetchAlways(text: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ text: vi.fn().mockResolvedValue(text) }),
  );
}

const MISS_HTML = `<html><body><div>archive.today webpage capture</div><div>no results</div></body></html>`;

const HIT_HTML = `<html><body>
<div id="row0" style="width:100%">
  <div class="THUMBS-BLOCK">
    <a style="text-decoration:none" href="https://archive.is/339i0">
      <img title="Why we don't know what food is spreading the parasite sickening thousands - The Washington Post" alt="screenshot"/>
    </a>
  </div>
  <div>10 Jul 2026 09:55</div>
</div>
</body></html>`;

const CAPTCHA_HTML = `<html><body><h1>One more step</h1><p>Please complete the security check to access archive.is</p></body></html>`;
const DRIFT_HTML = `<html><body><div id="row0"><a href="https://archive.is/snapshots/339i0">Changed result link</a></div></body></html>`;
const UNEXPECTED_HTML = `<html><head><title>Archive.is</title></head><body><main>Temporarily different page</main></body></html>`;

const paragraph =
  'This is a substantive sentence written to give Readability enough text to score this block as the main content. ';
const SNAPSHOT_ARTICLE_HTML = `<html><head><title>Archived Article</title></head><body><article><h1>Archived Article</h1><p>${paragraph.repeat(20)}</p></article></body></html>`;

describe('findSnapshot', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the short-id snapshot URL, date, and original title on a hit', async () => {
    mockFetchAlways(HIT_HTML);

    const result = await findSnapshot('https://www.washingtonpost.com/health/some-article/');

    expect(result).not.toBeNull();
    expect(result?.snapshotUrl).toBe('https://archive.is/339i0');
    expect(result?.snapshotDate).toBe('10 Jul 2026 09:55');
    expect(result?.originalTitle).toContain('parasite sickening thousands');
  });

  it('returns null when no variant has a snapshot', async () => {
    mockFetchAlways(MISS_HTML);

    const result = await findSnapshot('https://example.com/never-archived');

    expect(result).toBeNull();
  });

  it('retries with a stripped-tracking-params variant when the exact URL misses', async () => {
    const fetchSpy = mockFetchSequence(MISS_HTML, HIT_HTML);

    const result = await findSnapshot('https://www.washingtonpost.com/health/some-article?utm_source=newsletter');

    expect(result?.snapshotUrl).toBe('https://archive.is/339i0');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const secondCallUrl = fetchSpy.mock.calls[1][0] as string;
    expect(secondCallUrl).not.toContain('utm_source');
  });

  it('classifies an access challenge as blocked', async () => {
    mockFetchAlways(CAPTCHA_HTML);

    const result = await findSnapshotDetailed('https://example.com/article');

    expect(result.status).toBe('blocked');
    expect(result.snapshot).toBeNull();
    expect(result.diagnostics[0]).toMatchObject({
      status: 'blocked',
      bodyLength: CAPTCHA_HTML.length,
      transport: 'direct',
    });
  });

  it('classifies a recognizable result-row parser mismatch as drift', async () => {
    mockFetchAlways(DRIFT_HTML);

    const result = await findSnapshotDetailed('https://example.com/article');

    expect(result.status).toBe('drift');
    expect(result.diagnostics[0].reason).toContain('#row0');
  });

  it('classifies an unrecognized page separately from drift', async () => {
    mockFetchAlways(UNEXPECTED_HTML);

    const result = await findSnapshotDetailed('https://example.com/article');

    expect(result.status).toBe('unexpected');
    expect(result.diagnostics[0].responseTitle).toBe('Archive.is');
  });
});

describe('fetchSnapshot', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('extracts a normal snapshot page via the generic Readability path', async () => {
    mockFetchAlways(SNAPSHOT_ARTICLE_HTML);

    const result = await fetchSnapshot('https://archive.is/339i0');

    expect(result).not.toBeNull();
    expect(result?.platform).toBe('generic');
    expect(result?.bodyHtml).toContain('substantive sentence');
  });

  it('rejects a CAPTCHA/challenge page instead of extracting it as content', async () => {
    mockFetchAlways(CAPTCHA_HTML);

    const result = await fetchSnapshot('https://archive.is/20260710095548/https://example.com/');

    expect(result).toBeNull();
  });

  it('reports a CAPTCHA/challenge page as blocked rather than extraction drift', async () => {
    mockFetchAlways(CAPTCHA_HTML);

    const result = await fetchSnapshotDetailed('https://archive.is/339i0');

    expect(result.status).toBe('blocked');
    expect(result.diagnostic.reason).toContain('access-block');
  });

  it('reports reachable non-article HTML as an extraction failure', async () => {
    mockFetchAlways('<html><head><title>Empty snapshot</title></head><body></body></html>');

    const result = await fetchSnapshotDetailed('https://archive.is/339i0');

    expect(result.status).toBe('extraction_failed');
    expect(result.diagnostic.responseTitle).toBe('Empty snapshot');
  });
});

describe('getArchiveIsCandidate', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    clearCache();
  });

  it('returns a snapshot with textLength on a full hit', async () => {
    mockFetchSequence(HIT_HTML, SNAPSHOT_ARTICLE_HTML);

    const result = await getArchiveIsCandidate('https://www.washingtonpost.com/health/some-article/');

    expect(result).not.toBeNull();
    expect(result?.snapshotUrl).toBe('https://archive.is/339i0');
    expect(result?.source).toBe('archive.is');
    expect(result?.textLength).toBeGreaterThan(1000);
  });

  it('returns null when no snapshot is found', async () => {
    mockFetchAlways(MISS_HTML);

    const result = await getArchiveIsCandidate('https://example.com/never-archived');

    expect(result).toBeNull();
  });

  it('caches the result so a repeated lookup does not re-hit the network', async () => {
    const fetchSpy = mockFetchSequence(HIT_HTML, SNAPSHOT_ARTICLE_HTML);
    const url = 'https://www.washingtonpost.com/health/some-article/';

    const first = await getArchiveIsCandidate(url);
    const callsAfterFirst = fetchSpy.mock.calls.length;
    const second = await getArchiveIsCandidate(url);

    expect(second).toEqual(first);
    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst);
  });

  it('does not cache transient archive.is blocks as permanent misses', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ text: vi.fn().mockResolvedValue(CAPTCHA_HTML) });
    vi.stubGlobal('fetch', fetchSpy);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const url = 'https://example.com/temporarily-blocked';

    await getArchiveIsCandidate(url);
    const callsAfterFirst = fetchSpy.mock.calls.length;
    await getArchiveIsCandidate(url);

    expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    warnSpy.mockRestore();
  });
});
