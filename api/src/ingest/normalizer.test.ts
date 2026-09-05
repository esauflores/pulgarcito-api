import { describe, expect, it } from "vitest";

import { extractAddress, extractWebsite, normalize, pickCategory, pickKind, seedKeywords } from "./normalizer";
import type { OsmRecord } from "./overpass";

function record(raw: OsmRecord["raw"]): OsmRecord {
  return { source: "osm-overpass", sourceId: `osm:${raw.type}:${raw.id}`, fetchedAt: "2026-01-01T00:00:00.000Z", raw };
}

describe("pickCategory / pickKind", () => {
  it("maps museum -> tourist_place", () => {
    const category = pickCategory({ tourism: "museum" });
    expect(category).toBe("museum");
    expect(pickKind(category)).toBe("tourist_place");
  });

  it("maps tourism=hotel -> kind=hotel", () => {
    const category = pickCategory({ tourism: "hotel" });
    expect(pickKind(category)).toBe("hotel");
  });

  it("falls back to 'other' for unmapped tags", () => {
    expect(pickCategory({ foo: "bar" })).toBe("other");
  });
});

describe("seedKeywords", () => {
  it("captures brand/operator as keywords, deduped and lowercased", () => {
    const kws = seedKeywords({ brand: "Aloft", operator: "Marriott" }, "hotel");
    expect(kws).toContain("aloft");
    expect(kws).toContain("marriott");
  });

  it("flags surf for beach/surfing tags", () => {
    expect(seedKeywords({ natural: "beach" }, "beach")).toContain("surf");
    expect(seedKeywords({ sport: "surfing" }, "attraction")).toContain("surf");
  });
});

describe("extractWebsite", () => {
  it("returns only the website — phone/email/social are dropped", () => {
    const website = extractWebsite({ phone: "+503 2222 3333", email: "x@example.com", website: "https://x.example" });
    expect(website).toBe("https://x.example");
  });

  it("returns undefined when no website tag is present", () => {
    expect(extractWebsite({ phone: "+503 2222 3333" })).toBeUndefined();
  });
});

describe("extractAddress", () => {
  it("joins housenumber + street + city", () => {
    expect(
      extractAddress({ "addr:housenumber": "12", "addr:street": "Calle 2 Norte", "addr:city": "San Salvador" }),
    ).toBe("12 Calle 2 Norte, San Salvador");
  });

  it("returns undefined with no addr:* tags", () => {
    expect(extractAddress({})).toBeUndefined();
  });
});

describe("normalize", () => {
  it("normalizes a node into a place row", () => {
    const place = normalize(
      record({ type: "node", id: 1, lat: 13.49, lon: -89.39, tags: { name: "El Tunco", natural: "beach" } }),
    );
    expect(place.name).toBe("El Tunco");
    expect(place.category).toBe("beach");
    expect(place.kind).toBe("tourist_place");
    expect(place.lat).toBe(13.49);
    expect(place.lng).toBe(-89.39);
    expect(place.verified).toBe(true);
    expect(place.visibility).toBe("public");
  });

  it("falls back to a placeholder name when OSM has none", () => {
    const place = normalize(record({ type: "node", id: 2, lat: 13.49, lon: -89.39, tags: {} }));
    expect(place.name).toBe("Unnamed 2");
  });

  it("reads lat/lng from center for a way", () => {
    const place = normalize(
      record({ type: "way", id: 3, center: { lat: 13.5, lon: -89.4 }, tags: { name: "X", tourism: "hotel" } }),
    );
    expect(place.lat).toBe(13.5);
    expect(place.lng).toBe(-89.4);
    expect(place.kind).toBe("hotel");
  });

  it("derives department/municipality from coordinates, not just addr:city", () => {
    const place = normalize(
      record({ type: "node", id: 4, lat: 13.6929, lon: -89.2182, tags: { name: "Plaza Cívica" } }),
    );
    expect(place.department).toBe("San Salvador");
    expect(place.municipality).toBe("San Salvador");
  });

  it("falls back to addr:city when the point is outside every polygon", () => {
    const place = normalize(record({ type: "node", id: 5, lat: 0, lon: 0, tags: { "addr:city": "Somewhere" } }));
    expect(place.department).toBeUndefined();
    expect(place.municipality).toBe("Somewhere");
  });
});
