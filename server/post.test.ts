import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPost, validateArticleUrl } from './post';
import { clearPostCache } from './postCache';

beforeEach(() => {
  clearPostCache();
  vi.unstubAllGlobals();
});

function mockFetchOnce(text: string, response: { ok?: boolean; status?: number } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ...response,
      text: vi.fn().mockResolvedValue(text),
    }),
  );
}

describe('validateArticleUrl', () => {
  it('accepts a valid https URL', () => {
    const result = validateArticleUrl('https://example.com/article');
    expect(result).toBeInstanceOf(URL);
    expect(result.hostname).toBe('example.com');
  });

  it('accepts a valid http URL', () => {
    const result = validateArticleUrl('http://example.com/article');
    expect(result.protocol).toBe('http:');
  });

  it('rejects ftp protocol', () => {
    expect(() => validateArticleUrl('ftp://example.com/file')).toThrow();
  });

  it('rejects file protocol', () => {
    expect(() => validateArticleUrl('file:///etc/passwd')).toThrow();
  });

  it('rejects localhost', () => {
    expect(() => validateArticleUrl('https://localhost/admin')).toThrow();
  });

  it('rejects 127.x loopback addresses', () => {
    expect(() => validateArticleUrl('https://127.0.0.1/')).toThrow();
  });

  it('rejects 10.x private addresses', () => {
    expect(() => validateArticleUrl('https://10.0.0.1/')).toThrow();
  });

  it('rejects 192.168.x private addresses', () => {
    expect(() => validateArticleUrl('https://192.168.1.1/')).toThrow();
  });

  it('rejects 169.254.x link-local addresses (AWS metadata endpoint)', () => {
    expect(() => validateArticleUrl('https://169.254.169.254/latest/meta-data/')).toThrow();
  });

  it('rejects malformed URLs', () => {
    expect(() => validateArticleUrl('not-a-url')).toThrow();
  });
});

