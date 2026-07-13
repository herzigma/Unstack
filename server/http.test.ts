import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchHeaders,
  fetchHtmlWithProxyFallback,
  fetchWithTimeout,
  jsonFetchHeaders,
} from './http';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('fetchHtmlWithProxyFallback', () => {
  function response(html: string, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      text: vi.fn().mockResolvedValue(html),
    } as unknown as Response;
  }

  it('returns a successful direct response without calling a proxy', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response('<html>direct</html>'));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('HTML_FETCH_PROXY_URL', 'https://proxy.example/fetch');

    const result = await fetchHtmlWithProxyFallback('https://news.example/article');

    expect(result.transport).toBe('direct');
    expect(result.html).toContain('direct');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not let an invalid unused proxy setting break a direct success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('<html>direct</html>')));
    vi.stubEnv('HTML_FETCH_PROXY_URL', 'file:///not-an-http-proxy');

    const result = await fetchHtmlWithProxyFallback('https://news.example/article');

    expect(result.transport).toBe('direct');
  });

  it('uses the configured proxy after a direct fetch error', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('direct timeout'))
      .mockResolvedValueOnce(response('<html>proxied</html>'));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('HTML_FETCH_PROXY_URL', 'https://proxy.example/fetch');
    vi.stubEnv('HTML_FETCH_PROXY_TOKEN', 'secret-token');

    const result = await fetchHtmlWithProxyFallback('https://news.example/article');

    expect(result.transport).toBe('proxy');
    expect(result.html).toContain('proxied');
    const [proxyUrl, proxyInit] = fetchMock.mock.calls[1];
    expect(proxyUrl).toBe(
      'https://proxy.example/fetch?url=https%3A%2F%2Fnews.example%2Farticle',
    );
    expect(proxyInit.headers.Authorization).toBe('Bearer secret-token');
  });

  it('uses the configured proxy for a caller-classified challenge page', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response('<html>security check</html>'))
      .mockResolvedValueOnce(response('<html>article</html>'));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('HTML_FETCH_PROXY_URL', 'https://proxy.example/fetch?target={url}');

    const result = await fetchHtmlWithProxyFallback(
      'https://news.example/article',
      {},
      { shouldUseProxy: (_response, html) => html.includes('security check') },
    );

    expect(result.transport).toBe('proxy');
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://proxy.example/fetch?target=https%3A%2F%2Fnews.example%2Farticle',
    );
  });

  it('preserves direct-only behavior when no proxy is configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('DNS failure')));

    await expect(fetchHtmlWithProxyFallback('https://news.example/article')).rejects.toThrow(
      'DNS failure',
    );
  });
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
