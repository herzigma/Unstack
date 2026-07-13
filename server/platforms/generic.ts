import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import type { NormalizedPostDetail } from "../../src/types";
import { extractPageMetadata, type PageMetadata } from "./metadata";

const MIN_JSON_LD_GAIN_CHARS = 200;

function estimateTextLength(html: string): number {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function articleBodies(value: unknown, results: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) articleBodies(item, results);
    return;
  }
  if (!value || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  if (typeof record.articleBody === "string" && record.articleBody.trim()) {
    results.push(record.articleBody.trim());
  }
  for (const child of Object.values(record)) articleBodies(child, results);
}

function extractJsonLdBody(document: Document): string | null {
  const bodies: string[] = [];
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      articleBodies(JSON.parse(script.textContent || ""), bodies);
    } catch {
      // A malformed JSON-LD block should not suppress normal Readability output.
    }
  }

  const body = bodies.sort((a, b) => b.length - a.length)[0];
  if (!body) return null;
  const paragraphs = body.split(/\n\s*\n|\r\n\s*\r\n/).map((part) => part.trim()).filter(Boolean);
  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\r?\n/g, "<br>")}</p>`).join("");
}

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
    const jsonLdBody = extractJsonLdBody(dom.window.document);
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    const readabilityBody = article?.content || null;
    const readabilityLength = estimateTextLength(readabilityBody || "");
    const jsonLdLength = estimateTextLength(jsonLdBody || "");
    const bodyHtml = jsonLdBody && (
      readabilityLength === 0 || jsonLdLength - readabilityLength >= MIN_JSON_LD_GAIN_CHARS
    )
      ? jsonLdBody
      : readabilityBody;
    if (!bodyHtml) return null;

    const siteName = pageMetadata.siteName || article?.siteName || new URL(url).hostname;

    return {
      id: url,
      title: pageMetadata.title || article?.title || "Untitled",
      publishedAt: article?.publishedTime || "",
      isPaywalled: false,
      canonicalUrl: pageMetadata.canonicalUrl || url,
      description: pageMetadata.description || article?.excerpt || undefined,
      coverImage: pageMetadata.image,
      authors: article?.byline ? [{ id: article.byline, name: article.byline }] : undefined,
      platform: "generic",
      bodyHtml,
      isPreviewOnly: false,
      siteName,
    };
  } catch (error) {
    console.error("Generic extraction error:", error);
    return null;
  }
}
