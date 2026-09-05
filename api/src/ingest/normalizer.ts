// OSM -> place row normalizer. Maps OSM tags to our `place` schema
// (kind, category, website, address). One source (OSM) = one mapping table;
// revisit if a second source is ever added.
import type { NewPlace } from "@/db/schema";

import { lookupAdmin } from "./geo";
import type { OsmElement, OsmRecord } from "./overpass";

// OSM tag -> Pulgarcito category. First match wins.
const OSM_TO_CATEGORY: [[string, string], string][] = [
  [["tourism", "museum"], "museum"],
  [["tourism", "gallery"], "art_gallery"],
  [["tourism", "artwork"], "monument"],
  [["tourism", "viewpoint"], "viewpoint"],
  [["tourism", "zoo"], "zoo"],
  [["tourism", "attraction"], "attraction"],
  [["tourism", "hotel"], "hotel"],
  [["tourism", "hostel"], "hostel"],
  [["tourism", "guest_house"], "guesthouse"],
  [["tourism", "motel"], "hotel"],
  [["tourism", "resort"], "resort"],
  [["tourism", "camp_site"], "camping"],
  [["place", "city"], "city"],
  [["place", "town"], "town"],
  [["place", "village"], "village"],
  [["place", "hamlet"], "village"],
  [["place", "suburb"], "neighborhood"],
  [["place", "neighbourhood"], "neighborhood"],
  [["place", "locality"], "locality"],
  [["amenity", "restaurant"], "restaurant"],
  [["amenity", "cafe"], "cafe"],
  [["amenity", "bar"], "bar"],
  [["amenity", "pub"], "bar"],
  [["amenity", "fast_food"], "fast_food"],
  [["amenity", "food_court"], "food_market"],
  [["amenity", "bakery"], "bakery"],
  [["amenity", "ice_cream"], "cafe"],
  [["shop", "craft"], "craft_shop"],
  [["shop", "souvenir"], "souvenir_shop"],
  [["shop", "art"], "art_market"],
  [["shop", "mall"], "mall"],
  [["shop", "supermarket"], "market"],
  [["shop", "convenience"], "market"],
  [["historic", "archaeological_site"], "archaeological_site"],
  [["historic", "ruins"], "archaeological_site"],
  [["historic", "monument"], "monument"],
  [["historic", "memorial"], "monument"],
  [["historic", "building"], "historic_building"],
  [["historic", "church"], "church"],
  [["historic", "cathedral"], "church"],
  [["natural", "beach"], "beach"],
  [["natural", "waterfall"], "waterfall"],
  [["natural", "volcano"], "volcano"],
  [["natural", "peak"], "viewpoint"],
  [["natural", "spring"], "natural_park"],
  [["natural", "cave_entrance"], "cave"],
  [["leisure", "park"], "park"],
  [["leisure", "garden"], "garden"],
  [["leisure", "nature_reserve"], "natural_park"],
  [["amenity", "bank"], "atm"],
  [["amenity", "atm"], "atm"],
  [["amenity", "hospital"], "hospital"],
  [["amenity", "clinic"], "hospital"],
  [["amenity", "pharmacy"], "hospital"],
  [["amenity", "parking"], "parking"],
  [["amenity", "bus_station"], "bus_station"],
  [["amenity", "ferry_terminal"], "ferry_terminal"],
  [["office", "travel_agent"], "travel_agency"],
  [["office", "coworking"], "coworking_space"],
  [["tourism", "information"], "info_office"],
];

const HOTEL_CATEGORIES = new Set(["hotel", "hostel", "guesthouse", "resort", "camping"]);
const RESTAURANT_CATEGORIES = new Set(["restaurant", "cafe", "bar", "fast_food", "bakery", "food_market"]);
const BUSINESS_CATEGORIES = new Set([
  "craft_shop",
  "souvenir_shop",
  "art_market",
  "mall",
  "market",
  "atm",
  "hospital",
  "parking",
  "bus_station",
  "ferry_terminal",
  "travel_agency",
  "coworking_space",
  "info_office",
]);

export function pickKind(category: string): NewPlace["kind"] {
  if (HOTEL_CATEGORIES.has(category)) return "hotel";
  if (RESTAURANT_CATEGORIES.has(category)) return "restaurant";
  if (BUSINESS_CATEGORIES.has(category)) return "business";
  return "tourist_place";
}

export function pickCategory(tags: Record<string, string>): string {
  for (const [[key, value], category] of OSM_TO_CATEGORY) {
    if (tags[key] === value) return category;
  }
  return "other";
}

const WEBSITE_TAGS = ["website", "contact:website", "url", "contact:url"];

// website only — phone/email/socials can carry personal data of named
// individuals (sole proprietors, on-site owners) across privacy regimes.
export function extractWebsite(tags: Record<string, string>): string | undefined {
  for (const key of WEBSITE_TAGS) {
    if (tags[key]) return tags[key];
  }
  return undefined;
}

// Auto-seed SEO/search keywords from useful OSM tags. Deduped, lowercased,
// short list.
export function seedKeywords(tags: Record<string, string>, category: string): string[] {
  const kws: string[] = [category];
  for (const key of ["brand", "operator", "cuisine"]) {
    const value = tags[key];
    if (value) kws.push(...value.split(";").map((v) => v.trim()));
  }
  if (tags.sport === "surfing" || tags.natural === "beach") {
    kws.push("surf", "playa");
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of kws) {
    const kw = raw.trim().toLowerCase();
    if (kw && !seen.has(kw)) {
      seen.add(kw);
      out.push(kw);
    }
  }
  return out.slice(0, 12);
}

export function extractLatLng(el: OsmElement): { lat: number | null; lng: number | null } {
  if (el.type === "node") return { lat: el.lat ?? null, lng: el.lon ?? null };
  return { lat: el.center?.lat ?? null, lng: el.center?.lon ?? null };
}

// Builds a one-line address from addr:* tags. OSM in El Salvador populates
// addr:street + addr:city most; housenumber is rare.
export function extractAddress(tags: Record<string, string>): string | undefined {
  const line: string[] = [];
  if (tags["addr:housenumber"]) line.push(tags["addr:housenumber"]);
  const street = tags["addr:street"] || tags["addr:place"] || tags["addr:hamlet"];
  if (street) line.push(street);
  const parts = [line.join(" "), tags["addr:city"]].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

export function normalize(record: OsmRecord): Omit<NewPlace, "id" | "createdAt" | "updatedAt"> {
  const tags = record.raw.tags ?? {};
  const category = pickCategory(tags);
  const { lat, lng } = extractLatLng(record.raw);
  // OSM has no admin-department tag and addr:city coverage is sparse — derive
  // both from a point-in-polygon lookup against real boundaries when we have
  // coordinates; fall back to addr:city for the rare point outside every polygon.
  const admin = lat !== null && lng !== null ? lookupAdmin(lat, lng) : null;

  return {
    source: record.source,
    sourceId: record.sourceId,
    name: (tags.name ?? "").trim() || `Unnamed ${record.raw.id}`,
    description: (tags.description ?? "").trim() || undefined,
    kind: pickKind(category),
    category,
    keywords: seedKeywords(tags, category),
    department: admin?.department,
    municipality: admin?.municipality ?? ((tags["addr:city"] ?? "").trim() || undefined),
    lat,
    lng,
    address: extractAddress(tags),
    website: extractWebsite(tags),
    openingHours: tags.opening_hours || undefined,
    imageUrl: tags.image || undefined,
    visibility: "public",
    verified: true, // OSM data is community-verified by definition
    qualityScore: 0.8, // OSM is well-curated, not perfect
  };
}
