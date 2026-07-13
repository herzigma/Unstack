import { describe, expect, it } from 'vitest';
import { extractPost } from './generic';

const paragraph =
  'This is a substantive sentence written to give Readability enough text to score this block as the main content of the page. ';

const articleHtml = `
<!DOCTYPE html>
<html>
<head><title>A Great Article</title></head>
<body>
  <article>
    <h1>A Great Article</h1>
    <p>${paragraph.repeat(4)}</p>
    <p>${paragraph.repeat(4)}</p>
    <p>${paragraph.repeat(4)}</p>
  </article>
</body>
</html>
`;

describe('extractPost (generic)', () => {
  it('extracts title and body content from server-rendered article HTML', () => {
    const result = extractPost(articleHtml, 'https://blog.example.com/a-great-article');

    expect(result).not.toBeNull();
    expect(result?.title).toBe('A Great Article');
    expect(result?.bodyHtml).toContain('substantive sentence');
    expect(result?.platform).toBe('generic');
    expect(result?.isPaywalled).toBe(false);
    expect(result?.canonicalUrl).toBe('https://blog.example.com/a-great-article');
  });

  it('returns null when there is no meaningful article content', () => {
    const result = extractPost('<html><body></body></html>', 'https://blog.example.com/empty');
    expect(result).toBeNull();
  });

  it('preserves original publisher metadata for reader and social previews', () => {
    const html = articleHtml.replace(
      '</head>',
      `<meta property="og:title" content="Social title">
       <meta property="og:description" content="Social description">
       <meta property="og:image" content="/social-cover.jpg">
       <meta property="og:site_name" content="Example Magazine">
       </head>`,
    );

    const result = extractPost(html, 'https://blog.example.com/a-great-article');

    expect(result).toMatchObject({
      title: 'Social title',
      description: 'Social description',
      coverImage: 'https://blog.example.com/social-cover.jpg',
      siteName: 'Example Magazine',
    });
  });

  it('uses a fuller publisher-provided JSON-LD articleBody when the visible DOM is thin', () => {
    const jsonLdBody = `${paragraph.repeat(10)}\n\n${paragraph.repeat(10)}`;
    const html = `<html><head><title>Structured Article</title>
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'NewsArticle',
        articleBody: jsonLdBody,
      })}</script>
      </head><body><article><p>Short visible preview.</p></article></body></html>`;

    const result = extractPost(html, 'https://news.example.com/structured');

    expect(result?.bodyHtml).toContain('substantive sentence');
    expect(result?.bodyHtml.match(/<p>/g)).toHaveLength(2);
  });

  it('escapes HTML found inside JSON-LD articleBody', () => {
    const html = `<html><head><title>Safe Article</title>
      <script type="application/ld+json">${JSON.stringify({
        articleBody: `${paragraph.repeat(10)}<img src=x onerror=alert('xss')>`,
      })}</script>
      </head><body></body></html>`;

    const result = extractPost(html, 'https://news.example.com/safe');

    expect(result?.bodyHtml).toContain('&lt;img');
    expect(result?.bodyHtml).not.toContain('<img');
  });

  it('keeps richer Readability HTML when JSON-LD is only trivially longer', () => {
    const visibleBody = paragraph.repeat(20);
    const html = `<html><head><title>Illustrated Article</title>
      <script type="application/ld+json">${JSON.stringify({ articleBody: `${visibleBody} Tiny addition.` })}</script>
      </head><body><article><img src="/photo.jpg" alt="Photo"><p>${visibleBody}</p></article></body></html>`;

    const result = extractPost(html, 'https://news.example.com/illustrated');

    expect(result?.bodyHtml).toContain('<img');
    expect(result?.bodyHtml).toContain('/photo.jpg');
  });
});
