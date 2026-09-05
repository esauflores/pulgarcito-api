# api

Hono + Drizzle + Neon Postgres API for Pulgarcito — places, search, and routing over El Salvador tourism data ingested from OpenStreetMap.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Hono (`OpenAPIHono`) on Node (`@hono/node-server`) |
| Database | Neon Postgres (`drizzle-orm/neon-http`) + `pgvector` |
| ORM | Drizzle ORM / Drizzle Kit |
| Auth | better-auth (email/password + API keys) |
| Search embeddings | Mistral (`mistral-embed`, 1024-dim) via Vercel AI SDK |
| Geo | `@turf/boolean-point-in-polygon` (department/municipality derivation) |
| Testing | Vitest + PGlite (`pgvector` extension via `@electric-sql/pglite-pgvector`) |

## Structure

```
src/
├── db/schema/          # Drizzle table definitions (auth/*, pulgarcito/places.ts)
├── features/
│   ├── places/          # GET /, /search, /{id} — routes + query filters + RRF merge
│   └── route/            # GET / — OSRM proxy
├── ingest/              # OSM Overpass → normalize → upsert → embed (see below)
├── infrastructure/
│   ├── ai/               # Mistral embedding calls
│   ├── auth/             # better-auth config
│   └── db/                # neon.ts (prod) / pglite.ts (tests)
├── middleware/          # requireApiKey, error handling
├── helpers/             # coords.ts (lat,lng parsing), retry.ts (backoff), test/*
├── env.ts               # Bindings type — source of truth for env vars
├── index.ts             # app composition (tested via app.request, never listens)
└── server.ts            # process entry — loads .env, listens on PORT
```

`@/` maps to `src/` (tsconfig + Vitest + `alias-hook.mjs` for `tsx`).

## Environment

See `src/env.ts` for the full `Bindings` type. Copy `.env.example` to `.env`:

| Var | Notes |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string. Needs `pgvector` available (`CREATE EXTENSION vector`). |
| `DB_PROVIDER` | `neon` (default) or `pglite` — set to `pglite` in `.env.test`. |
| `BETTER_AUTH_SECRET` | 32+ char random secret. |
| `AUTH_PROVIDER` | `better-auth` (only option currently; kept as a switch for consistency with `DB_PROVIDER`). |
| `MISTRAL_API_KEY` | Used for embeddings (`/places/search` and `ingest:embed`). |
| `API_ORIGIN` / `WEB_ORIGIN` | Used for better-auth's `baseURL` and CORS. |
| `PORT` | HTTP port, default `3000`. |
| `LOG_LEVEL` | `info` / `warn` / `error` / `silent`. |

There is no email provider — sign-up doesn't send a verification email, and API access only requires a valid API key (see Auth below).

## Routes

`/api/v1/*` requires an `X-API-Key` header (from a signed-up better-auth user's key). Everything else is open.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/healthz` | `{ ok: true }` |
| `GET` | `/doc` | OpenAPI JSON (app routes + better-auth's, merged in `infrastructure/openapi.ts`) |
| `GET` | `/docs` | Swagger UI |
| `ALL` | `/api/auth/*` | better-auth — sign-up, sign-in, session, API key CRUD |
| `GET` | `/api/v1/places` | Browse. `type`, `category`, `department`, `near=lat,lng`, `radius_km` (default 25), `limit` (≤1000), `offset` |
| `GET` | `/api/v1/places/search` | Requires `q`. Fuzzy (`ILIKE`) + semantic (`pgvector` cosine) legs merged via Reciprocal Rank Fusion. Same filters as browse; `limit` capped at 50 |
| `GET` | `/api/v1/places/{id}` | 404 unless `visibility='public' AND verified=true` |
| `GET` | `/api/v1/route` | Proxies the public OSRM server. `from`, `to` (`lat,lng`), `profile` (`car`\|`foot`\|`bike`) |

## Auth

`middleware/auth.ts`'s `requireApiKey` calls better-auth's `verifyApiKey` and lets the request through if the key is valid — that's the whole check. There used to be an additional "email verified" gate, but it required a real transactional-email provider to ever pass, so it's gone; a valid API key is sufficient.

## Ingest pipeline

Nothing in `server.ts` or the Dockerfile calls these — deploying the API does not populate or refresh data. They're three manual commands you run yourself, against whatever `DATABASE_URL`/`MISTRAL_API_KEY` are in scope, each independently re-runnable:

```bash
pnpm ingest:fetch   # OSM Overpass → normalize → write ingest-data/places.snapshot.json (no DB)
pnpm ingest:load    # read the snapshot → upsert into `place`, keyed on (source, source_id)
pnpm ingest:embed   # backfill `embedding` for public places that don't have one yet
```

- `overpass.ts` queries three node kinds (`tourist_place`, `restaurant`, `business`) over all of El Salvador, with retry/backoff on 429/504.
- `normalizer.ts` maps OSM tags → the `place` schema (category lookup table, kind classification, website-only contact extraction — no phone/email/social, deliberately).
- `geo.ts` derives `department`/`municipality` from `lat`/`lng` via a point-in-polygon lookup against GADM admin-2 boundaries (`src/ingest/data/el_salvador_municipalities.geojson`) — OSM has no admin-department tag, and its `addr:city` coverage alone is only ~20%.
- `load.ts` upserts in batches of 500; re-ingesting refreshes OSM/derived fields but leaves `visibility`/`verified`/`qualityScore` alone (those may be hand-adjusted moderation decisions).
- Every DB write and Overpass/Mistral call goes through `helpers/retry.ts` (`withRetry` — exponential backoff, same pattern everywhere).

## Database

Schema lives in `src/db/schema/pulgarcito/places.ts` (single `place` table — 22 columns, GIN indexes on `keywords` and trigram-indexed `name`/`description`, HNSW on `embedding`). Drizzle Kit manages migrations:

```bash
pnpm db:generate   # after changing schema
pnpm db:migrate    # apply to DATABASE_URL
pnpm db:studio     # browse the DB
```

Migrations aren't self-contained — `CREATE EXTENSION pgcrypto/vector/pg_trgm` is hand-added to the first migration since Drizzle Kit doesn't manage extensions.

## Testing

```bash
pnpm test
```

49 tests. `DB_PROVIDER=pglite` in `.env.test` runs the same Drizzle code against an in-memory Postgres (PGlite) with `pgcrypto`/`pg_trgm`/`vector` extensions registered — real migrations, real queries, no mocks. `helpers/test/better-auth.ts` does real signups against better-auth, not fixtures.

## Docker

```bash
docker build -t pulgarcito-api .
docker run -p 3000:3000 --env-file .env pulgarcito-api
```

Or via the root `docker-compose.yml`, which also wires `demo-web`.
