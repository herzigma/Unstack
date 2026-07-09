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
    coverImage: item.enclosure?.url,
    authors: item.creator ? [{ id: item.creator, name: item.creator }] : undefined,
    platform: "ghost",
  };
}

export async function fetchFeed(domain: string): Promise<NormalizedPostSummary[] | null> {
  try {
    const feed = await parser.parseURL(`https://${domain}/rss/`);
    if (!feed.items || feed.items.length === 0) return null;
    return feed.items.map(normalizeItem);
  } catch (error) {
    console.error("Ghost feed error:", error);
    return null;
  }
}
