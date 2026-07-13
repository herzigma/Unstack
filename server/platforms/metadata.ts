import { JSDOM } from "jsdom";

export interface PageMetadata {
  title?: string;
  description?: string;
  image?: string;
  canonicalUrl?: string;
  siteName?: string;
}

function firstContent(document: Document, selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const content = document.querySelector(selector)?.getAttribute("content")?.trim();
    if (content) return content;
  }
  return undefined;
}

function resolveUrl(value: string | undefined, baseUrl: string): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return undefined;
  }
}

/** Extract publisher-authored preview metadata before Readability mutates the DOM. */
export function extractPageMetadata(html: string, url: string): PageMetadata {
  try {
    const document = new JSDOM(html, { url }).window.document;
    const title = firstContent(document, [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
    ]) || document.querySelector("title")?.textContent?.trim() || undefined;
    const description = firstContent(document, [
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
      'meta[name="description"]',
    ]);
    const image = resolveUrl(
      firstContent(document, [
        'meta[property="og:image:secure_url"]',
        'meta[property="og:image"]',
        'meta[name="twitter:image"]',
      ]),
      url,
    );
    const canonicalUrl = resolveUrl(
      document.querySelector('link[rel="canonical"]')?.getAttribute("href")?.trim() ||
        firstContent(document, ['meta[property="og:url"]']),
      url,
    );
    const siteName = firstContent(document, ['meta[property="og:site_name"]']);

    return { title, description, image, canonicalUrl, siteName };
  } catch {
    return {};
  }
}
