import { and, eq, sql, type SQL } from "drizzle-orm";

import { place } from "@/db/schema";

// Inlined per-query — no stored haversine_km() function. 6371 km = earth radius.
export const distanceKm = (lat: number, lng: number) => sql<number>`
  6371 * 2 * asin(sqrt(
    power(sin(radians(${place.lat} - ${lat}) / 2), 2) +
    cos(radians(${lat})) * cos(radians(${place.lat})) *
    power(sin(radians(${place.lng} - ${lng}) / 2), 2)
  ))
`;

export type PlaceFilters = {
  type?: string;
  category?: string;
  department?: string;
  near?: { lat: number; lng: number };
  radiusKm?: number;
};

// Shared base filters (public + verified + type/category/department/near) for
// both the browse and search endpoints.
export function buildPlaceConditions(filters: PlaceFilters): SQL {
  const conditions: SQL[] = [eq(place.visibility, "public"), eq(place.verified, true)];
  if (filters.type) conditions.push(eq(place.kind, filters.type));
  if (filters.category) conditions.push(eq(place.category, filters.category));
  if (filters.department) conditions.push(eq(place.department, filters.department));
  if (filters.near) {
    conditions.push(sql`${distanceKm(filters.near.lat, filters.near.lng)} <= ${filters.radiusKm ?? 25}`);
  }
  return and(...conditions)!;
}
