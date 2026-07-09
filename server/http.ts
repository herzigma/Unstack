/**
 * Browser-realistic headers for fetching actual HTML pages (article pages, archive
 * pages, RSS feeds). Some platforms (Medium in particular) content-negotiate on
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

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
