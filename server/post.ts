import * as substack from "./platforms/substack";
import * as generic from "./platforms/generic";
import { fetchHeaders, fetchWithTimeout } from "./http";
import type { NormalizedPostDetail } from "../src/types";

const THIN_CONTENT_THRESHOLD = 1500;
const PAYWALL_METADATA_PATTERN =
  /"isAccessibleForFree"\s*:\s*(false|"false")|property="article:content_tier"[^>]*content="locked"|content="locked"[^>]*property="article:content_tier"/i;
const ACCESS_CHALLENGE_PATTERN =
  /please enable (?:java\s*script|js)(?: and disable any ad blocker)?|please complete the security check|<script[^>]+data-cfasync=["']false["'][^>]*>\s*var dd\s*=/i;

function estimateTextLength(html: string): number {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
}

function extractRawTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim() : "Untitled";
}

function siteNameForUrl(url: string): string {
  const hostname = new URL(url).hostname.replace(/^www\./i, "");
  return hostname === "nytimes.com" ? "The New York Times" : hostname;
}

function archiveEligibleStub(url: string, html: string): NormalizedPostDetail {
  const siteName = siteNameForUrl(url);
  const rawTitle = extractRawTitle(html);
  const rawTitleHostname = rawTitle.toLowerCase().replace(/^www\./, "");
  const urlHostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  const title = rawTitle === "Untitled" || rawTitleHostname === urlHostname ? siteName : rawTitle;

  return {
    id: url,
    title,
    publishedAt: "",
    isPaywalled: false,
    canonicalUrl: url,
    platform: "generic",
    bodyHtml: "",
    isPreviewOnly: false,
    siteName,
    archiveWorthChecking: true,
  };
}

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

    // Some publishers return an HTTP error page that Readability can still parse
    // as if it were an article. DataDome's NYTimes challenge is one example: its
    // "enable JS" sentence used to become the entire story. Treat access blocks as
    // failed extraction so the UI can try archive.is with a zero-length baseline.
    if (response.ok === false || ACCESS_CHALLENGE_PATTERN.test(html)) {
      return archiveEligibleStub(url, html);
    }

    const hasPaywallMetadata = PAYWALL_METADATA_PATTERN.test(html);

    const substackRaw = substack.extractPostFromHtml(html);
    if (substackRaw) {
      const detail = substack.normalizeDetail(substackRaw);
      return {
        ...detail,
        archiveWorthChecking: detail.isPreviewOnly || estimateTextLength(detail.bodyHtml) < THIN_CONTENT_THRESHOLD,
      };
    }

    const substackApiRaw = await substack.fetchPostFallbackApi(url);
    if (substackApiRaw) {
      const detail = substack.normalizeDetail(substackApiRaw);
      return {
        ...detail,
        archiveWorthChecking: detail.isPreviewOnly || estimateTextLength(detail.bodyHtml) < THIN_CONTENT_THRESHOLD,
      };
    }

    const genericDetail = generic.extractPost(html, url);
    if (!genericDetail) {
      // Readability found nothing at all -- return a stub rather than a bare failure
      // so the client still has a canonicalUrl/title to try an archive.is rescue with.
      return archiveEligibleStub(url, html);
    }

    return {
      ...genericDetail,
      archiveWorthChecking: hasPaywallMetadata || estimateTextLength(genericDetail.bodyHtml) < THIN_CONTENT_THRESHOLD,
    };
  } catch (error) {
    console.error("Post fetch error:", error);
    return null;
  }
}
