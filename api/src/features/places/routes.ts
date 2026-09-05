import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, asc, cosineDistance, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

import type { Bindings } from "@/env";

// Database
import { place } from "@/db/schema";

// Helpers
import { parseLatLng } from "@/helpers/coords";

// Infrastructure
import { embedText } from "@/infrastructure/ai/embedding";
import { db } from "@/infrastructure/db";

import { buildPlaceConditions, distanceKm } from "./filters";
import { reciprocalRankFusion } from "./rrf";

// Columns returned to clients — excludes `embedding` (large, internal-only).
const placeColumns = {
  id: place.id,
  source: place.source,
  sourceId: place.sourceId,
  name: place.name,
  description: place.description,
  kind: place.kind,
  category: place.category,
  keywords: place.keywords,
  department: place.department,
  municipality: place.municipality,
  lat: place.lat,
  lng: place.lng,
  address: place.address,
  website: place.website,
  openingHours: place.openingHours,
  imageUrl: place.imageUrl,
  verified: place.verified,
  qualityScore: place.qualityScore,
};

const PlaceSchema = z.object({
  id: z.string(),
  source: z.string().nullable(),
  sourceId: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  kind: z.string(),
  category: z.string().nullable(),
  keywords: z.array(z.string()),
  department: z.string().nullable(),
  municipality: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  address: z.string().nullable(),
  website: z.string().nullable(),
  openingHours: z.string().nullable(),
  imageUrl: z.string().nullable(),
  verified: z.boolean().nullable(),
  qualityScore: z.number().nullable(),
  distanceKm: z.number().nullish(),
});

const PlaceListSchema = z.object({
  results: z.array(PlaceSchema),
  total: z.number(),
  page: z.number(),
  perPage: z.number(),
});

const ErrorSchema = z.object({ error: z.string() });

const baseFilterQuery = {
  type: z.enum(["tourist_place", "restaurant", "business", "hotel"]).optional(),
  category: z.string().optional(),
  department: z.string().optional(),
  near: z.string().optional().openapi({ example: "13.49,-89.39", description: "'lat,lng'" }),
  radius_km: z.coerce.number().positive().optional(),
};

export const placesRoutes = new OpenAPIHono<{ Bindings: Bindings }>();

// ── GET / — paginated browse ────────────────────────────────────────────
const listRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Places"],
  request: {
    query: z.object({
      ...baseFilterQuery,
      limit: z.coerce.number().int().min(1).max(1000).default(20),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  },
  responses: {
    200: { description: "Paginated place list", content: { "application/json": { schema: PlaceListSchema } } },
    400: { description: "Invalid near", content: { "application/json": { schema: ErrorSchema } } },
  },
});

placesRoutes.openapi(listRoute, async (c) => {
  const { type, category, department, near, radius_km, limit, offset } = c.req.valid("query");
  const nearCoords = parseLatLng(near);
  if (near && !nearCoords) throw new HTTPException(400, { message: "near must be 'lat,lng'" });

  const conditions = buildPlaceConditions({
    type,
    category,
    department,
    near: nearCoords ?? undefined,
    radiusKm: radius_km,
  });

  const rows = await db(c.env)
    .select({
      ...placeColumns,
      distanceKm: nearCoords ? distanceKm(nearCoords.lat, nearCoords.lng) : sql<number | null>`null`,
      total: sql<number>`count(*) over ()::int`,
    })
    .from(place)
    .where(conditions)
    .orderBy(nearCoords ? asc(distanceKm(nearCoords.lat, nearCoords.lng)) : asc(place.name))
    .limit(limit)
    .offset(offset);

  const total = rows[0]?.total ?? 0;
  return c.json({
    results: rows.map(({ total: _total, distanceKm: d, ...rest }) => ({ ...rest, distanceKm: d ?? undefined })),
    total,
    page: Math.floor(offset / limit) + 1,
    perPage: limit,
  });
});

// ── GET /search — fuzzy + semantic hybrid (RRF-merged) ──────────────────
const SEARCH_LIMIT = 50;
const FUZZY_LIMIT = 50;
const SEMANTIC_THRESHOLD = 0.4; // cosine distance cap; RRF downweights weak hits anyway

const searchRoute = createRoute({
  method: "get",
  path: "/search",
  tags: ["Places"],
  request: {
    query: z.object({
      ...baseFilterQuery,
      q: z.string().min(1),
      limit: z.coerce.number().int().min(1).max(SEARCH_LIMIT).default(20),
    }),
  },
  responses: {
    200: { description: "Ranked search results", content: { "application/json": { schema: PlaceListSchema } } },
    400: { description: "Invalid near", content: { "application/json": { schema: ErrorSchema } } },
  },
});

placesRoutes.openapi(searchRoute, async (c) => {
  const { q, type, category, department, near, radius_km, limit } = c.req.valid("query");
  const nearCoords = parseLatLng(near);
  if (near && !nearCoords) throw new HTTPException(400, { message: "near must be 'lat,lng'" });

  const conditions = buildPlaceConditions({
    type,
    category,
    department,
    near: nearCoords ?? undefined,
    radiusKm: radius_km,
  });

  const pattern = `%${q}%`;
  const fuzzyLegPromise = db(c.env)
    .select(placeColumns)
    .from(place)
    .where(
      and(
        conditions,
        or(
          ilike(place.name, pattern),
          ilike(place.description, pattern),
          sql`array_to_string(${place.keywords}, ' ') ilike ${pattern}`,
        ),
      ),
    )
    .orderBy(asc(place.name))
    .limit(FUZZY_LIMIT);

  const semanticLegPromise = embedText(c.env, q).then((vector) =>
    db(c.env)
      .select(placeColumns)
      .from(place)
      .where(
        and(
          conditions,
          isNotNull(place.embedding),
          sql`${cosineDistance(place.embedding, vector)} < ${SEMANTIC_THRESHOLD}`,
        ),
      )
      .orderBy(asc(cosineDistance(place.embedding, vector)))
      .limit(FUZZY_LIMIT),
  );

  const [fuzzyLeg, semanticLeg] = await Promise.all([fuzzyLegPromise, semanticLegPromise]);
  const results = reciprocalRankFusion([fuzzyLeg, semanticLeg], limit);

  // Hybrid returns a single ranked page — nobody pages RRF-merged search results.
  return c.json({ results, total: results.length, page: 1, perPage: limit });
});

// ── GET /{id} ─────────────────────────────────────────────────────────
const getRoute = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["Places"],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: "A place", content: { "application/json": { schema: PlaceSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
  },
});

placesRoutes.openapi(getRoute, async (c) => {
  const { id } = c.req.valid("param");
  const [row] = await db(c.env)
    .select(placeColumns)
    .from(place)
    .where(and(eq(place.id, id), eq(place.visibility, "public"), eq(place.verified, true)))
    .limit(1);

  if (!row) throw new HTTPException(404, { message: `place ${id} not found` });
  return c.json(row);
});
