import { fetchHeaders, fetchWithTimeout, jsonFetchHeaders } from "../http";
import type { NormalizedAuthor, NormalizedPostDetail, NormalizedPostSummary } from "../../src/types";

export function parseSubstackPreloads(html: string): any | null {
  const match = html.match(/window\._preloads\s*=\s*JSON\.parse\(("(?:(?:\\.|[^"\\])*)")\)/s);
  if (!match) {
    return null;
  }

  // Substack embeds preload data as JSON.parse("escaped JSON text").
  const jsonText = JSON.parse(match[1]);
  return JSON.parse(jsonText);
}

function normalizeAuthor(raw: any): NormalizedAuthor {
  return { id: String(raw.id), name: raw.name, photoUrl: raw.photo_url };
}

function normalizeSummary(raw: any): NormalizedPostSummary {
  return {
    id: String(raw.id),
    title: raw.title,
    subtitle: raw.subtitle,
    publishedAt: raw.post_date || "",
    isPaywalled: raw.audience === "only_paid",
    canonicalUrl: raw.canonical_url,
    description: raw.description,
    coverImage: raw.cover_image,
    authors: raw.publishedBylines?.map(normalizeAuthor),
    platform: "substack",
  };
}

export function normalizeDetail(raw: any): NormalizedPostDetail {
  const summary = normalizeSummary(raw);
  const bodyHtml = raw.body_html || "";
  return {
    ...summary,
    bodyHtml,
    isPreviewOnly: summary.isPaywalled && bodyHtml.length > 0,
    siteName: "Substack",
  };
}

/**
 * Pure extraction from already-fetched post-page HTML — no network call.
 */
export function extractPostFromHtml(html: string): any | null {
  const data = parseSubstackPreloads(html);
  if (!data) return null;
  return data.post || data.postDetail || (data.pub && data.pub.post) || null;
}

/**
 * Fallback to Substack's undocumented post JSON API. Only meaningful for /p/<slug> URLs,
 * so it's a no-op (no network call) for any non-Substack-shaped path.
 */
export async function fetchPostFallbackApi(url: string): Promise<any | null> {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    if (pathParts[0] !== "p" || !pathParts[1]) return null;

    const apiUrl = `${parsed.origin}/api/v1/posts/${pathParts[1]}`;
    const apiRes = await fetchWithTimeout(apiUrl, { headers: jsonFetchHeaders });
    const apiText = await apiRes.text();
    if (apiText.trim().startsWith("{")) {
      return JSON.parse(apiText);
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchFeed(domain: string): Promise<NormalizedPostSummary[] | null> {
  try {
    const apiUrl = `https://${domain}/api/v1/archive?sort=new&limit=25`;
    const response = await fetchWithTimeout(apiUrl, { headers: jsonFetchHeaders });
    const text = await response.text();

    if (text.trim().startsWith("[") || text.trim().startsWith("{")) {
      const parsed = JSON.parse(text);
      const posts = Array.isArray(parsed) ? parsed : parsed.posts || [];
      return posts.map(normalizeSummary);
    }

    const archiveUrl = `https://${domain}/archive`;
    const archiveRes = await fetchWithTimeout(archiveUrl, { headers: fetchHeaders });
    const archiveHtml = await archiveRes.text();
    const data = parseSubstackPreloads(archiveHtml);
    if (!data) return null;

    const posts = data.newPostsForArchive || data.feed || data.posts || data.recentPosts || [];
    return posts.map(normalizeSummary);
  } catch (error) {
    console.error("Substack feed error:", error);
    return null;
  }
}
