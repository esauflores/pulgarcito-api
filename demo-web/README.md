# demo-web

Astro + React map UI for Pulgarcito. Renders pins, category filters, fuzzy/semantic search, and OSRM routing over the `api`'s data, dark by default.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Astro 7, Cloudflare adapter (`@astrojs/cloudflare`) — runs as a Cloudflare Worker |
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
│   │                        # (client:only — SSR crashes under the Cloudflare dev runtime,
│   │                        # see "Deploy" below)
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

Copy `.env.example` to `.env` and `.dev.vars.example` to `.dev.vars`:

| Var | Where it's used | Notes |
| --- | --- | --- |
| `PUBLIC_API_URL` | Browser (`lib/auth.ts`, `.env`) | The api's URL, reachable from the user's browser (e.g. `http://localhost:3000`, or the api's real `workers.dev` URL in production). `PUBLIC_` prefix = Astro inlines it into the client bundle at build time. Only used for direct browser calls — sign-in/sign-up/session/API-key management — not for `/api/places` or `/api/route`, which go through the server-side proxy instead (see below). |
| `PULGARCITO_API_KEY` | Server (`lib/api-proxy.ts`, `.dev.vars`) | A real, verified user's API key. Never sent to the client. Read via `cloudflare:workers`'s `env`, not `import.meta.env` — see "Deploy" below. |

## Why a server-side proxy at all

`/api/v1/*` on the api requires an `X-API-Key` header. Shipping that key to the browser would expose it to every visitor. Instead, `pages/api/places.ts` and `pages/api/route.ts` run server-side, attach `PULGARCITO_API_KEY`, and forward the request — the browser only ever talks to same-origin `/api/places` and `/api/route`.

The proxy itself doesn't `fetch()` the api's public URL — it calls it through a Cloudflare [service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) (`env.API` in `lib/api-proxy.ts`, declared in `wrangler.jsonc`). Two Workers on the same `*.workers.dev` zone can't `fetch()` each other over the public network — Cloudflare blocks it as a same-zone loop (`error 1042`) — and a binding is also faster, since it skips the network round-trip entirely.

## The map (`PulgarcitoMap.tsx`)

Two modes, toggled in the sidebar:

- **Lugares** — category filter buttons + free-text search. Search caps `limit` at 50 (matching `/places/search`'s ranked-results cap); plain browsing caps at 100.
- **Ruta** — from/to lat,lng inputs, calls `/api/route`, draws the OSRM polyline plus distance/duration.

Category → color/icon/label lookup tables mirror the OSM tag → category mapping in the api's ingest normalizer, so a pin's color always matches its real category.

## Local dev

This branch (`cloudflare`) is deploy-only — it isn't meant to be run interactively. For local development, use the `master` branch, which has this same app on `@astrojs/node` with a plain Node dev server (`pnpm dev`) and no Cloudflare-specific setup.

## Deploy (Cloudflare Workers)

```bash
pnpm dlx wrangler login                     # once, if not already authenticated
pnpm dlx wrangler secret bulk .dev.vars     # pushes PULGARCITO_API_KEY
PUBLIC_API_URL=<api's real URL> pnpm deploy # builds with the real URL baked in, then wrangler deploy
```

`wrangler.jsonc` declares the service binding to `api` (`{ "binding": "API", "service": "pulgarcito-api" }`) — the api Worker must already be deployed under that exact name for this to resolve. `PUBLIC_API_URL` has to be passed at build time (not just set in `.dev.vars`/secrets) since it's inlined into the client bundle via `import.meta.env`, not read at request time.

One SSR bug specific to this deploy target: `Nav.tsx` calls `useSession()`, which crashed with `Invalid hook call` when server-rendered under the Cloudflare Vite plugin's dev runtime (a duplicate-React issue in that specific dev-mode SSR path — it never affected the production build). Fixed by hydrating it `client:only="react"` in `Layout.astro`, matching how `PulgarcitoMap` was already handled.
