import { describe, expect, it } from "vitest";

import { testBindings } from "@/env";

import { routeRoutes } from "./routes";

describe("GET /", () => {
  it("400s when from is not 'lat,lng'", async () => {
    const res = await routeRoutes.request("/?from=nope&to=13.69,-89.21", {}, testBindings);
    expect(res.status).toBe(400);
  });

  it("400s when to is not 'lat,lng'", async () => {
    const res = await routeRoutes.request("/?from=13.48,-89.31&to=nope", {}, testBindings);
    expect(res.status).toBe(400);
  });
});
