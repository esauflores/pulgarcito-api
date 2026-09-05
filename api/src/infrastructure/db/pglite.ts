// External
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { drizzle } from "drizzle-orm/pglite";

// App
import type { Bindings } from "@/env";

const client = new PGlite({ extensions: { pgcrypto, pg_trgm, vector } });
export const db = (_env: Bindings) => drizzle({ client });
