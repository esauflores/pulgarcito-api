import { describe, expect, it } from "vitest";

import { parseLatLng } from "./coords";

describe("parseLatLng", () => {
  it("returns null when absent", () => {
    expect(parseLatLng(undefined)).toBeNull();
  });

  it("parses 'lat,lng'", () => {
    expect(parseLatLng("13.49,-89.39")).toEqual({ lat: 13.49, lng: -89.39 });
  });

  it("trims whitespace around each part", () => {
    expect(parseLatLng(" 13.49 , -89.39 ")).toEqual({ lat: 13.49, lng: -89.39 });
  });

  it("returns null when not exactly two parts", () => {
    expect(parseLatLng("13.49")).toBeNull();
    expect(parseLatLng("13.49,-89.39,1")).toBeNull();
  });

  it("returns null when a part isn't numeric", () => {
    expect(parseLatLng("abc,-89.39")).toBeNull();
  });
});
