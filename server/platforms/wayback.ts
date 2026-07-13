import { getCached, setCached } from "../archiveCache";
import { fetchHeaders, fetchHtmlWithProxyFallback, fetchWithTimeout, jsonFetchHeaders } from "../http";
import type { ArchiveSnapshot, NormalizedPostDetail } from "../../src/types";
import * as generic from "./generic";

const AVAILABILITY_ENDPOINT = "https://archive.org/wayback/available";
const WAYBACK_HOSTNAME = "web.archive.org";
const BLOCKED_RESPONSE_PATTERN =
  /captcha|checking your browser|access denied|forbidden|too many requests|rate limit|has not archived that url|excluded from the wayback machine|cannot be crawled or displayed due to robots\.txt/i;

interface AvailabilitySnapshot {
  available?: boolean;
  url?: string;
  timestamp?: string;
  status?: string;
}

interface AvailabilityResponse {
  archived_snapshots?: {
    closest?: AvailabilitySnapshot;
  };
}

export interface WaybackSnapshotLookup {
  snapshotUrl: string;
  timestamp: string;
  snapshotDate: string | null;
}

interface WaybackLookupResult {
  snapshot: WaybackSnapshotLookup | null;
  authoritativeMiss: boolean;
}

function estimateTextLength(html: string): number {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
}

function formatTimestamp(timestamp: string): string | null {
  if (!/^\d{14}$/.test(timestamp)) return null;
  const month = Number(timestamp.slice(4, 6));
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (month < 1 || month > 12) return null;
  return `${Number(timestamp.slice(6, 8))} ${monthNames[month - 1]} ${timestamp.slice(0, 4)} ${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)} UTC`;
}

function normalizeSnapshotUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.hostname !== WAYBACK_HOSTNAME) {
      return null;
    }
    url.protocol = "https:";
    return url.href;
  } catch {
    return null;
  }
}

async function lookupWaybackSnapshot(originalUrl: string): Promise<WaybackLookupResult> {
  const url = `${AVAILABILITY_ENDPOINT}?url=${encodeURIComponent(originalUrl)}`;
  const response = await fetchWithTimeout(url, { headers: jsonFetchHeaders });
  if (!response.ok) {
    throw new Error(`Wayback Availability API returned HTTP ${response.status}`);
  }

  const data = await response.json() as AvailabilityResponse;
  const closest = data.archived_snapshots?.closest;
  if (!closest) {
    return { snapshot: null, authoritativeMiss: true };
  }
  if (!closest.available) {
    return { snapshot: null, authoritativeMiss: true };
  }
  if (closest.status !== "200" || !closest.url || !closest.timestamp) {
    throw new Error("Wayback Availability API returned an incomplete snapshot record");
  }

  const snapshotUrl = normalizeSnapshotUrl(closest.url);
  if (!snapshotUrl) {
    throw new Error("Wayback Availability API returned an unexpected snapshot URL");
  }

  return {
    authoritativeMiss: false,
    snapshot: {
      snapshotUrl,
      timestamp: closest.timestamp,
      snapshotDate: formatTimestamp(closest.timestamp),
    },
  };
}

/** Uses Wayback's documented Availability API instead of scraping its UI. */
export async function findWaybackSnapshot(originalUrl: string): Promise<WaybackSnapshotLookup | null> {
  return (await lookupWaybackSnapshot(originalUrl)).snapshot;
}

export async function fetchWaybackSnapshot(snapshotUrl: string): Promise<NormalizedPostDetail | null> {
  const normalizedUrl = normalizeSnapshotUrl(snapshotUrl);
  if (!normalizedUrl) return null;

  const { response, html } = await fetchHtmlWithProxyFallback(
    normalizedUrl,
    { headers: fetchHeaders },
    { shouldUseProxy: (_response, body) => BLOCKED_RESPONSE_PATTERN.test(body) },
  );
  if (response.ok === false || BLOCKED_RESPONSE_PATTERN.test(html)) return null;
  return generic.extractPost(html, normalizedUrl);
}

export async function getWaybackCandidate(originalUrl: string): Promise<ArchiveSnapshot | null> {
  const cacheKey = `wayback:${originalUrl}`;
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  let lookupResult: WaybackLookupResult;
  try {
    lookupResult = await lookupWaybackSnapshot(originalUrl);
  } catch (error) {
    console.warn("Wayback lookup unavailable:", error);
    return null;
  }

  const lookup = lookupResult.snapshot;
  if (!lookup) {
    if (lookupResult.authoritativeMiss) setCached(cacheKey, null);
    return null;
  }

  try {
    const extracted = await fetchWaybackSnapshot(lookup.snapshotUrl);
    if (!extracted?.bodyHtml) return null;

    const snapshot: ArchiveSnapshot = {
      source: "wayback",
      snapshotUrl: lookup.snapshotUrl,
      snapshotDate: lookup.snapshotDate,
      bodyHtml: extracted.bodyHtml,
      textLength: estimateTextLength(extracted.bodyHtml),
    };
    setCached(cacheKey, snapshot);
    return snapshot;
  } catch (error) {
    console.warn("Wayback snapshot unavailable:", error);
    return null;
  }
}
