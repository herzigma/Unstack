import { JSDOM } from "jsdom";
import { fetchHeaders, fetchWithTimeout } from "../http";
import { getCached, setCached } from "../archiveCache";
import * as generic from "./generic";
import type { ArchiveSnapshot, NormalizedPostDetail } from "../../src/types";

const SHORT_ID_PATTERN = /^https?:\/\/archive\.[a-z]+\/[A-Za-z0-9]{4,6}$/;
const CAPTCHA_PATTERN = /please complete the security check|one more step/i;
const TRACKING_PARAM_PATTERN = /^(utm_|ref$|fbclid$|s$)/i;
const MIN_GAIN_RATIO = 1.5;
const MIN_GAIN_CHARS = 500;

function estimateTextLength(html: string): number {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
}

/**
 * archive.is's own snapshot lookup (/newest/<url>, /<timestamp>/<url>, the Memento
 * /timemap/ API) is Cloudflare-walled and returns a 429 CAPTCHA page even when a
 * snapshot exists. Only /search/?q=<url> is unguarded, and it links to the fetchable
 * short-id form (archive.is/<shortid>) that serves the actual snapshot.
 */
function urlVariants(originalUrl: string): string[] {
  const variants = new Set<string>([originalUrl]);

  try {
    const parsed = new URL(originalUrl);
    const stripped = new URL(originalUrl);
    for (const key of [...stripped.searchParams.keys()]) {
      if (TRACKING_PARAM_PATTERN.test(key)) {
        stripped.searchParams.delete(key);
      }
    }
    variants.add(stripped.toString());

    const toggledSlash = new URL(stripped.toString());
    if (toggledSlash.pathname.endsWith("/") && toggledSlash.pathname.length > 1) {
      toggledSlash.pathname = toggledSlash.pathname.slice(0, -1);
    } else {
      toggledSlash.pathname = `${toggledSlash.pathname}/`;
    }
    variants.add(toggledSlash.toString());
    variants.add(parsed.toString());
  } catch {
    // Fall through with whatever variants we've collected.
  }

  return [...variants];
}

interface SnapshotLookup {
  snapshotUrl: string;
  snapshotDate: string | null;
  originalTitle: string | null;
}

/**
 * Searches archive.is for an existing snapshot of originalUrl. Returns null when no
 * snapshot exists for any URL variant, or when the lookup itself fails.
 */
export async function findSnapshot(originalUrl: string): Promise<SnapshotLookup | null> {
  for (const variant of urlVariants(originalUrl)) {
    try {
      const searchUrl = `https://archive.is/search/?q=${encodeURIComponent(variant)}`;
      const response = await fetchWithTimeout(searchUrl, { headers: fetchHeaders });
      const html = await response.text();
      if (/no results/i.test(html)) continue;

      const doc = new JSDOM(html).window.document;
      const row = doc.querySelector("#row0");
      const anchor = [...(row ?? doc).querySelectorAll("a[href]")].find((el) =>
        SHORT_ID_PATTERN.test(el.getAttribute("href") || ""),
      );
      const snapshotUrl = anchor?.getAttribute("href");
      if (!snapshotUrl) continue;

      const dateMatch = html.match(/(\d{1,2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2})/);
      const titleImg = (row ?? doc).querySelector("img[title]");

      return {
        snapshotUrl,
        snapshotDate: dateMatch ? dateMatch[1] : null,
        originalTitle: titleImg?.getAttribute("title") || null,
      };
    } catch (error) {
      console.error("Archive.is search error:", error);
    }
  }
  return null;
}

/**
 * Fetches a snapshot at its short-id URL and extracts it with the same generic
 * Readability path used for ordinary articles. Rejects CAPTCHA/challenge pages
 * outright rather than let Readability parse them into fake "content".
 */
export async function fetchSnapshot(snapshotUrl: string): Promise<NormalizedPostDetail | null> {
  try {
    const response = await fetchWithTimeout(snapshotUrl, { headers: fetchHeaders });
    const html = await response.text();
    if (CAPTCHA_PATTERN.test(html)) return null;

    return generic.extractPost(html, snapshotUrl);
  } catch (error) {
    console.error("Archive.is snapshot fetch error:", error);
    return null;
  }
}

/**
 * Full lookup + fetch + extract for an original article URL, cached (hits and
 * misses) since archive.is has no cache of its own and rate-limits aggressively.
 */
export async function getArchiveCandidate(originalUrl: string): Promise<ArchiveSnapshot | null> {
  const cached = getCached(originalUrl);
  if (cached !== undefined) return cached;

  const lookup = await findSnapshot(originalUrl);
  if (!lookup) {
    setCached(originalUrl, null);
    return null;
  }

  const extracted = await fetchSnapshot(lookup.snapshotUrl);
  if (!extracted || !extracted.bodyHtml) {
    setCached(originalUrl, null);
    return null;
  }

  const snapshot: ArchiveSnapshot = {
    snapshotUrl: lookup.snapshotUrl,
    snapshotDate: lookup.snapshotDate,
    bodyHtml: extracted.bodyHtml,
    textLength: estimateTextLength(extracted.bodyHtml),
  };
  setCached(originalUrl, snapshot);
  return snapshot;
}

/**
 * Only worth swapping in the archive copy when it's substantially fuller -- a
 * thin gain just trades the original's images/embeds for archive.is chrome.
 * Verified empirically: a 14.3x gain (662->9459 chars) should pass, a 1.1x gain
 * (3268->3586 chars) should not.
 */
export function meetsGainThreshold(archiveTextLength: number, originalTextLength: number): boolean {
  if (originalTextLength <= 0) return archiveTextLength > 0;
  return (
    archiveTextLength >= originalTextLength * MIN_GAIN_RATIO &&
    archiveTextLength - originalTextLength >= MIN_GAIN_CHARS
  );
}
