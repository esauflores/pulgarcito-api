# demo-web

Astro + React map UI for Pulgarcito. Renders pins, category filters, fuzzy/semantic search, and OSRM routing over the `api`'s data, dark by default.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Astro 7, Node adapter (`@astrojs/node`, standalone) |
| Interactive UI | React 19 (islands) |
| Map | Leaflet + `react-leaflet` |
| Styling | Tailwind CSS 4, dark theme by default (`class="dark"` on `<html>`) |
| Auth | better-auth client (`authClient`) + `apiKey` client plugin |
| Component registries | shadcn CLI configured (Radix base) — ready for `@kokonutui/*` / `@bklit/*`, nothing pulled in yet beyond the base `button` |

## Structure

```
src/
├── components/
│   ├── Nav.tsx              # Map / Dashboard / Sign in / Sign out — the only navigation
│   ├── PulgarcitoMap.tsx    # the map: places mode + route mode, client:only="react"
│   ├── SignInForm.tsx
│   └── DashboardContent.tsx # session info + API key CRUD
├── layouts/
│   └── Layout.astro         # single shared layout — dark html, Nav, full-height slot
├── lib/
│   ├── auth.ts              # better-auth client (browser-facing)
│   └── api-proxy.ts         # server-side fetch to the api, adds X-API-Key
├── pages/
│   ├── index.astro          # "/" — the map (this is the home page)
│   ├── sign-in.astro
│   ├── dashboard.astro
│   └── api/
│       ├── places.ts        # GET /api/places → proxies /api/v1/places or /search
│       └── route.ts         # GET /api/route → proxies /api/v1/route
└── env.d.ts
```

There's no separate landing page — `/` is the map directly, and `/sign-in` + `/dashboard` exist only to manage API keys.

## Environment

Copy `.env.example` to `.env`:

| Var | Where it's used | Notes |
| --- | --- | --- |
| `PUBLIC_API_URL` | Browser (`lib/auth.ts`) | Must be reachable from the user's browser, e.g. `http://localhost:3000`. `PUBLIC_` prefix = Astro inlines it into the client bundle at build time. |
| `PULGARCITO_API_KEY` | Server (`lib/api-proxy.ts`) | A real, verified user's API key. Never sent to the client. |
| `INTERNAL_API_URL` | Server (`lib/api-proxy.ts`), optional | Overrides `PUBLIC_API_URL` for the *server-side* proxy only, read via `process.env` at request time (not `import.meta.env`, which would bake it in at build time). Needed when the proxy's target differs from what the browser uses — e.g. Docker Compose sets this to `http://api:3000` (the Compose service name) while `PUBLIC_API_URL` stays `http://localhost:3000` for the browser. Leave unset for plain local dev, where they're the same. |

## Why a server-side proxy at all

`/api/v1/*` on the api requires an `X-API-Key` header. Shipping that key to the browser would expose it to every visitor. Instead, `pages/api/places.ts` and `pages/api/route.ts` run server-side, attach `PULGARCITO_API_KEY`, and forward the request — the browser only ever talks to same-origin `/api/places` and `/api/route`.

## The map (`PulgarcitoMap.tsx`)

Two modes, toggled in the sidebar:

- **Lugares** — category filter buttons + free-text search. Search caps `limit` at 50 (matching `/places/search`'s ranked-results cap); plain browsing caps at 100.
- **Ruta** — from/to lat,lng inputs, calls `/api/route`, draws the OSRM polyline plus distance/duration.

Category → color/icon/label lookup tables mirror the OSM tag → category mapping in the api's ingest normalizer, so a pin's color always matches its real category.

## Development

```bash
pnpm install
pnpm dev          # astro dev, http://localhost:4321
pnpm typecheck    # astro check (needs typescript ^5.9 — astro check's language server doesn't yet support TS 7's native compiler)
pnpm build && pnpm start   # production-style: node ./dist/server/entry.mjs
```

Requires the `api` running at `PUBLIC_API_URL`.

## Docker

```bash
docker build -t pulgarcito-demo-web .
docker run -p 4321:4321 --env-file .env pulgarcito-demo-web
```

Or via the root `docker-compose.yml`, which sets `INTERNAL_API_URL` for you.
