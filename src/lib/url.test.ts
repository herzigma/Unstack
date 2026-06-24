import { describe, expect, it } from 'vitest';
import { getQueryStrippedPath, getSharedSubstackInput } from './url';

describe('getQueryStrippedPath', () => {
  it('strips query strings', () => {
    expect(getQueryStrippedPath({ pathname: '/readtangle.substack.com', search: '?utm_source=feed', hash: '' })).toBe(
      '/readtangle.substack.com',
    );
  });

  it('preserves hash fragments', () => {
    expect(getQueryStrippedPath({ pathname: '/publication/p/post-slug', search: '?utm_source=foo', hash: '#section' })).toBe(
      '/publication/p/post-slug#section',
    );
  });

  it('leaves clean URLs unchanged', () => {
    expect(getQueryStrippedPath({ pathname: '/publication/p/post-slug', search: '', hash: '#section' })).toBeNull();
  });

  it('allows the PWA share target route to keep query parameters', () => {
    expect(getQueryStrippedPath({ pathname: '/share-target', search: '?url=https%3A%2F%2Fexample.com', hash: '' })).toBeNull();
  });
});

describe('getSharedSubstackInput', () => {
  it('uses the shared URL parameter first', () => {
    expect(getSharedSubstackInput('?title=Post&url=https%3A%2F%2Freadtangle.substack.com%2Fp%2Fpost')).toBe(
      'https://readtangle.substack.com/p/post',
    );
  });

  it('extracts URLs embedded in shared text', () => {
    expect(getSharedSubstackInput('?text=Read%20this%20https%3A%2F%2Fplatformer.news%2Fp%2Fpost%20now')).toBe(
      'https://platformer.news/p/post',
    );
  });

  it('falls back to plain shared text when no URL is embedded', () => {
    expect(getSharedSubstackInput('?text=pragmaticengineer')).toBe('pragmaticengineer');
  });

  it('returns null when no share params are present', () => {
    expect(getSharedSubstackInput('')).toBeNull();
  });
});
