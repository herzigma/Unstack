import { findSnapshot, fetchSnapshot } from "../server/platforms/archive";

/**
 * A URL with a long-lived archive.is snapshot (confirmed present as of 2026-07-10).
 * archive.is snapshots don't get deleted once created, so this should stay valid
 * indefinitely. If it ever does get pruned, swap in another known-archived URL.
 */
const KNOWN_ARCHIVED_URL =
  "https://www.washingtonpost.com/health/2026/07/10/why-we-dont-know-what-food-is-spreading-parasite-sickening-thousands/";

/**
 * Live smoke test for server/platforms/archive.ts's scraping of archive.is's
 * unofficial /search/ page. Deliberately NOT part of the regular test suite --
 * archive.test.ts uses frozen HTML fixtures and can't detect real-world markup
 * drift, and hitting archive.is on every push risks the exact rate-limiting this
 * scraper works around. Run on a low-frequency schedule instead (see the
 * archive-drift-check.yml workflow).
 */
async function main() {
  console.log(`Checking archive.is scraping against: ${KNOWN_ARCHIVED_URL}`);

  const lookup = await findSnapshot(KNOWN_ARCHIVED_URL);
  if (!lookup) {
    console.error(
      "FAIL: findSnapshot() found no snapshot for a URL known to have one. " +
        "archive.is likely changed its /search/ page markup (e.g. the #row0 structure) or is blocking this request.",
    );
    process.exitCode = 1;
    return;
  }
  console.log(`  found snapshot: ${lookup.snapshotUrl} (${lookup.snapshotDate ?? "no date"})`);

  const extracted = await fetchSnapshot(lookup.snapshotUrl);
  if (!extracted || !extracted.bodyHtml) {
    console.error(
      "FAIL: fetchSnapshot() could not extract content from the snapshot. " +
        "archive.is may now be serving a CAPTCHA/challenge page for short-id URLs, or its markup broke Readability extraction.",
    );
    process.exitCode = 1;
    return;
  }
  console.log(`  extracted ${extracted.bodyHtml.length} chars of bodyHtml`);
  console.log("OK: archive.is scraping still works as expected.");
}

main().catch((error) => {
  console.error("FAIL: unexpected error while checking archive.is:", error);
  process.exitCode = 1;
});
