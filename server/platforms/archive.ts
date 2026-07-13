import { JSDOM } from "jsdom";
import { fetchHeaders, fetchHtmlWithProxyFallback, type HtmlFetchResult } from "../http";
import { getCached, setCached } from "../archiveCache";
import * as generic from "./generic";
import type { ArchiveSnapshot, NormalizedPostDetail } from "../../src/types";

const SHORT_ID_PATTERN = /^https?:\/\/archive\.[a-z]+\/[A-Za-z0-9]{4,6}$/;
const SHORT_ID_HREF_PATTERN = /href\s*=\s*["']https?:\/\/archive\.[a-z]+\/[A-Za-z0-9]{4,6}["']/i;
const NO_RESULTS_PATTERN = /no results/i;
const BLOCKED_RESPONSE_PATTERN =
  /please complete the security check|one more step|captcha|checking your browser|cloudflare|access denied|forbidden|too many requests|rate limit/i;
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

export interface SnapshotLookup {
  snapshotUrl: string;
  snapshotDate: string | null;
  originalTitle: string | null;
}

export type SnapshotLookupStatus =
  | "found"
  | "not_found"
  | "blocked"
  | "drift"
  | "unexpected"
  | "error";

export interface SnapshotLookupDiagnostic {
  variant: string;
  status: Exclude<SnapshotLookupStatus, "found">;
  httpStatus: number | null;
  transport: HtmlFetchResult["transport"] | null;
  responseUrl: string | null;
  responseTitle: string | null;
  bodyLength: number | null;
  reason: string;
}

export interface SnapshotLookupResult {
  status: SnapshotLookupStatus;
  snapshot: SnapshotLookup | null;
  diagnostics: SnapshotLookupDiagnostic[];
}

export type SnapshotFetchStatus = "found" | "blocked" | "extraction_failed" | "error";

export interface SnapshotFetchResult {
  status: SnapshotFetchStatus;
  post: NormalizedPostDetail | null;
  diagnostic: {
    httpStatus: number | null;
    transport: HtmlFetchResult["transport"] | null;
    responseUrl: string;
    responseTitle: string | null;
    bodyLength: number | null;
    reason: string;
  };
}

function responseTitle(html: string): string | null {
  return html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || null;
}

function searchResponseNeedsProxy(_response: Response, html: string): boolean {
  if (BLOCKED_RESPONSE_PATTERN.test(html)) return true;
  if (NO_RESULTS_PATTERN.test(html) || SHORT_ID_HREF_PATTERN.test(html)) return false;
  return true;
}

function finalLookupStatus(diagnostics: SnapshotLookupDiagnostic[]): SnapshotLookupStatus {
  const statuses = new Set(diagnostics.map((diagnostic) => diagnostic.status));
  if (statuses.has("drift")) return "drift";
  if (statuses.has("blocked")) return "blocked";
  if (statuses.has("unexpected")) return "unexpected";
  if (statuses.has("error")) return "error";
  return "not_found";
}

/**
 * Searches archive.is while retaining enough response metadata to distinguish an
 * explicit miss, an access block, recognizable parser drift, and an unknown page.
 */
export async function findSnapshotDetailed(originalUrl: string): Promise<SnapshotLookupResult> {
  const diagnostics: SnapshotLookupDiagnostic[] = [];

  for (const variant of urlVariants(originalUrl)) {
    const searchUrl = `https://archive.is/search/?q=${encodeURIComponent(variant)}`;
    try {
      const { response, html, transport } = await fetchHtmlWithProxyFallback(
        searchUrl,
        { headers: fetchHeaders },
        { shouldUseProxy: searchResponseNeedsProxy },
      );
      const commonDiagnostic = {
        variant,
        httpStatus: response.status || 200,
        transport,
        responseUrl: response.url || searchUrl,
        responseTitle: responseTitle(html),
        bodyLength: html.length,
      };

      if (response.status === 403 || response.status === 429 || BLOCKED_RESPONSE_PATTERN.test(html)) {
        diagnostics.push({
          ...commonDiagnostic,
          status: "blocked",
          reason: response.status === 403 || response.status === 429
            ? `archive.is returned HTTP ${response.status}`
            : "archive.is returned challenge or access-block markers",
        });
        continue;
      }
      if (response.ok === false) {
        diagnostics.push({
          ...commonDiagnostic,
          status: "error",
          reason: `archive.is returned HTTP ${response.status}`,
        });
        continue;
      }

      const doc = new JSDOM(html).window.document;
      const row = doc.querySelector("#row0");
      const anchor = [...(row ?? doc).querySelectorAll("a[href]")].find((el) =>
        SHORT_ID_PATTERN.test(el.getAttribute("href") || ""),
      );
      const snapshotUrl = anchor?.getAttribute("href");
      if (!snapshotUrl) {
        if (NO_RESULTS_PATTERN.test(html)) {
          diagnostics.push({
            ...commonDiagnostic,
            status: "not_found",
            reason: "archive.is explicitly reported no results",
          });
        } else if (row) {
          diagnostics.push({
            ...commonDiagnostic,
            status: "drift",
            reason: "#row0 exists but no short-id archive link matched",
          });
        } else {
          diagnostics.push({
            ...commonDiagnostic,
            status: "unexpected",
            reason: "response was neither a result, explicit miss, nor recognized challenge",
          });
        }
        continue;
      }

      const dateMatch = html.match(/(\d{1,2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2})/);
      const titleImg = (row ?? doc).querySelector("img[title]");

      return {
        status: "found",
        snapshot: {
          snapshotUrl,
          snapshotDate: dateMatch ? dateMatch[1] : null,
          originalTitle: titleImg?.getAttribute("title") || null,
        },
        diagnostics,
      };
    } catch (error) {
      diagnostics.push({
        variant,
        status: "error",
        httpStatus: null,
        transport: null,
        responseUrl: searchUrl,
        responseTitle: null,
        bodyLength: null,
        reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      });
    }
  }

  return { status: finalLookupStatus(diagnostics), snapshot: null, diagnostics };
}

/** Backward-compatible lookup for callers that only need the snapshot itself. */
export async function findSnapshot(originalUrl: string): Promise<SnapshotLookup | null> {
  return (await findSnapshotDetailed(originalUrl)).snapshot;
}

/**
 * Fetches a snapshot at its short-id URL and reports whether failure came from an
 * access block, transport error, or a genuine extraction failure.
 */
export async function fetchSnapshotDetailed(snapshotUrl: string): Promise<SnapshotFetchResult> {
  try {
    const { response, html, transport } = await fetchHtmlWithProxyFallback(
      snapshotUrl,
      { headers: fetchHeaders },
      { shouldUseProxy: (_response, body) => BLOCKED_RESPONSE_PATTERN.test(body) },
    );
    const diagnosticBase = {
      httpStatus: response.status || 200,
      transport,
      responseUrl: response.url || snapshotUrl,
      responseTitle: responseTitle(html),
      bodyLength: html.length,
    };
    if (response.status === 403 || response.status === 429 || BLOCKED_RESPONSE_PATTERN.test(html)) {
      return {
        status: "blocked",
        post: null,
        diagnostic: {
          ...diagnosticBase,
          reason: response.status === 403 || response.status === 429
            ? `archive.is returned HTTP ${response.status}`
            : "archive.is returned challenge or access-block markers",
        },
      };
    }
    if (response.ok === false) {
      return {
        status: "error",
        post: null,
        diagnostic: { ...diagnosticBase, reason: `archive.is returned HTTP ${response.status}` },
      };
    }

    const post = generic.extractPost(html, snapshotUrl);
    if (!post?.bodyHtml) {
      return {
        status: "extraction_failed",
        post: null,
        diagnostic: {
          ...diagnosticBase,
          reason: "snapshot HTML was reachable but Readability extracted no article body",
        },
      };
    }
    return {
      status: "found",
      post,
      diagnostic: { ...diagnosticBase, reason: "snapshot fetched and extracted" },
    };
  } catch (error) {
    return {
      status: "error",
      post: null,
      diagnostic: {
        httpStatus: null,
        transport: null,
        responseUrl: snapshotUrl,
        responseTitle: null,
        bodyLength: null,
        reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      },
    };
  }
}

export async function fetchSnapshot(snapshotUrl: string): Promise<NormalizedPostDetail | null> {
  return (await fetchSnapshotDetailed(snapshotUrl)).post;
}

/**
 * Full lookup + fetch + extract for an original article URL, cached (hits and
 * misses) since archive.is has no cache of its own and rate-limits aggressively.
 */
export async function getArchiveCandidate(originalUrl: string): Promise<ArchiveSnapshot | null> {
  const cached = getCached(originalUrl);
  if (cached !== undefined) return cached;

  const lookupResult = await findSnapshotDetailed(originalUrl);
  if (!lookupResult.snapshot) {
    // Cache only authoritative misses. Blocks, network errors, and unrecognized
    // pages are transient and should be retried on a later request.
    if (lookupResult.status === "not_found") {
      setCached(originalUrl, null);
    } else {
      console.warn("Archive.is lookup unavailable:", {
        status: lookupResult.status,
        diagnostics: lookupResult.diagnostics,
      });
    }
    return null;
  }

  const lookup = lookupResult.snapshot;
  const snapshotResult = await fetchSnapshotDetailed(lookup.snapshotUrl);
  const extracted = snapshotResult.post;
  if (!extracted?.bodyHtml) {
    console.warn("Archive.is snapshot unavailable:", {
      status: snapshotResult.status,
      diagnostic: snapshotResult.diagnostic,
    });
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
