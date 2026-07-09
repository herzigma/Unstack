import Parser from "rss-parser";
import { fetchHeaders } from "../http";
import type { NormalizedPostSummary } from "../../src/types";

const parser = new Parser({ headers: fetchHeaders, timeout: 8000 });

function normalizeItem(item: Parser.Item, index: number): NormalizedPostSummary {
  return {
    id: item.guid || item.link || String(index),
    title: item.title || "Untitled",
    publishedAt: item.isoDate || item.pubDate || "",
    isPaywalled: false,
    canonicalUrl: item.link || "",
    description: item.contentSnippet || item.summary,
    authors: item.creator ? [{ id: item.creator, name: item.creator }] : undefined,
    platform: "medium",
  };
}

export async function fetchFeed(domain: string): Promise<NormalizedPostSummary[] | null> {
  // A bare "medium.com" hostname has no site-wide feed -- profile feeds need the
  // /@handle path, which isn't available from a domain-only lookup.
  if (domain === "medium.com") return null;

  try {
    const feed = await parser.parseURL(`https://${domain}/feed`);
    if (!feed.items || feed.items.length === 0) return null;
    return feed.items.map(normalizeItem);
  } catch (error) {
    console.error("Medium feed error:", error);
    return null;
  }
}
