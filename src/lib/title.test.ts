import { describe, expect, it } from 'vitest';
import { formatDocumentTitle } from './title';

describe('formatDocumentTitle', () => {
  it('returns the app title without a page name', () => {
    expect(formatDocumentTitle()).toBe('Unstack');
  });

  it('prefixes page titles with the app name', () => {
    expect(formatDocumentTitle('Peter Thiel’s secret society, exposed')).toBe(
      '[Unstack] Peter Thiel’s secret society, exposed',
    );
  });

  it('falls back to the app title for whitespace-only page names', () => {
    expect(formatDocumentTitle('   ')).toBe('Unstack');
  });
});
