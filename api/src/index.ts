// External
import { swaggerUI } from "@hono/swagger-ui";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

// App
import type { Bindings } from "@/env";

// Features
import { placesRoutes } from "@/features/places/routes";
import { routeRoutes } from "@/features/route/routes";

// Infrastructure
import { auth } from "@/infrastructure/auth";
import { buildOpenAPIDocument } from "@/infrastructure/openapi";

// Middleware
import { requireApiKey } from "@/middleware/auth";
import { notFound, onError } from "@/middleware/errors";

const app = new OpenAPIHono<{ Bindings: Bindings }>();

app.notFound(notFound);
app.onError(onError);

// /api/auth/* issues session cookies (credentials: true) — CORS must pin
// this to the known frontend origin. Reflecting any origin here (or "*",
// which browsers reject outright alongside credentials) would let any site
// read back sign-in/session responses for a logged-in visitor.
app.use(
  "/api/auth/*",
  cors({
    origin: (_origin, c) => c.env.WEB_ORIGIN ?? c.env.API_ORIGIN,
    allowHeaders: ["Accept", "Content-Type", "X-API-Key", "Authorization"],
    credentials: true,
  }),
);

// /api/v1/* is authenticated by the X-API-Key header, not cookies, so
// there's no credentialed-request risk — it's a public API meant to be
// callable from any origin.
app.use("/api/v1/*", cors({ origin: "*", allowHeaders: ["Accept", "Content-Type", "X-API-Key"] }));
app.use(secureHeaders({ crossOriginResourcePolicy: "cross-origin" }));

const healthzRoute = createRoute({
  method: "get",
  path: "/healthz",
  tags: ["Health"],
  responses: {
    200: {
      description: "ok",
      content: {
        "application/json": { schema: z.object({ ok: z.boolean() }) },
      },
    },
  },
});

app.openapi(healthzRoute, (c) => c.json({ ok: true }));

// Docs - Swagger UI
app.get("/doc", async (c) => c.json(await buildOpenAPIDocument(app, c.env)));
app.get("/docs", swaggerUI({ url: "/doc" }));

// Better Auth routes
app.all("/api/auth/*", (c) => auth(c.env).handler(c.req.raw));

app.use("/api/v1/*", requireApiKey);

app.route("/api/v1/places", placesRoutes);
app.route("/api/v1/route", routeRoutes);

export default app;