describe('getPost', () => {
  it('extracts via the Substack preload path when present', async () => {
    const preloadPost = {
      id: 1,
      title: 'A Substack Post',
      slug: 'a-substack-post',
      post_date: '2026-01-01T00:00:00.000Z',
      audience: 'everyone',
      canonical_url: 'https://example.substack.com/p/a-substack-post',
      description: 'desc',
      type: 'newsletter',
      body_html: '<p>Body</p>',
    };
    const preloadJson = JSON.stringify({ post: preloadPost });
    const html = `<meta property="og:site_name" content="Example Dispatch"><script>window._preloads = JSON.parse(${JSON.stringify(preloadJson)})</script>`;
    mockFetchOnce(html);

    const result = await getPost('https://example.substack.com/p/a-substack-post');

    expect(result?.platform).toBe('substack');
    expect(result?.title).toBe('A Substack Post');
    expect(result?.bodyHtml).toBe('<p>Body</p>');
    expect(result?.siteName).toBe('Example Dispatch');
  });

  it('flags archiveWorthChecking for a Substack preview-only paid post even with a long preview', async () => {
    const paragraph = 'This is a long enough preview paragraph to clear the thin-content threshold on its own. ';
    const preloadPost = {
      id: 2,
      title: 'A Paid Substack Post',
      slug: 'a-paid-post',
      post_date: '2026-01-01T00:00:00.000Z',
      audience: 'only_paid',
      canonical_url: 'https://example.substack.com/p/a-paid-post',
      description: 'desc',
      type: 'newsletter',
      body_html: `<p>${paragraph.repeat(25)}</p>`,
    };
    const preloadJson = JSON.stringify({ post: preloadPost });
    const html = `<script>window._preloads = JSON.parse(${JSON.stringify(preloadJson)})</script>`;
    mockFetchOnce(html);

    const result = await getPost('https://example.substack.com/p/a-paid-post');

    expect(result?.isPreviewOnly).toBe(true);
    expect(result?.archiveWorthChecking).toBe(true);
  });

  it('falls back to generic Readability extraction for non-Substack HTML', async () => {
    const paragraph =
      'This is a substantive sentence written to give Readability enough text to score this block as the main content. ';
    const html = `<html><head><title>Plain Article</title></head><body><article><h1>Plain Article</h1><p>${paragraph.repeat(6)}</p></article></body></html>`;
    mockFetchOnce(html);

    const result = await getPost('https://blog.example.com/plain-article');

    expect(result?.platform).toBe('generic');
    expect(result?.title).toBe('Plain Article');
  });

  it('returns an archive-eligible stub when the fetch itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const result = await getPost('https://blog.example.com/unreachable');

    expect(result).toMatchObject({
      title: 'blog.example.com',
      siteName: 'blog.example.com',
      canonicalUrl: 'https://blog.example.com/unreachable',
      bodyHtml: '',
      archiveWorthChecking: true,
    });
  });

  it('flags archiveWorthChecking when JSON-LD declares isAccessibleForFree: false', async () => {
    const paragraph = 'A short stub sentence before the sign-in wall kicks in. ';
    const html = `<html><head><title>Stub</title><script type="application/ld+json">{"isAccessibleForFree": false}</script></head><body><article><h1>Stub</h1><p>${paragraph.repeat(3)}</p></article></body></html>`;
    mockFetchOnce(html);

    const result = await getPost('https://news.example.com/paywalled-article');

    expect(result?.archiveWorthChecking).toBe(true);
  });

  it('flags archiveWorthChecking when the extracted text is thin', async () => {
    const html = `<html><head><title>Thin</title></head><body><article><h1>Thin</h1><p>Just a headline and one short line.</p></article></body></html>`;
    mockFetchOnce(html);

    const result = await getPost('https://news.example.com/thin-article');

    expect(result?.archiveWorthChecking).toBe(true);
  });

  it('does not flag archiveWorthChecking for a normal, substantial article', async () => {
    const paragraph =
      'This is a substantive sentence written to give Readability enough text to score this block as the main content. ';
    const html = `<html><head><title>Full Article</title></head><body><article><h1>Full Article</h1><p>${paragraph.repeat(30)}</p></article></body></html>`;
    mockFetchOnce(html);

    const result = await getPost('https://blog.example.com/full-article');

    expect(result?.archiveWorthChecking).toBe(false);
  });

  it('returns an archive-eligible stub instead of null when generic extraction fails entirely', async () => {
    mockFetchOnce('<html><head><title>Sign in required</title></head><body></body></html>');

    const result = await getPost('https://news.example.com/behind-a-wall');

    expect(result).not.toBeNull();
    expect(result?.bodyHtml).toBe('');
    expect(result?.archiveWorthChecking).toBe(true);
    expect(result?.title).toBe('Sign in required');
  });

  it('does not render the NYTimes DataDome challenge as article content', async () => {
    const html = `<html lang="en"><head><title>nytimes.com</title></head><body><p id="cmsg">Please enable JS and disable any ad blocker</p><script data-cfasync="false">var dd={'rt':'i'}</script></body></html>`;
    mockFetchOnce(html, { ok: false, status: 403 });

    const result = await getPost(
      'https://www.nytimes.com/live/2026/07/13/world/iran-war-us-trump-hormuz',
    );

    expect(result).toMatchObject({
      title: 'The New York Times',
      siteName: 'The New York Times',
      bodyHtml: '',
      archiveWorthChecking: true,
    });
  });

  it('turns other non-success publisher responses into archive-eligible stubs', async () => {
    mockFetchOnce('<html><head><title>Access denied</title></head><body>Forbidden</body></html>', {
      ok: false,
      status: 403,
    });

    const result = await getPost('https://news.example.com/blocked');

    expect(result?.title).toBe('Access denied');
    expect(result?.bodyHtml).toBe('');
    expect(result?.archiveWorthChecking).toBe(true);
  });

  it('uses a declared AMP page when it is materially fuller than the original DOM', async () => {
    const paragraph =
      'This is the complete publisher AMP article with enough text to provide a useful reading experience. ';
    const sourceHtml = `<html><head><title>AMP Story</title><link rel="amphtml" href="/amp-story"></head><body><article><p>Short preview.</p></article></body></html>`;
    const ampHtml = `<html><head><title>AMP Story</title></head><body><article><p>${paragraph.repeat(25)}</p></article></body></html>`;
    const fetchMock = vi.fn().mockImplementation((requestUrl: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(requestUrl.endsWith('/amp-story') ? ampHtml : sourceHtml),
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getPost('https://news.example.com/story');

    expect(result?.bodyHtml).toContain('complete publisher AMP article');
    expect(result?.archiveWorthChecking).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('serves a substantial successful article from the 48-hour cache', async () => {
    const paragraph =
      'This is a substantial cacheable article sentence with enough text to exceed the complete-content threshold. ';
    const html = `<html><head><title>Cached Story</title></head><body><article><p>${paragraph.repeat(25)}</p></article></body></html>`;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(html),
    });
    vi.stubGlobal('fetch', fetchMock);
    const url = 'https://news.example.com/cacheable-story';

    const first = await getPost(url);
    const second = await getPost(url);

    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not cache a thin extraction', async () => {
    const html = '<html><head><title>Thin</title></head><body><article><p>Very short.</p></article></body></html>';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(html),
    });
    vi.stubGlobal('fetch', fetchMock);
    const url = 'https://news.example.com/still-thin';

    await getPost(url);
    await getPost(url);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
