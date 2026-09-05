// Fetches OSM Overpass elements for El Salvador, normalizes them, and writes
// a JSON snapshot to disk. Doesn't touch the DB — inspect the snapshot (e.g.
// via the review notebook) before running `load.ts` against it.
import { writeFile } from "node:fs/promises";

import { config } from "dotenv";
config({ path: ".env" });

import { normalize } from "./normalizer";
import { elementToRecord, fetchKind, type OsmKind } from "./overpass";

const KINDS: OsmKind[] = ["tourist_place", "restaurant", "business"];
const OUTPUT_PATH = new URL("../../ingest-data/places.snapshot.json", import.meta.url);

async function main() {
  const seen = new Set<string>();
  const places: ReturnType<typeof normalize>[] = [];

  for (const kind of KINDS) {
    const elements = await fetchKind(kind);
    for (const el of elements) {
      const record = elementToRecord(el);
      // An element can match more than one selector (e.g. a way + an
      // overlapping relation) — keep the first normalization we see.
      if (seen.has(record.sourceId)) continue;
      seen.add(record.sourceId);
      places.push(normalize(record));
    }
  }

  await writeFile(OUTPUT_PATH, JSON.stringify(places, null, 2));
  console.log(`wrote ${places.length} places to ${OUTPUT_PATH.pathname}`);
}

main();
