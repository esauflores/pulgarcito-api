// Backfills `place.embedding` for public places that don't have one yet.
// Separate from load.ts so re-ingest (cheap, frequent) doesn't force a
// Mistral call (rate-limited, costs money) for every row on every run.
import { config } from "dotenv";
config({ path: ".env" });

import { and, eq, isNull } from "drizzle-orm";

import { place } from "@/db/schema";
import { bindings } from "@/env";
import { withRetry } from "@/helpers/retry";
import { embedTexts } from "@/infrastructure/ai/embedding";
import { db } from "@/infrastructure/db";

const BATCH_SIZE = 100;

function embedInput(name: string, description: string | null): string {
  return description ? `${name} — ${description}` : name;
}

async function main() {
  const conn = db(bindings());
  const rows = await conn
    .select({ id: place.id, name: place.name, description: place.description })
    .from(place)
    .where(and(eq(place.visibility, "public"), isNull(place.embedding)));

  if (rows.length === 0) {
    console.log("no places need embedding");
    return;
  }

  console.log(`embedding ${rows.length} places (batch=${BATCH_SIZE})`);
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const vectors = await withRetry(() =>
      embedTexts(
        bindings(),
        batch.map((r) => embedInput(r.name, r.description)),
      ),
    );
    await withRetry(() =>
      Promise.all(
        batch.map((row, idx) => conn.update(place).set({ embedding: vectors[idx] }).where(eq(place.id, row.id))),
      ),
    );
    written += batch.length;
    console.log(`  ${written}/${rows.length}`);
  }
  console.log(`✓ embedded ${written} places`);
}

main();
