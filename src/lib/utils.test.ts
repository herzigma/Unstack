import { describe, expect, it } from 'vitest';
import { parseSubstackInput } from './utils';

describe('parseSubstackInput', () => {
  it('parses bare Substack handles', () => {
    expect(parseSubstackInput('pragmaticengineer')).toEqual({
      domain: 'pragmaticengineer.substack.com',
      slug: null,
    });
  });

  it('parses full domains', () => {
    expect(parseSubstackInput('platformer.news')).toEqual({
      domain: 'platformer.news',
      slug: null,
    });
  });

  it('parses full post URLs', () => {
    expect(parseSubstackInput('https://oligarchwatch.substack.com/p/peter-thiels-secret-society-exposed')).toEqual({
      domain: 'oligarchwatch.substack.com',
      slug: 'peter-thiels-secret-society-exposed',
    });
  });

  it('parses path-style post inputs', () => {
    expect(parseSubstackInput('oligarchwatch.substack.com/p/peter-thiels-secret-society-exposed')).toEqual({
      domain: 'oligarchwatch.substack.com',
      slug: 'peter-thiels-secret-society-exposed',
    });
  });

  it('fixes malformed single-slash protocols', () => {
    expect(parseSubstackInput('https:/readtangle.substack.com/p/example-post')).toEqual({
      domain: 'readtangle.substack.com',
      slug: 'example-post',
    });
  });

  it('ignores query strings while parsing Substack URLs', () => {
    expect(parseSubstackInput('https://readtangle.substack.com/p/example-post?utm_source=feed')).toEqual({
      domain: 'readtangle.substack.com',
      slug: 'example-post',
    });
  });

  it('returns null for empty or invalid input', () => {
    expect(parseSubstackInput('')).toBeNull();
    expect(parseSubstackInput('https://')).toBeNull();
  });
});
