// External
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";

// App
import { testBindings } from "@/env";

// Infrastructure
import { db } from "@/infrastructure/db/pglite";

export const resetDatabase = async () => {
  await db(testBindings).execute(sql`DROP SCHEMA public CASCADE`);
  await db(testBindings).execute(sql`CREATE SCHEMA public`);

  await migrate(db(testBindings), {
    migrationsFolder: "./drizzle",
    migrationsSchema: "public",
  });
};

// Cheaper per-test isolation than resetDatabase(): clears rows without
// replaying every migration. Run resetDatabase() once (beforeAll) to create
// the schema, then this in beforeEach.
export const truncateAllTables = async () => {
  const conn = db(testBindings);
  const { rows } = await conn.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  if (rows.length === 0) return;

  const tables = sql.join(
    rows.map((r) => sql.identifier(r.tablename)),
    sql.raw(", "),
  );
  await conn.execute(sql`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
};
