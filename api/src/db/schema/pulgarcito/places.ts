import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  uuid,
  doublePrecision,
  real,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  check,
  vector,
} from "drizzle-orm/pg-core";

// Places — tourism nodes. `kind` partitions the three top-level types
// (tourist_place | restaurant | business); `category` is the subtype.
export const place = pgTable(
  "place",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source"), // 'manual', 'osm-overpass', etc.
    sourceId: text("source_id"), // external id if any
    name: text("name").notNull(),
    description: text("description"),
    kind: text("kind").notNull().default("tourist_place"), // top-level node type
    category: text("category"), // subtype: 'beach','cafe','hostel',...
    keywords: text("keywords").array().notNull().default([]), // SEO/search terms
    department: text("department"), // 'La Libertad', 'Santa Ana',...
    municipality: text("municipality"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    address: text("address"),
    website: text("website"),
    openingHours: text("opening_hours"), // free-text or OSM format
    imageUrl: text("image_url"),
    visibility: text("visibility").notNull().default("public"),
    verified: boolean("verified").default(false),
    qualityScore: real("quality_score").default(0.0),
    embedding: vector("embedding", { dimensions: 1024 }), // Mistral mistral-embed
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Dedup key for re-ingest: one row per (source, external id).
    uniqueIndex("place_source_source_id_idx").on(table.source, table.sourceId),
    index("place_kind_idx").on(table.kind),
    index("place_category_idx").on(table.category),
    index("place_department_idx").on(table.department),
    index("place_keywords_idx").using("gin", table.keywords),
    // Trigram indexes power ?q= fuzzy text search on name/description.
    index("place_name_trgm_idx").using("gin", table.name.op("gin_trgm_ops")),
    index("place_description_trgm_idx").using("gin", table.description.op("gin_trgm_ops")),
    // HNSW on embedding powers ?q= hybrid semantic search (cosine distance).
    index("place_embedding_hnsw_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
    check("place_kind_check", sql`${table.kind} in ('tourist_place', 'restaurant', 'business', 'hotel')`),
    check("place_visibility_check", sql`${table.visibility} in ('private', 'unlisted', 'public')`),
    check("place_quality_score_check", sql`${table.qualityScore} between 0.0 and 1.0`),
  ],
);

export type Place = typeof place.$inferSelect;
export type NewPlace = typeof place.$inferInsert;
