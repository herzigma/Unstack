import type { ArchiveSnapshot } from "../src/types";
import { getArchiveIsCandidate } from "./platforms/archive";
import { getWaybackCandidate } from "./platforms/wayback";

const MIN_GAIN_RATIO = 1.5;
const MIN_GAIN_CHARS = 500;

/**
 * Only swap in an archive when it is substantially fuller. A thin gain would
 * merely trade the publisher's images and embeds for archive replay chrome.
 */
export function meetsGainThreshold(archiveTextLength: number, originalTextLength: number): boolean {
  if (originalTextLength <= 0) return archiveTextLength > 0;
  return (
    archiveTextLength >= originalTextLength * MIN_GAIN_RATIO &&
    archiveTextLength - originalTextLength >= MIN_GAIN_CHARS
  );
}

/**
 * Provider-neutral acquisition ladder. Wayback is first because it exposes a
 * documented lookup API; archive.is remains a useful secondary source when its
 * search and snapshot pages are reachable from the hosting network.
 */
export async function getArchiveCandidate(
  originalUrl: string,
  originalTextLength = 0,
): Promise<ArchiveSnapshot | null> {
  const providers = [getWaybackCandidate, getArchiveIsCandidate];

  for (const getCandidate of providers) {
    try {
      const candidate = await getCandidate(originalUrl);
      if (candidate && meetsGainThreshold(candidate.textLength, originalTextLength)) {
        return candidate;
      }
    } catch (error) {
      console.warn("Archive provider unavailable:", error);
    }
  }

  return null;
}
