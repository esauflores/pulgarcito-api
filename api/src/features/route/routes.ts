import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";

import type { Bindings } from "@/env";
import { parseLatLng } from "@/helpers/coords";

const OSRM_BASE_URL = "https://router.project-osrm.org";
const OSRM_TIMEOUT_MS = 8000;

const RouteResponseSchema = z.object({
  distance: z.number(),
  duration: z.number(),
  geometry: z.object({
    type: z.string(),
    coordinates: z.array(z.tuple([z.number(), z.number()])),
  }),
});

const ErrorSchema = z.object({ error: z.string() });

export const routeRoutes = new OpenAPIHono<{ Bindings: Bindings }>();

const routeRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Route"],
  request: {
    query: z.object({
      from: z.string().openapi({ example: "13.4861,-89.3164", description: "'lat,lng'" }),
      to: z.string().openapi({ example: "13.6929,-89.2182", description: "'lat,lng'" }),
      profile: z.enum(["car", "foot", "bike"]).default("car"),
    }),
  },
  responses: {
    200: {
      description: "Route geometry + distance/duration",
      content: { "application/json": { schema: RouteResponseSchema } },
    },
    400: { description: "Invalid from/to", content: { "application/json": { schema: ErrorSchema } } },
    502: { description: "Routing backend unavailable", content: { "application/json": { schema: ErrorSchema } } },
  },
});

routeRoutes.openapi(routeRoute, async (c) => {
  const { from, to, profile } = c.req.valid("query");
  const fromCoords = parseLatLng(from);
  const toCoords = parseLatLng(to);
  if (!fromCoords || !toCoords) throw new HTTPException(400, { message: "from/to must be 'lat,lng'" });

  const osrmUrl =
    `${OSRM_BASE_URL}/route/v1/${profile}/` +
    `${fromCoords.lng},${fromCoords.lat};${toCoords.lng},${toCoords.lat}` +
    `?overview=full&geometries=geojson`;

  let osrmRes: Response;
  try {
    osrmRes = await fetch(osrmUrl, { signal: AbortSignal.timeout(OSRM_TIMEOUT_MS) });
  } catch (err) {
    throw new HTTPException(502, {
      message: `OSRM unreachable: ${err instanceof Error ? err.message : "unknown error"}`,
    });
  }
  if (!osrmRes.ok) throw new HTTPException(502, { message: `OSRM ${osrmRes.status}` });

  const data = (await osrmRes.json()) as {
    code: string;
    routes?: { distance: number; duration: number; geometry: { type: string; coordinates: [number, number][] } }[];
  };
  if (data.code !== "Ok" || !data.routes?.length) throw new HTTPException(502, { message: `OSRM code: ${data.code}` });

  const [route] = data.routes;
  return c.json({ distance: route!.distance, duration: route!.duration, geometry: route!.geometry });
});
