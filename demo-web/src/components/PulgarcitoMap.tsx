import L from "leaflet";

import "leaflet/dist/leaflet.css";
import {
  Waves,
  Mountain,
  MountainSnow,
  Landmark,
  Church,
  TreePine,
  Palmtree,
  Bed,
  Building2,
  Coffee,
  Utensils,
  Store,
  ShoppingBag,
  Hotel,
  Tent,
  MapPin,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Route as RouteIcon,
  Navigation,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MapContainer, TileLayer, Marker, Popup, useMap, ZoomControl, Polyline } from "react-leaflet";

const CAT_COLORS: Record<string, string> = {
  beach: "#00b4d8",
  volcano: "#e63946",
  museum: "#f4a261",
  archaeological_site: "#d4a373",
  restaurant: "#2a9d8f",
  cafe: "#457b9d",
  bar: "#1d3557",
  hotel: "#e76f51",
  hostel: "#f8961e",
  park: "#40916c",
  waterfall: "#90be6d",
  viewpoint: "#f9c74f",
  lake: "#4cc9f0",
  church: "#b5838d",
  monument: "#6d6875",
  market: "#ffb703",
  craft_shop: "#d90429",
};

const CAT_LABELS: Record<string, string> = {
  beach: "playa",
  volcano: "volcán",
  viewpoint: "mirador",
  waterfall: "cascada",
  lake: "lago",
  park: "parque",
  natural_park: "parque natural",
  attraction: "atracción",
  museum: "museo",
  monument: "monumento",
  archaeological_site: "sitio arqueológico",
  historic_building: "edificio histórico",
  church: "iglesia",
  restaurant: "restaurante",
  cafe: "café",
  bar: "bar",
  fast_food: "comida rápida",
  bakery: "panadería",
  hotel: "hotel",
  hostel: "hostal",
  guesthouse: "casa de huéspedes",
  resort: "resort",
  camping: "camping",
  craft_shop: "tienda de artesanías",
  souvenir_shop: "tienda de souvenirs",
  mall: "centro comercial",
  market: "mercado",
  travel_agency: "agencia de viajes",
  info_office: "oficina de información",
  other: "otro",
};

function catLabel(cat: string | null): string {
  if (!cat) return "";
  return CAT_LABELS[cat] || cat.replace(/_/g, " ");
}

const CAT_ICONS: Record<string, LucideIcon> = {
  beach: Waves,
  waterfall: Waves,
  lake: Waves,
  volcano: MountainSnow,
  viewpoint: Mountain,
  archaeological_site: Landmark,
  museum: Building2,
  monument: Landmark,
  church: Church,
  park: TreePine,
  natural_park: Palmtree,
  restaurant: Utensils,
  cafe: Coffee,
  bar: Utensils,
  fast_food: Utensils,
  hotel: Hotel,
  hostel: Bed,
  market: Store,
  craft_shop: ShoppingBag,
  camping: Tent,
};

