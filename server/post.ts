import * as substack from "./platforms/substack";
import * as generic from "./platforms/generic";
import { fetchHeaders, fetchWithTimeout } from "./http";
import type { NormalizedPostDetail } from "../src/types";

const PRIVATE_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./,
  /^::1$/,
  /^\[::1\]$/,
];

function isPrivateOrLoopbackHostname(hostname: string): boolean {
  return PRIVATE_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname));
}

/**
 * Throws on anything unsafe to fetch server-side. Callers should catch and respond 400.
 */
export function validateArticleUrl(url: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http/https URLs are supported.");
  }
  if (isPrivateOrLoopbackHostname(parsed.hostname)) {
    throw new Error("Refusing to fetch a private or loopback address.");
  }
  return parsed;
}

export async function getPost(url: string): Promise<NormalizedPostDetail | null> {
  try {
    const response = await fetchWithTimeout(url, { headers: fetchHeaders });
    const html = await response.text();

    const substackRaw = substack.extractPostFromHtml(html);
    if (substackRaw) {
      return substack.normalizeDetail(substackRaw);
    }

    const substackApiRaw = await substack.fetchPostFallbackApi(url);
    if (substackApiRaw) {
      return substack.normalizeDetail(substackApiRaw);
    }

    return generic.extractPost(html, url);
  } catch (error) {
    console.error("Post fetch error:", error);
    return null;
  }
}
