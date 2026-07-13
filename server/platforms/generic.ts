import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import type { NormalizedPostDetail } from "../../src/types";
import { extractPageMetadata, type PageMetadata } from "./metadata";

/**
 * Universal fallback: runs Mozilla's Readability extractor against already-fetched
 * HTML for any URL not recognized by a platform-specific path. Depends on the HTML
 * being server-rendered -- pages that need client-side JS to produce content will
 * extract poorly since there's no headless browser here.
 */
export function extractPost(
  html: string,
  url: string,
  pageMetadata: PageMetadata = extractPageMetadata(html, url),
): NormalizedPostDetail | null {
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (!article || !article.content) return null;

    const siteName = pageMetadata.siteName || article.siteName || new URL(url).hostname;

    return {
      id: url,
      title: pageMetadata.title || article.title || "Untitled",
      publishedAt: article.publishedTime || "",
      isPaywalled: false,
      canonicalUrl: pageMetadata.canonicalUrl || url,
      description: pageMetadata.description || article.excerpt || undefined,
      coverImage: pageMetadata.image,
      authors: article.byline ? [{ id: article.byline, name: article.byline }] : undefined,
      platform: "generic",
      bodyHtml: article.content,
      isPreviewOnly: false,
      siteName,
    };
  } catch (error) {
    console.error("Generic extraction error:", error);
    return null;
  }
}
