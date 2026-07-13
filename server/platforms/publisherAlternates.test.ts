import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedPostDetail } from '../../src/types';
import { discoverPublisherAlternatives, getPublisherAlternative } from './publisherAlternates';

const paragraph =
  'This is substantive publisher-provided article text with enough words for a clean reading view. ';

const original: NormalizedPostDetail = {
  id: 'https://news.example.com/story',
  title: 'A story',
  publishedAt: '',
  isPaywalled: false,
  canonicalUrl: 'https://news.example.com/story',
  platform: 'generic',
  bodyHtml: '<p>Short preview.</p>',
  isPreviewOnly: false,
  siteName: 'Example News',
};

function response(text: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(text),
  };
}

describe('publisher alternatives', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('discovers declared same-site AMP, print, and RSS links', () => {
    const html = `<head>
      <link rel="amphtml" href="/story/amp">
      <link rel="alternate" media="print" href="https://www.news.example.com/story/print">
      <link rel="alternate" type="application/rss+xml" href="/rss.xml">
      <link rel="alternate" type="application/rss+xml" href="https://feeds.attacker.example/rss">
    </head>`;

    expect(discoverPublisherAlternatives(html, original.canonicalUrl)).toEqual({
      html: [
        { kind: 'amp', url: 'https://news.example.com/story/amp' },
        { kind: 'print', url: 'https://www.news.example.com/story/print' },
      ],
      feeds: ['https://news.example.com/rss.xml'],
    });
  });

  it('uses a substantially fuller AMP page while retaining the original canonical URL', async () => {
    const sourceHtml = '<head><link rel="amphtml" href="/story/amp"></head>';
    const ampHtml = `<html><head><title>AMP title</title></head><body><article><p>${paragraph.repeat(20)}</p></article></body></html>`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(ampHtml)));

    const result = await getPublisherAlternative(original.canonicalUrl, sourceHtml, original);

    expect(result?.kind).toBe('amp');
    expect(result?.post.bodyHtml).toContain('substantive publisher-provided');
    expect(result?.post.canonicalUrl).toBe(original.canonicalUrl);
    expect(result?.post.title).toBe(original.title);
  });

  it('extracts full content from the matching RSS item', async () => {
    const sourceHtml = '<head><link rel="alternate" type="application/rss+xml" href="/rss.xml"></head>';
    const feed = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
      <title>Example News</title>
      <item><title>Other</title><link>https://news.example.com/other</link><description>Other item</description></item>
      <item><title>A story</title><link>https://news.example.com/story?utm_source=feed</link>
        <content:encoded><![CDATA[<p>${paragraph.repeat(20)}</p>]]></content:encoded>
      </item>
    </channel></rss>`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(feed)));

    const result = await getPublisherAlternative(original.canonicalUrl, sourceHtml, original);

    expect(result?.kind).toBe('feed');
    expect(result?.post.bodyHtml).toContain('substantive publisher-provided');
  });

  it('chooses the fullest declared alternative when several are available', async () => {
    const sourceHtml = `<head>
      <link rel="amphtml" href="/story/amp">
      <link rel="alternate" media="print" href="/story/print">
    </head>`;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const repeats = url.endsWith('/print') ? 30 : 10;
      return Promise.resolve(response(`<article><h1>Story</h1><p>${paragraph.repeat(repeats)}</p></article>`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getPublisherAlternative(original.canonicalUrl, sourceHtml, original);

    expect(result?.kind).toBe('print');
  });

  it('ignores alternatives that do not materially improve the article', async () => {
    const sourceHtml = '<head><link rel="amphtml" href="/story/amp"></head>';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('<article><p>Tiny AMP.</p></article>')));

    await expect(
      getPublisherAlternative(original.canonicalUrl, sourceHtml, original),
    ).resolves.toBeNull();
  });
});
