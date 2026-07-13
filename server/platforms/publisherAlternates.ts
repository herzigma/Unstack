import { JSDOM } from "jsdom";
import Parser from "rss-parser";
import type { NormalizedPostDetail } from "../../src/types";
import { fetchHeaders, fetchHtmlWithProxyFallback } from "../http";
import * as generic from "./generic";

const MIN_USEFUL_TEXT = 200;
const MIN_GAIN_CHARS = 200;
const MAX_FEED_BYTES = 5 * 1024 * 1024;
const parser = new Parser({
  customFields: {
    item: [["content:encoded", "contentEncoded"]],
  },
});

export type PublisherAlternativeKind = "amp" | "print" | "feed";

export interface PublisherAlternative {
  kind: PublisherAlternativeKind;
  post: NormalizedPostDetail;
}

type FeedItem = Parser.Item & { contentEncoded?: unknown };

interface DiscoveredAlternatives {
  html: Array<{ kind: "amp" | "print"; url: string }>;
  feeds: string[];
}

function estimateTextLength(html: string): number {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
}

function normalizedHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function sameSiteUrl(href: string | null, baseUrl: string): string | null {
  if (!href) return null;
  try {
    const base = new URL(baseUrl);
    const candidate = new URL(href, base);
    if (candidate.protocol !== "http:" && candidate.protocol !== "https:") return null;
    if (candidate.username || candidate.password) return null;
    if (normalizedHostname(candidate.hostname) !== normalizedHostname(base.hostname)) return null;
    candidate.hash = "";
    return candidate.href === base.href ? null : candidate.href;
  } catch {
    return null;
  }
}

export function discoverPublisherAlternatives(html: string, originalUrl: string): DiscoveredAlternatives {
  const result: DiscoveredAlternatives = { html: [], feeds: [] };
  try {
    const document = new JSDOM(html, { url: originalUrl }).window.document;
    const seen = new Set<string>();

    for (const link of document.querySelectorAll("link[href]")) {
      const rel = (link.getAttribute("rel") || "").toLowerCase().split(/\s+/);
      const type = (link.getAttribute("type") || "").toLowerCase();
      const media = (link.getAttribute("media") || "").toLowerCase();
      const title = (link.getAttribute("title") || "").toLowerCase();
      const url = sameSiteUrl(link.getAttribute("href"), originalUrl);
      if (!url || seen.has(url)) continue;

      if (rel.includes("amphtml")) {
        result.html.push({ kind: "amp", url });
        seen.add(url);
      } else if (rel.includes("alternate") && (media.includes("print") || title === "print")) {
        result.html.push({ kind: "print", url });
        seen.add(url);
      } else if (rel.includes("alternate") && /application\/(rss|atom)\+xml/.test(type)) {
        result.feeds.push(url);
        seen.add(url);
      }
    }
  } catch {
    // Invalid publisher markup simply means there are no usable alternatives.
  }
  return { html: result.html.slice(0, 2), feeds: result.feeds.slice(0, 1) };
}

function comparableUrl(value: string): string | null {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|ref$)/i.test(key)) url.searchParams.delete(key);
    }
    const host = normalizedHostname(url.hostname);
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
    return `${host}${path}${url.search}`;
  } catch {
    return null;
  }
}

function mergeAlternative(
  original: NormalizedPostDetail,
  alternative: NormalizedPostDetail,
): NormalizedPostDetail {
  return {
    ...alternative,
    id: original.id,
    title: original.title === "Untitled" ? alternative.title : original.title,
    canonicalUrl: original.canonicalUrl,
    description: original.description || alternative.description,
    coverImage: original.coverImage || alternative.coverImage,
    siteName: original.siteName || alternative.siteName,
    platform: original.platform,
    isPaywalled: original.isPaywalled,
    isPreviewOnly: false,
  };
}

async function fetchHtmlAlternative(
  candidate: { kind: "amp" | "print"; url: string },
  original: NormalizedPostDetail,
): Promise<PublisherAlternative | null> {
  try {
    const { response, html } = await fetchHtmlWithProxyFallback(candidate.url, { headers: fetchHeaders });
    if (response.ok === false) return null;
    const extracted = generic.extractPost(html, candidate.url);
    if (!extracted?.bodyHtml) return null;
    return { kind: candidate.kind, post: mergeAlternative(original, extracted) };
  } catch {
    return null;
  }
}

function feedBody(item: FeedItem): string | null {
  const value = item.contentEncoded || item.content || item.summary;
  if (typeof value !== "string" || !value.trim()) return null;
  return /<[a-z][\s\S]*>/i.test(value) ? value.trim() : `<p>${value.trim()}</p>`;
}

async function fetchFeedAlternative(
  feedUrl: string,
  originalUrl: string,
  original: NormalizedPostDetail,
): Promise<PublisherAlternative | null> {
  try {
    const { response, html } = await fetchHtmlWithProxyFallback(feedUrl, { headers: fetchHeaders });
    if (response.ok === false || html.length > MAX_FEED_BYTES) return null;
    const feed = await parser.parseString(html);
    const targets = new Set(
      [originalUrl, original.canonicalUrl].map(comparableUrl).filter((value): value is string => Boolean(value)),
    );
    const item = feed.items.find((candidate) => {
      const urls = [candidate.link, candidate.guid]
        .filter((value): value is string => typeof value === "string")
        .map(comparableUrl);
      return urls.some((value) => value && targets.has(value));
    }) as FeedItem | undefined;
    if (!item) return null;

    const bodyHtml = feedBody(item);
    if (!bodyHtml) return null;
    const post: NormalizedPostDetail = {
      ...original,
      title: original.title === "Untitled" ? item.title || original.title : original.title,
      publishedAt: original.publishedAt || item.isoDate || item.pubDate || "",
      authors: original.authors || (item.creator ? [{ id: item.creator, name: item.creator }] : undefined),
      bodyHtml,
      isPreviewOnly: false,
    };
    return { kind: "feed", post };
  } catch {
    return null;
  }
}

/** Fetches only publisher-declared, same-site alternatives and returns the fullest useful body. */
export async function getPublisherAlternative(
  originalUrl: string,
  originalHtml: string,
  original: NormalizedPostDetail,
): Promise<PublisherAlternative | null> {
  const discovered = discoverPublisherAlternatives(originalHtml, originalUrl);
  const attempts = [
    ...discovered.html.map((candidate) => fetchHtmlAlternative(candidate, original)),
    ...discovered.feeds.map((feedUrl) => fetchFeedAlternative(feedUrl, originalUrl, original)),
  ];
  if (attempts.length === 0) return null;

  const settled = await Promise.all(attempts);
  const originalLength = estimateTextLength(original.bodyHtml);
  const candidates = settled
    .filter((value): value is PublisherAlternative => Boolean(value))
    .filter((value) => estimateTextLength(value.post.bodyHtml) >= MIN_USEFUL_TEXT)
    .sort((a, b) => estimateTextLength(b.post.bodyHtml) - estimateTextLength(a.post.bodyHtml));
  const best = candidates[0];
  if (!best) return null;
  return estimateTextLength(best.post.bodyHtml) - originalLength >= MIN_GAIN_CHARS ? best : null;
}
