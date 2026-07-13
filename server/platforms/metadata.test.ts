import { describe, expect, it } from 'vitest';
import { extractPageMetadata } from './metadata';

describe('extractPageMetadata', () => {
  it('prefers Open Graph metadata and resolves relative URLs', () => {
    const html = `<html><head>
      <title>Fallback title</title>
      <meta property="og:title" content="Publisher title">
      <meta property="og:description" content="Publisher description">
      <meta property="og:image" content="/images/cover.jpg">
      <meta property="og:site_name" content="The Publisher">
      <link rel="canonical" href="/canonical-story">
    </head></html>`;

    expect(extractPageMetadata(html, 'https://publisher.example/story')).toEqual({
      title: 'Publisher title',
      description: 'Publisher description',
      image: 'https://publisher.example/images/cover.jpg',
      canonicalUrl: 'https://publisher.example/canonical-story',
      siteName: 'The Publisher',
    });
  });

  it('falls back to standard and Twitter metadata', () => {
    const html = `<html><head>
      <title>Document title</title>
      <meta name="description" content="Standard description">
      <meta name="twitter:image" content="https://cdn.example/social.png">
    </head></html>`;

    expect(extractPageMetadata(html, 'https://publisher.example/story')).toMatchObject({
      title: 'Document title',
      description: 'Standard description',
      image: 'https://cdn.example/social.png',
    });
  });
});
