import { beforeAll, beforeEach, describe, expect, it } from "vitest";

// App
import { testBindings } from "@/env";

// Database
import { place } from "@/db/schema";
import { db } from "@/infrastructure/db";

// Test Utilities
import { resetDatabase, truncateAllTables } from "@/helpers/test/pglite";

import { placesRoutes } from "./routes";

beforeAll(async () => {
  await resetDatabase();
});

const seedPlace = async (overrides: Partial<typeof place.$inferInsert> = {}) => {
  const [row] = await db(testBindings)
    .insert(place)
    .values({
      name: "El Tunco",
      kind: "tourist_place",
      category: "beach",
      department: "La Libertad",
      lat: 13.49,
      lng: -89.39,
      visibility: "public",
      verified: true,
      ...overrides,
    })
    .returning();
  return row!;
};

describe("GET /", () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  it("returns only public + verified places", async () => {
    await seedPlace({ name: "Visible" });
    await seedPlace({ name: "Hidden (private)", visibility: "private" });
    await seedPlace({ name: "Hidden (unverified)", verified: false });

    const res = await placesRoutes.request("/", {}, testBindings);
    const body = await res.json();

    expect(body.results).toHaveLength(1);
    expect(body.results[0].name).toBe("Visible");
    expect(body.total).toBe(1);
  });

  it("filters by department", async () => {
    await seedPlace({ name: "A", department: "La Libertad" });
    await seedPlace({ name: "B", department: "San Salvador" });

    const res = await placesRoutes.request("/?department=San+Salvador", {}, testBindings);
    const body = await res.json();

    expect(body.results.map((r: { name: string }) => r.name)).toEqual(["B"]);
  });

  it("orders by distance and includes distanceKm when ?near is set", async () => {
    await seedPlace({ name: "Close", lat: 13.49, lng: -89.39 });
    await seedPlace({ name: "Far", lat: 14.5, lng: -87.7 });

    // radius_km wide enough to include both — the default (25km) would exclude "Far"
    // on its own, which is covered by the radius_km test below.
    const res = await placesRoutes.request("/?near=13.49,-89.39&radius_km=500", {}, testBindings);
    const body = await res.json();

    expect(body.results.map((r: { name: string }) => r.name)).toEqual(["Close", "Far"]);
    expect(body.results[0].distanceKm).toBeCloseTo(0, 1);
  });

  it("excludes places outside radius_km", async () => {
    await seedPlace({ name: "Close", lat: 13.49, lng: -89.39 });
    await seedPlace({ name: "Far", lat: 14.5, lng: -87.7 });

    const res = await placesRoutes.request("/?near=13.49,-89.39&radius_km=5", {}, testBindings);
    const body = await res.json();

    expect(body.results.map((r: { name: string }) => r.name)).toEqual(["Close"]);
  });

  it("400s on an invalid near parameter", async () => {
    const res = await placesRoutes.request("/?near=not-a-coord", {}, testBindings);
    expect(res.status).toBe(400);
  });
});

describe("GET /{id}", () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  it("returns a public verified place", async () => {
    const row = await seedPlace();
    const res = await placesRoutes.request(`/${row.id}`, {}, testBindings);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(row.id);
  });

  it("404s for a private place", async () => {
    const row = await seedPlace({ visibility: "private" });
    const res = await placesRoutes.request(`/${row.id}`, {}, testBindings);
    expect(res.status).toBe(404);
  });

  it("404s for an unknown id", async () => {
    const res = await placesRoutes.request(`/00000000-0000-0000-0000-000000000000`, {}, testBindings);
    expect(res.status).toBe(404);
  });
});
