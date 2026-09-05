CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "place" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source" text,
	"source_id" text,
	"name" text NOT NULL,
	"description" text,
	"kind" text DEFAULT 'tourist_place' NOT NULL,
	"category" text,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"department" text,
	"municipality" text,
	"lat" double precision,
	"lng" double precision,
	"address" text,
	"website" text,
	"opening_hours" text,
	"image_url" text,
	"visibility" text DEFAULT 'public' NOT NULL,
	"verified" boolean DEFAULT false,
	"quality_score" real DEFAULT 0,
	"embedding" vector(1024),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_kind_check" CHECK ("kind" in ('tourist_place', 'restaurant', 'business', 'hotel')),
	CONSTRAINT "place_visibility_check" CHECK ("visibility" in ('private', 'unlisted', 'public')),
	CONSTRAINT "place_quality_score_check" CHECK ("quality_score" between 0.0 and 1.0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "place_source_source_id_idx" ON "place" ("source","source_id");--> statement-breakpoint
CREATE INDEX "place_kind_idx" ON "place" ("kind");--> statement-breakpoint
CREATE INDEX "place_category_idx" ON "place" ("category");--> statement-breakpoint
CREATE INDEX "place_department_idx" ON "place" ("department");--> statement-breakpoint
CREATE INDEX "place_keywords_idx" ON "place" USING gin ("keywords");--> statement-breakpoint
CREATE INDEX "place_name_trgm_idx" ON "place" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "place_description_trgm_idx" ON "place" USING gin ("description" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "place_embedding_hnsw_idx" ON "place" USING hnsw ("embedding" vector_cosine_ops);