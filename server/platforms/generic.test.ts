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
});
