import { describe, expect, it } from 'vitest';
import { parseArticleInput } from './utils';

describe('parseArticleInput', () => {
  it('parses bare Substack handles', () => {
    expect(parseArticleInput('pragmaticengineer')).toEqual({
      domain: 'pragmaticengineer.substack.com',
      url: null,
    });
  });

  it('parses full domains', () => {
    expect(parseArticleInput('platformer.news')).toEqual({
      domain: 'platformer.news',
      url: null,
    });
  });

  it('parses full post URLs', () => {
    expect(parseArticleInput('https://oligarchwatch.substack.com/p/peter-thiels-secret-society-exposed')).toEqual({
      domain: 'oligarchwatch.substack.com',
      url: 'https://oligarchwatch.substack.com/p/peter-thiels-secret-society-exposed',
    });
  });

  it('parses path-style post inputs', () => {
    expect(parseArticleInput('oligarchwatch.substack.com/p/peter-thiels-secret-society-exposed')).toEqual({
      domain: 'oligarchwatch.substack.com',
      url: 'https://oligarchwatch.substack.com/p/peter-thiels-secret-society-exposed',
    });
  });

  it('parses arbitrary (non-Substack) path shapes as direct article links', () => {
    expect(parseArticleInput('blog.example.com/2024/01/some-post/')).toEqual({
      domain: 'blog.example.com',
      url: 'https://blog.example.com/2024/01/some-post/',
    });
  });

  it('fixes malformed single-slash protocols', () => {
    expect(parseArticleInput('https:/readtangle.substack.com/p/example-post')).toEqual({
      domain: 'readtangle.substack.com',
      url: 'https://readtangle.substack.com/p/example-post',
    });
  });

  it('keeps query strings as part of the resolved article url', () => {
    expect(parseArticleInput('https://readtangle.substack.com/p/example-post?utm_source=feed')).toEqual({
      domain: 'readtangle.substack.com',
      url: 'https://readtangle.substack.com/p/example-post?utm_source=feed',
    });
  });

  it('returns null for empty or invalid input', () => {
    expect(parseArticleInput('')).toBeNull();
    expect(parseArticleInput('https://')).toBeNull();
  });
});
