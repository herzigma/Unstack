import * as substack from "./platforms/substack";
import * as generic from "./platforms/generic";
import { fetchHeaders, fetchHtmlWithProxyFallback } from "./http";
import { extractPageMetadata, type PageMetadata } from "./platforms/metadata";
import { getPublisherAlternative } from "./platforms/publisherAlternates";
import { getCachedPost, isPostCacheable, setCachedPost } from "./postCache";
import type { NormalizedPostDetail } from "../src/types";

const THIN_CONTENT_THRESHOLD = 1500;
const FAST_METADATA_FETCH_TIMEOUT_MS = 2500;
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

function fallbackPostFromMetadata(
  url: string,
  html: string,
  pageMetadata: PageMetadata = extractPageMetadata(html, url),
): NormalizedPostDetail {
  const siteName = pageMetadata.siteName || siteNameForUrl(url);
  const rawTitle = pageMetadata.title || extractRawTitle(html);
  const rawTitleHostname = rawTitle.toLowerCase().replace(/^www\./, "");
  const urlHostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  const title = rawTitle === "Untitled" || rawTitleHostname === urlHostname ? siteName : rawTitle;

  return {
    id: url,
    title,
    publishedAt: "",
    isPaywalled: false,
    canonicalUrl: pageMetadata.canonicalUrl || url,
    description: pageMetadata.description,
    coverImage: pageMetadata.image,
    platform: "generic",
    bodyHtml: "",
    isPreviewOnly: false,
    siteName,
  };
}

function applyPageMetadata(
  detail: NormalizedPostDetail,
  pageMetadata: PageMetadata,
): NormalizedPostDetail {
  return {
    ...detail,
    description: detail.description || pageMetadata.description,
    coverImage: detail.coverImage || pageMetadata.image,
    siteName: pageMetadata.siteName || detail.siteName,
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

async function fetchPostUncached(url: string): Promise<NormalizedPostDetail | null> {
  try {
    const { response, html } = await fetchHtmlWithProxyFallback(
      url,
      { headers: fetchHeaders },
      { shouldUseProxy: (_response, body) => ACCESS_CHALLENGE_PATTERN.test(body) },
    );
    const pageMetadata = extractPageMetadata(html, url);
    const hasPaywallMetadata = PAYWALL_METADATA_PATTERN.test(html);

    // Some publishers return an HTTP error page that Readability can still parse
    // as if it were an article. DataDome's NYTimes challenge is one example: its
    // "enable JS" sentence used to become the entire story. Treat access blocks as
    // failed extraction so publisher alternatives can still recover it.
    if (response.ok === false || ACCESS_CHALLENGE_PATTERN.test(html)) {
      const stub = fallbackPostFromMetadata(url, html, pageMetadata);
      const alternative = await getPublisherAlternative(url, html, stub);
      return alternative?.post || stub;
    }

    const substackRaw = substack.extractPostFromHtml(html);
    if (substackRaw) {
      return applyPageMetadata(substack.normalizeDetail(substackRaw), pageMetadata);
    }

    const substackApiRaw = await substack.fetchPostFallbackApi(url);
    if (substackApiRaw) {
      return applyPageMetadata(substack.normalizeDetail(substackApiRaw), pageMetadata);
    }

    const genericDetail = generic.extractPost(html, url, pageMetadata) ||
      fallbackPostFromMetadata(url, html, pageMetadata);
    const originalLength = estimateTextLength(genericDetail.bodyHtml);
    let selected = genericDetail;
    if (hasPaywallMetadata || originalLength < THIN_CONTENT_THRESHOLD) {
      const alternative = await getPublisherAlternative(url, html, genericDetail);
      if (alternative) selected = alternative.post;
    }

    return selected;
  } catch (error) {
    console.error("Post fetch error:", error);
    // A hosting-network timeout or DNS failure should still yield a stub instead
    // of a bare 404, since page metadata may still be usable.
    return fallbackPostFromMetadata(url, "");
  }
}

export async function getPost(url: string): Promise<NormalizedPostDetail | null> {
  const cached = getCachedPost(url);
  if (cached) return cached;

  const post = await fetchPostUncached(url);
  if (post && isPostCacheable(post, url)) setCachedPost(url, post);
  return post;
}

/**
 * A single bounded fetch + page-metadata extraction, skipping Substack/generic
 * body extraction and publisher-alternate fan-out entirely. Used as a fast
 * fallback (e.g. for SSR social-preview tags) when the full getPost() extraction
 * is too slow to wait for -- still returns a real title/description/image from
 * the page's own meta tags rather than nothing.
 */
export async function fetchFastPostMetadata(url: string): Promise<NormalizedPostDetail | null> {
  try {
    const { html } = await fetchHtmlWithProxyFallback(
      url,
      { headers: fetchHeaders },
      { timeoutMs: FAST_METADATA_FETCH_TIMEOUT_MS },
    );
    return fallbackPostFromMetadata(url, html);
  } catch (error) {
    console.error("Fast post metadata fetch error:", error);
    return null;
  }
}
