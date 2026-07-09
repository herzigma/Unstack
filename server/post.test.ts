import { describe, expect, it, vi } from 'vitest';
import { getPost, validateArticleUrl } from './post';

function mockFetchOnce(text: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
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
    const html = `<script>window._preloads = JSON.parse(${JSON.stringify(preloadJson)})</script>`;
    mockFetchOnce(html);

    const result = await getPost('https://example.substack.com/p/a-substack-post');

    expect(result?.platform).toBe('substack');
    expect(result?.title).toBe('A Substack Post');
    expect(result?.bodyHtml).toBe('<p>Body</p>');
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

  it('returns null when the fetch itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const result = await getPost('https://blog.example.com/unreachable');

    expect(result).toBeNull();
  });
});
