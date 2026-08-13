/**
 * Browser-realistic headers for fetching actual HTML pages (article pages, AMP/print
 * alternates, RSS feeds). Some platforms (Medium in particular) content-negotiate on
 * Accept and serve a thin, JS-only shell instead of the real server-rendered page
 * when Accept looks API-like -- so this must NOT be "application/json".
 */
export const fetchHeaders = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/** For Substack's own /api/v1/* endpoints, which genuinely expect/return JSON. */
export const jsonFetchHeaders = {
  ...fetchHeaders,
  "Accept": "application/json",
};

const PROXY_RETRY_STATUSES = new Set([401, 403, 407, 408, 425, 429, 500, 502, 503, 504]);

export interface HtmlFetchResult {
  response: Response;
  html: string;
  transport: "direct" | "proxy";
}

interface HtmlFetchOptions {
  timeoutMs?: number;
  shouldUseProxy?: (response: Response, html: string) => boolean;
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function proxyUrlFor(targetUrl: string): string | null {
  const configured = process.env.HTML_FETCH_PROXY_URL?.trim();
  if (!configured) return null;

  const proxyUrl = new URL(
    configured.includes("{url}")
      ? configured.replaceAll("{url}", encodeURIComponent(targetUrl))
      : configured,
  );
  if (proxyUrl.protocol !== "http:" && proxyUrl.protocol !== "https:") {
    throw new Error("HTML_FETCH_PROXY_URL must use http or https.");
  }
  if (!configured.includes("{url}")) proxyUrl.searchParams.set("url", targetUrl);
  return proxyUrl.toString();
}

function proxyHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Accept": fetchHeaders.Accept,
  };
  const token = process.env.HTML_FETCH_PROXY_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function responseNeedsProxy(response: Response, html: string, options: HtmlFetchOptions): boolean {
  return (
    PROXY_RETRY_STATUSES.has(response.status) ||
    response.status >= 500 ||
    options.shouldUseProxy?.(response, html) === true
  );
}

/**
 * Fetches HTML directly, with an opt-in proxy fallback for hosting-network blocks.
 *
 * HTML_FETCH_PROXY_URL may either contain a `{url}` placeholder or name an HTTP(S)
 * endpoint that accepts the target as its `url` query parameter. The endpoint must
 * return the upstream HTML as its response body. HTML_FETCH_PROXY_TOKEN, when set,
 * is sent to that endpoint as a Bearer token.
 */
export async function fetchHtmlWithProxyFallback(
  url: string,
  init: RequestInit = {},
  options: HtmlFetchOptions = {},
): Promise<HtmlFetchResult> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const proxyConfigured = Boolean(process.env.HTML_FETCH_PROXY_URL?.trim());
  let directResult: HtmlFetchResult | null = null;
  let directError: unknown;

  try {
    const response = await fetchWithTimeout(url, init, timeoutMs);
    const html = await response.text();
    directResult = { response, html, transport: "direct" };
    if (!proxyConfigured || !responseNeedsProxy(response, html, options)) return directResult;
  } catch (error) {
    directError = error;
    if (!proxyConfigured) throw error;
  }

  const proxyUrl = proxyUrlFor(url);
  if (!proxyUrl) {
    if (directResult) return directResult;
    throw directError;
  }

  try {
    const response = await fetchWithTimeout(
      proxyUrl,
      { method: "GET", headers: proxyHeaders() },
      timeoutMs,
    );
    return { response, html: await response.text(), transport: "proxy" };
  } catch (proxyError) {
    if (directResult) return directResult;
    throw new AggregateError(
      [directError, proxyError],
      `Direct and proxy HTML fetches failed for ${new URL(url).hostname}.`,
    );
  }
}
