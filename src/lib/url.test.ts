import { describe, expect, it } from 'vitest';
import { getQueryStrippedPath } from './url';

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
});