function getColor(cat: string | null): string {
  return (cat && CAT_COLORS[cat]) || "#999";
}
function getIcon(cat: string | null): LucideIcon {
  return (cat && CAT_ICONS[cat]) || MapPin;
}
function makeMarkerIcon(cat: string | null): L.DivIcon {
  const color = getColor(cat);
  const Icon = getIcon(cat);
  const svg = renderToStaticMarkup(<Icon size={18} color="white" strokeWidth={2.25} />);
  return L.divIcon({
    className: "pulgarcito-marker",
    html: `<div style="width:32px;height:32px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;">${svg}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

interface Place {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  department: string | null;
  lat: number | null;
  lng: number | null;
  website: string | null;
}

interface RouteResult {
  distance: number;
  duration: number;
  geometry: { type: string; coordinates: [number, number][] };
}

type Mode = "places" | "route";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function BoundsFitter({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
  }, [bounds, map]);
  return null;
}

export function PulgarcitoMap() {
  const [mode, setMode] = useState<Mode>("places");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Places
  const [places, setPlaces] = useState<Place[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Route
  const [routeFrom, setRouteFrom] = useState("13.4861,-89.3164");
  const [routeTo, setRouteTo] = useState("13.6929,-89.2182");
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const fetchPlaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      const q = query.trim();
      // /places/search (used when q is set) caps limit at 50 — it's RRF-ranked
      // semantic search, not plain pagination like /places.
      params.set("limit", q ? "50" : "100");
      if (category) params.set("category", category);
      if (q) params.set("q", q);
      const res = await fetch(`/api/places?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { results?: Place[]; total?: number };
      setPlaces(data.results ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch failed");
    } finally {
      setLoading(false);
    }
  }, [query, category]);

  const fetchRoute = useCallback(async () => {
    setRouteLoading(true);
    setRouteError(null);
    try {
      const params = new URLSearchParams({ from: routeFrom, to: routeTo });
      const res = await fetch(`/api/route?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRoute((await res.json()) as RouteResult);
    } catch (e) {
      setRouteError(e instanceof Error ? e.message : "routing failed");
      setRoute(null);
    } finally {
      setRouteLoading(false);
    }
  }, [routeFrom, routeTo]);

  useEffect(() => {
    if (mode === "places") {
      const id = setTimeout(fetchPlaces, query ? 350 : 0);
      return () => clearTimeout(id);
    }
  }, [mode, query, fetchPlaces]);

  const iconCacheRef = useRef<Map<string, L.DivIcon>>(new Map());
  function iconFor(cat: string | null): L.DivIcon {
    const key = cat ?? "";
    let ic = iconCacheRef.current.get(key);
    if (!ic) {
      ic = makeMarkerIcon(cat);
      iconCacheRef.current.set(key, ic);
    }
    return ic;
  }

  const visiblePlaces = places.filter((p) => p.lat !== null && p.lng !== null);
  const bounds: L.LatLngBoundsExpression | null =
    mode === "places" && visiblePlaces.length > 0
      ? visiblePlaces.map((p) => [p.lat!, p.lng!] as [number, number])
      : mode === "route" && route
        ? route.geometry.coordinates.map((c) => [c[1], c[0]] as [number, number])
        : null;

  const activeCats = Object.keys(CAT_COLORS);

  return (
    <main className="relative flex h-full w-full">
      <aside
        className={`${sidebarOpen ? "w-80" : "w-0"} z-[1000] flex shrink-0 flex-col overflow-hidden bg-zinc-900/95 shadow-md backdrop-blur transition-all duration-200`}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex flex-col">
            <span className="text-base font-bold text-zinc-50">Pulgarcito</span>
            <span className="text-[10px] text-zinc-400">Mapa turístico de El Salvador</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1 text-zinc-500 hover:text-zinc-200"
            title="Ocultar panel"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto px-4 py-3">
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => setMode("places")}
              className={`flex items-center justify-center gap-1 rounded px-2 py-1.5 text-xs ${mode === "places" ? "bg-zinc-50 text-zinc-900" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
            >
              <MapPin size={12} /> Lugares
            </button>
            <button
              onClick={() => setMode("route")}
              className={`flex items-center justify-center gap-1 rounded px-2 py-1.5 text-xs ${mode === "route" ? "bg-zinc-50 text-zinc-900" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
            >
              <RouteIcon size={12} /> Ruta
            </button>
          </div>

          {mode === "places" && (
            <>
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>
                  {loading ? "Cargando…" : error ? `⚠ ${error}` : `${visiblePlaces.length} de ${total} lugares`}
                </span>
              </div>
              <div className="relative">
                <Search size={14} className="absolute top-2.5 left-2.5 text-zinc-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar: playa, museo…"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 py-1.5 pr-3 pl-8 text-sm text-zinc-100 focus:ring-2 focus:ring-zinc-500 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">Categorías</span>
                <button
                  onClick={() => setCategory(null)}
                  className={`rounded border px-2 py-1 text-left text-xs ${category === null ? "border-zinc-50 bg-zinc-50 text-zinc-900" : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"}`}
                >
                  Todas
                </button>
                {activeCats.map((cat) => {
                  const Icon = getIcon(cat);
                  const on = category === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setCategory(on ? null : cat)}
                      className={`flex items-center gap-1.5 rounded border px-2 py-1 text-left text-xs ${on ? "border-transparent text-white" : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"}`}
                      style={on ? { backgroundColor: getColor(cat) } : undefined}
                    >
                      <Icon size={12} /> {catLabel(cat)}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {mode === "route" && (
            <>
              <label className="flex flex-col gap-1">
                <span className="flex items-center gap-1 text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">
                  <Navigation size={10} /> Desde (lat,lng)
                </span>
                <input
                  value={routeFrom}
                  onChange={(e) => setRouteFrom(e.target.value)}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-100"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="flex items-center gap-1 text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">
                  <MapPin size={10} /> Hasta (lat,lng)
                </span>
                <input
                  value={routeTo}
                  onChange={(e) => setRouteTo(e.target.value)}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-100"
                />
              </label>
              <button
                onClick={fetchRoute}
                disabled={routeLoading}
                className="rounded-md bg-zinc-50 px-3 py-1.5 text-xs text-zinc-900 hover:bg-zinc-200 disabled:opacity-50"
              >
                {routeLoading ? "Calculando…" : "Calcular ruta"}
              </button>
              {routeError && <div className="text-xs text-red-400">⚠ {routeError}</div>}
              {route && (
                <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900 p-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">Distancia</span>
                    <span className="font-mono font-bold text-zinc-100">{(route.distance / 1000).toFixed(1)} km</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">Duración</span>
                    <span className="font-mono font-bold text-zinc-100">{formatDuration(route.duration)}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="absolute top-2 left-2 z-[1000] rounded-md bg-zinc-900/95 p-2 text-zinc-200 shadow-md backdrop-blur hover:bg-zinc-800"
        >
          <PanelLeftOpen size={16} />
        </button>
      )}

      <div className="relative flex-1">
        <MapContainer center={[13.794, -88.896]} zoom={8} className="h-full w-full" scrollWheelZoom zoomControl={false}>
          <ZoomControl position="bottomleft" />
          <TileLayer attribution="&copy; OSM contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          {mode === "places" &&
            visiblePlaces.map((p) => (
              <Marker key={p.id} position={[p.lat!, p.lng!]} icon={iconFor(p.category)}>
                <Popup>
                  <div className="min-w-[200px] text-sm">
                    <strong className="text-base">{p.name}</strong>
                    {p.description && <div className="mt-1 text-xs text-slate-600">{p.description}</div>}
                    <div className="mt-1 text-xs text-slate-500">
                      {catLabel(p.category)}
                      {p.department ? ` · ${p.department}` : ""}
                    </div>
                    {p.website && (
                      <a href={p.website} target="_blank" rel="noopener" className="mt-1 block text-xs text-blue-600">
                        {p.website}
                      </a>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}

          {mode === "route" && route && (
            <Polyline
              positions={route.geometry.coordinates.map((c) => [c[1], c[0]] as [number, number])}
              pathOptions={{ color: "#2563eb", weight: 5, opacity: 0.7 }}
            />
          )}

          <BoundsFitter bounds={bounds} />
        </MapContainer>
      </div>
    </main>
  );
}
