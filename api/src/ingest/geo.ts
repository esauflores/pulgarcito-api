// Department + municipality lookup by point, via GADM admin-2 (municipio)
// boundary polygons — OSM has no admin-department tag, and its addr:city
// coverage is too sparse (~20%) to rely on alone. One point-in-polygon
// lookup gives both, since each municipio feature also carries its parent
// department name.
import { readFileSync } from "node:fs";

import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature, MultiPolygon, Polygon } from "geojson";

interface MunicipalityProperties {
  NAME_1: string; // department
  NAME_2: string; // municipality
}

const DATA_PATH = new URL("./data/el_salvador_municipalities.geojson", import.meta.url);

const municipalities: Feature<Polygon | MultiPolygon, MunicipalityProperties>[] = JSON.parse(
  readFileSync(DATA_PATH, "utf-8"),
).features;

export interface AdminLookup {
  department: string;
  municipality: string;
}

// Returns null when the point falls outside every polygon (rare —
// coastline points or boundary-simplification gaps).
export function lookupAdmin(lat: number, lng: number): AdminLookup | null {
  for (const feature of municipalities) {
    if (booleanPointInPolygon([lng, lat], feature)) {
      return { department: feature.properties.NAME_1, municipality: feature.properties.NAME_2 };
    }
  }
  return null;
}
