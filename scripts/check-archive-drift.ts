import { findSnapshotDetailed, fetchSnapshotDetailed } from "../server/platforms/archive";

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

  const lookupResult = await findSnapshotDetailed(KNOWN_ARCHIVED_URL);
  if (!lookupResult.snapshot) {
    console.error(`  lookup status: ${lookupResult.status}`);
    for (const diagnostic of lookupResult.diagnostics) {
      console.error(`  ${JSON.stringify(diagnostic)}`);
    }

    if (lookupResult.status === "drift" || lookupResult.status === "not_found") {
      console.error(
        lookupResult.status === "drift"
          ? "FAIL: archive.is returned its expected result structure, but the short-id link parser no longer matches."
          : "FAIL: archive.is explicitly reports no snapshot for a URL known to have one.",
      );
      process.exitCode = 1;
    } else {
      console.warn(
        "INCONCLUSIVE: the runner could not reach a recognizable archive.is search page. " +
          "This is an availability or hosting-network block, not evidence of markup drift.",
      );
    }
    return;
  }
  const lookup = lookupResult.snapshot;
  console.log(`  found snapshot: ${lookup.snapshotUrl} (${lookup.snapshotDate ?? "no date"})`);

  const snapshotResult = await fetchSnapshotDetailed(lookup.snapshotUrl);
  if (!snapshotResult.post?.bodyHtml) {
    console.error(`  snapshot status: ${snapshotResult.status}`);
    console.error(`  ${JSON.stringify(snapshotResult.diagnostic)}`);
    if (snapshotResult.status === "extraction_failed") {
      console.error("FAIL: snapshot HTML was reachable, but Readability could no longer extract it.");
      process.exitCode = 1;
    } else {
      console.warn(
        "INCONCLUSIVE: the runner could not retrieve usable snapshot HTML. " +
          "This is an availability or hosting-network block, not evidence of extraction drift.",
      );
    }
    return;
  }
  const extracted = snapshotResult.post;
  console.log(`  extracted ${extracted.bodyHtml.length} chars of bodyHtml`);
  console.log("OK: archive.is scraping still works as expected.");
}

main().catch((error) => {
  console.error("FAIL: unexpected error while checking archive.is:", error);
  process.exitCode = 1;
});
