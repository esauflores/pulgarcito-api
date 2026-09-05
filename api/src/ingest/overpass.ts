// OSM Overpass fetcher for El Salvador tourism POIs. Pulls elements by node
// kind (tourist_place | restaurant | business); normalizer.ts maps them to
// the `place` schema.
import { withRetry } from "@/helpers/retry";

const OVERPASS_URL = process.env.OVERPASS_URL || "https://lz4.overpass-api.de/api/interpreter";
const USER_AGENT = "pulgarcito/0.1 (cv-project; github.com/esauflores)";

export type OsmKind = "tourist_place" | "restaurant" | "business";

// OSM selectors grouped by our node kind. Hotels stay under "business" on
// purpose — the schema maps tourism=hotel to category=hotel -> kind=hotel in
// the normalizer, so the OSM-side kind slot and the Pulgarcito-side kind are
// independent.
const KIND_SELECTORS: Record<OsmKind, string[]> = {
  tourist_place: [
    'node["tourism"~"attraction|museum|gallery|viewpoint|artwork|zoo|information"](area.a);',
    'way ["tourism"~"attraction|museum|gallery|viewpoint|artwork|zoo|information"](area.a);',
    'node["historic"~"archaeological_site|ruins|monument|memorial|castle|church|cathedral"](area.a);',
    'way ["historic"~"archaeological_site|ruins|monument|memorial|castle|church|cathedral"](area.a);',
    'node["natural"~"beach|waterfall|volcano|peak|spring|cave_entrance"](area.a);',
    'way ["natural"~"beach|waterfall|volcano|peak|spring|cave_entrance"](area.a);',
    'node["leisure"~"park|garden|nature_reserve"](area.a);',
    'way ["leisure"~"park|garden|nature_reserve"](area.a);',
    'node["place"~"city|town|village|hamlet|suburb|neighbourhood|locality"](area.a);',
    'way ["place"~"city|town|village|hamlet|suburb|neighbourhood|locality"](area.a);',
    'node["sport"~"surfing|swimming|diving|climbing|yoga"](area.a);',
    'way ["sport"~"surfing|swimming|diving|climbing|yoga"](area.a);',
    'node["leisure"~"sports_centre|fitness_centre|stadium"](area.a);',
    'way ["leisure"~"sports_centre|fitness_centre|stadium"](area.a);',
    'relation["boundary"="national_park"](area.a);',
    'relation["leisure"="nature_reserve"](area.a);',
    'relation["historic"](area.a);',
  ],
  restaurant: [
    'node["amenity"~"restaurant|cafe|bar|pub|fast_food|food_court|bakery|ice_cream|biergarten"](area.a);',
    'way ["amenity"~"restaurant|cafe|bar|pub|fast_food|food_court|bakery|ice_cream|biergarten"](area.a);',
  ],
  business: [
    'node["tourism"~"hotel|hostel|guest_house|motel|resort|camp_site"](area.a);',
    'way ["tourism"~"hotel|hostel|guest_house|motel|resort|camp_site"](area.a);',
    'node["shop"~"craft|souvenir|art|mall|supermarket|convenience|beauty|clothes"](area.a);',
    'way ["shop"~"craft|souvenir|art|mall|supermarket|convenience|beauty|clothes"](area.a);',
    'node["office"~"travel_agent|coworking"](area.a);',
    'way ["office"~"travel_agent|coworking"](area.a);',
    'node["amenity"~"hospital|clinic|pharmacy|bank|atm|post_office|police|fire_station|library"](area.a);',
    'way ["amenity"~"hospital|clinic|pharmacy|bank|atm|post_office|police|fire_station|library"](area.a);',
    'relation["amenity"~"hospital|clinic|pharmacy"](area.a);',
  ],
};

export function buildQuery(kind: OsmKind, timeoutSeconds = 180): string {
  const selectors = KIND_SELECTORS[kind].join("\n  ");
  return `[out:json][timeout:${timeoutSeconds}];\narea["ISO3166-1"="SV"]->.a;\n(\n  ${selectors}\n);\nout center tags;`;
}

export interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function postOverpass(query: string, timeoutSeconds: number): Promise<{ elements: OsmElement[] }> {
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout((timeoutSeconds + 30) * 1000),
  });
  // 429/504 (rate-limited/overloaded) and network errors are both thrown so
  // withRetry backs off and retries either the same way.
  if (res.status === 429 || res.status === 504) throw new Error(`Overpass ${res.status} (rate-limited or overloaded)`);
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  return await res.json();
}

export async function fetchKind(kind: OsmKind, timeoutSeconds = 180): Promise<OsmElement[]> {
  const query = buildQuery(kind, timeoutSeconds);
  console.error(`→ querying Overpass (${OVERPASS_URL}, kind=${kind}, timeout=${timeoutSeconds}s)...`);
  const data = await withRetry(() => postOverpass(query, timeoutSeconds));
  console.error(`  got ${data.elements.length} elements`);
  return data.elements;
}

export interface OsmRecord {
  source: "osm-overpass";
  sourceId: string;
  fetchedAt: string;
  raw: OsmElement;
}

export function elementToRecord(el: OsmElement): OsmRecord {
  return {
    source: "osm-overpass",
    sourceId: `osm:${el.type}:${el.id}`,
    fetchedAt: new Date().toISOString(),
    raw: el,
  };
}
