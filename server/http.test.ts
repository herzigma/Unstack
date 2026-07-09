import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchHeaders, fetchWithTimeout, jsonFetchHeaders } from './http';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('header constants', () => {
  it('fetchHeaders.Accept prefers text/html (not application/json)', () => {
    expect(fetchHeaders.Accept).toContain('text/html');
    expect(fetchHeaders.Accept).not.toBe('application/json');
  });

  it('jsonFetchHeaders.Accept is application/json', () => {
    expect(jsonFetchHeaders.Accept).toBe('application/json');
  });

  it('jsonFetchHeaders inherits User-Agent from fetchHeaders', () => {
    expect(jsonFetchHeaders['User-Agent']).toBe(fetchHeaders['User-Agent']);
  });
});

describe('fetchWithTimeout', () => {
  it('returns the response for a successful fetch within timeout', async () => {
    const mockResponse = { ok: true, status: 200 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const result = await fetchWithTimeout('https://example.com');
    expect(result).toBe(mockResponse);
  });

  it('passes the abort signal to fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await fetchWithTimeout('https://example.com');

    const callArgs = vi.mocked(fetch).mock.calls[0];
    expect(callArgs[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('merges caller-provided init options with the abort signal', async () => {
    const headers = { 'X-Custom': 'value' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    await fetchWithTimeout('https://example.com', { headers });

    const callArgs = vi.mocked(fetch).mock.calls[0];
    expect((callArgs[1] as any).headers).toEqual(headers);
    expect(callArgs[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('aborts when the timeout elapses', async () => {
    vi.useFakeTimers();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }),
      ),
    );

    const promise = fetchWithTimeout('https://example.com', {}, 100);
    vi.advanceTimersByTime(100);

    await expect(promise).rejects.toThrow('aborted');

    vi.useRealTimers();
  });

  it('propagates fetch errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('DNS failure')));
    await expect(fetchWithTimeout('https://example.com')).rejects.toThrow('DNS failure');
  });
});
