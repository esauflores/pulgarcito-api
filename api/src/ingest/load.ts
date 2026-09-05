// Reads the snapshot written by fetch.ts and upserts it into `place`,
// keyed on (source, source_id). Re-ingesting only refreshes OSM/derived
// fields — visibility/verified/qualityScore are left alone since they may
// have been adjusted by hand after the first ingest.
import { readFile } from "node:fs/promises";

import { config } from "dotenv";
config({ path: ".env" });

import { sql } from "drizzle-orm";

import { place, type NewPlace } from "@/db/schema";
import { bindings } from "@/env";
import { withRetry } from "@/helpers/retry";
import { db } from "@/infrastructure/db";

const INPUT_PATH = new URL("../../ingest-data/places.snapshot.json", import.meta.url);
const BATCH_SIZE = 500;

type IngestRow = Omit<NewPlace, "id" | "createdAt" | "updatedAt">;

async function main() {
  const raw = await readFile(INPUT_PATH, "utf-8");
  const rows: IngestRow[] = JSON.parse(raw);
  if (rows.length === 0) {
    console.log("no rows to load");
    return;
  }

  const conn = db(bindings());
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await withRetry(async () => {
      await conn
        .insert(place)
        .values(batch)
        .onConflictDoUpdate({
          target: [place.source, place.sourceId],
          set: {
            name: sql`excluded.name`,
            description: sql`excluded.description`,
            kind: sql`excluded.kind`,
            category: sql`excluded.category`,
            keywords: sql`excluded.keywords`,
            department: sql`excluded.department`,
            municipality: sql`excluded.municipality`,
            lat: sql`excluded.lat`,
            lng: sql`excluded.lng`,
            address: sql`excluded.address`,
            website: sql`excluded.website`,
            openingHours: sql`excluded.opening_hours`,
            imageUrl: sql`excluded.image_url`,
            updatedAt: sql`now()`,
          },
        });
    });
    written += batch.length;
    console.log(`upserted ${written}/${rows.length}`);
  }
}

main();
