import { describe, expect, it } from "vitest";

import { lookupAdmin } from "./geo";

describe("lookupAdmin", () => {
  it("resolves San Salvador city center to its department and municipality", () => {
    const result = lookupAdmin(13.6929, -89.2182);
    expect(result).toEqual({ department: "San Salvador", municipality: "San Salvador" });
  });

  it("resolves a point in a different department correctly", () => {
    // Santa Ana city center
    const result = lookupAdmin(13.9946, -89.5597);
    expect(result?.department).toBe("Santa Ana");
  });

  it("returns null for a point far outside El Salvador", () => {
    expect(lookupAdmin(0, 0)).toBeNull();
  });
});
