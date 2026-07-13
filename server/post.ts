import * as substack from "./platforms/substack";
import * as generic from "./platforms/generic";
import { fetchHeaders, fetchHtmlWithProxyFallback } from "./http";
import { extractPageMetadata, type PageMetadata } from "./platforms/metadata";
import { getPublisherAlternative } from "./platforms/publisherAlternates";
import { getCachedPost, isPostCacheable, setCachedPost } from "./postCache";
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

function archiveEligibleStub(
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
    archiveWorthChecking: true,
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
    // failed extraction so publisher alternatives and archives can still recover it.
    if (response.ok === false || ACCESS_CHALLENGE_PATTERN.test(html)) {
      const stub = archiveEligibleStub(url, html, pageMetadata);
      const alternative = await getPublisherAlternative(url, html, stub);
      const selected = alternative?.post || stub;
      return {
        ...selected,
        archiveWorthChecking: estimateTextLength(selected.bodyHtml) < THIN_CONTENT_THRESHOLD,
      };
    }

    const substackRaw = substack.extractPostFromHtml(html);
    if (substackRaw) {
      const detail = applyPageMetadata(substack.normalizeDetail(substackRaw), pageMetadata);
      return {
        ...detail,
        archiveWorthChecking: detail.isPreviewOnly || estimateTextLength(detail.bodyHtml) < THIN_CONTENT_THRESHOLD,
      };
    }

    const substackApiRaw = await substack.fetchPostFallbackApi(url);
    if (substackApiRaw) {
      const detail = applyPageMetadata(substack.normalizeDetail(substackApiRaw), pageMetadata);
      return {
        ...detail,
        archiveWorthChecking: detail.isPreviewOnly || estimateTextLength(detail.bodyHtml) < THIN_CONTENT_THRESHOLD,
      };
    }

    const genericDetail = generic.extractPost(html, url, pageMetadata) ||
      archiveEligibleStub(url, html, pageMetadata);
    const originalLength = estimateTextLength(genericDetail.bodyHtml);
    let selected = genericDetail;
    if (hasPaywallMetadata || originalLength < THIN_CONTENT_THRESHOLD) {
      const alternative = await getPublisherAlternative(url, html, genericDetail);
      if (alternative) selected = alternative.post;
    }

    return {
      ...selected,
      archiveWorthChecking: hasPaywallMetadata || estimateTextLength(selected.bodyHtml) < THIN_CONTENT_THRESHOLD,
    };
  } catch (error) {
    console.error("Post fetch error:", error);
    // A hosting-network timeout or DNS failure should still reach the archive
    // fallback in the client. Returning null makes /api/post emit a terminal 404.
    return archiveEligibleStub(url, "");
  }
}

export async function getPost(url: string): Promise<NormalizedPostDetail | null> {
  const cached = getCachedPost(url);
  if (cached) return cached;

  const post = await fetchPostUncached(url);
  if (post && isPostCacheable(post, url)) setCachedPost(url, post);
  return post;
}
