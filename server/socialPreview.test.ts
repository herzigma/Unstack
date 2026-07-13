import { describe, expect, it } from 'vitest';
import { articleUrlForPreviewRequest, articleUrlFromPath, injectSocialPreview } from './socialPreview';
import type { NormalizedPostDetail } from '../src/types';

const post: NormalizedPostDetail = {
  id: 'story',
  title: 'Democrats Became Great by Fighting the Left',
  subtitle: 'A subtitle',
  description: 'In the DSA era, liberals need to remember their history.',
  coverImage: 'https://cdn.theatlantic.com/media/img.jpg',
  publishedAt: '2026-07-08T12:00:00Z',
  isPaywalled: false,
  canonicalUrl: 'https://www.theatlantic.com/ideas/archive/2026/07/story/687839/',
  platform: 'generic',
  bodyHtml: '<p>Story</p>',
  isPreviewOnly: false,
  siteName: 'The Atlantic',
};

describe('social previews', () => {
  it('reconstructs the original article URL from an Unstack path', () => {
    expect(articleUrlFromPath('/www.theatlantic.com/ideas/archive/2026/07/story/687839/')).toBe(
      'https://www.theatlantic.com/ideas/archive/2026/07/story/687839/',
    );
    expect(articleUrlFromPath('/assets/index.js')).toBeNull();
    expect(articleUrlFromPath('/publisher.example')).toBeNull();
  });

  it('renders metadata for every GET article request without user-agent gating', () => {
    const path = '/www.theatlantic.com/magazine/2026/08/reading-crisis/687618/';

    expect(articleUrlForPreviewRequest('GET', path)).toBe(
      'https://www.theatlantic.com/magazine/2026/08/reading-crisis/687618/',
    );
    expect(articleUrlForPreviewRequest('HEAD', path)).toBeNull();
  });

  it('injects escaped Open Graph and Twitter metadata from the original post', () => {
    const html = '<html><head><meta property="og:title" content="Unstack"><title>Unstack</title></head><body></body></html>';
    const result = injectSocialPreview(html, post, 'https://unstack.wtf/www.theatlantic.com/story');

    expect(result).toContain('<title>[Unstack] Democrats Became Great by Fighting the Left | The Atlantic</title>');
    expect(result).toContain('property="og:title" content="[Unstack] Democrats Became Great by Fighting the Left | The Atlantic"');
    expect(result).toContain('property="og:site_name" content="The Atlantic"');
    expect(result).toContain('name="twitter:title" content="[Unstack] Democrats Became Great by Fighting the Left | The Atlantic"');
    expect(result).toContain('property="og:description" content="In the DSA era, liberals need to remember their history."');
    expect(result).toContain('property="og:image" content="https://cdn.theatlantic.com/media/img.jpg"');
    expect(result).toContain('name="twitter:card" content="summary_large_image"');
    expect(result).toContain('property="og:url" content="https://unstack.wtf/www.theatlantic.com/story"');
    expect(result).toContain('name="description" content="In the DSA era, liberals need to remember their history."');
    expect(result).toContain('rel="canonical" href="https://unstack.wtf/www.theatlantic.com/story"');
    expect(result).not.toContain('property="og:title" content="Unstack"');
  });

  it('falls back to the original hostname when a publication name is unavailable', () => {
    const result = injectSocialPreview(
      '<html><head><title>Unstack</title></head></html>',
      { ...post, siteName: undefined },
      'https://unstack.wtf/story',
    );

    expect(result).toContain('property="og:title" content="[Unstack] Democrats Became Great by Fighting the Left | theatlantic.com"');
    expect(result).toContain('property="og:site_name" content="theatlantic.com"');
  });

  it('escapes publisher-provided values before inserting them into HTML', () => {
    const result = injectSocialPreview(
      '<html><head><title>Unstack</title></head></html>',
      { ...post, title: 'A "quoted" <story>', description: 'One & two' },
      'https://unstack.wtf/story?x=1&y=2',
    );

    expect(result).toContain('A &quot;quoted&quot; &lt;story&gt;');
    expect(result).toContain('One &amp; two');
    expect(result).toContain('story?x=1&amp;y=2');
  });
});
