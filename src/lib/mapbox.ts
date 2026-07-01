/**
 * Central Mapbox client. Single source of truth for the browser token,
 * address autocomplete (Search Box API), reverse geocoding, and driving
 * directions. Every function degrades gracefully when the token is missing
 * so the app keeps working with plain text inputs until it's set.
 *
 * Docs: https://docs.mapbox.com/api/search/search-box/
 *       https://docs.mapbox.com/api/navigation/directions/
 */

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
export const mapboxEnabled = MAPBOX_TOKEN.length > 0;

const SEARCH_BASE = "https://api.mapbox.com/search/searchbox/v1";
const DIRECTIONS_BASE = "https://api.mapbox.com/directions/v5/mapbox/driving";

// Bias results toward the Greater Toronto Area.
const GTA_PROXIMITY = "-79.3832,43.6532"; // lng,lat — downtown Toronto
const COUNTRY = "ca";
const LANGUAGE = "en";

export interface Place {
  address: string;
  lng: number;
  lat: number;
  mapboxId?: string;
}

export interface Suggestion {
  mapboxId: string;
  name: string;
  /** Secondary line, e.g. "Toronto, Ontario". */
  place: string;
  /** Convenience: `name` + `place` for display / storage. */
  full: string;
}

export interface Directions {
  distanceKm: number;
  durationMin: number;
  /** GeoJSON LineString geometry for drawing the route. */
  geometry: GeoJSON.LineString | null;
}

/**
 * A Search Box "session" batches many /suggest calls plus one /retrieve into a
 * single billed request group. Create one per editing session (per input).
 * Uses crypto.randomUUID when available, falls back to a random string.
 */
export function newSessionToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sess-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** Autocomplete suggestions for a partial address query. */
export async function suggest(
  query: string,
  sessionToken: string,
  opts: { signal?: AbortSignal; limit?: number } = {},
): Promise<Suggestion[]> {
  if (!mapboxEnabled || query.trim().length < 3) return [];
  const url = new URL(`${SEARCH_BASE}/suggest`);
  url.searchParams.set("q", query);
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  url.searchParams.set("session_token", sessionToken);
  url.searchParams.set("language", LANGUAGE);
  url.searchParams.set("country", COUNTRY);
  url.searchParams.set("proximity", GTA_PROXIMITY);
  url.searchParams.set("types", "address,street,place,poi,neighborhood,postcode");
  url.searchParams.set("limit", String(opts.limit ?? 6));

  try {
    const res = await fetch(url, { signal: opts.signal });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.suggestions ?? []).map((s: Record<string, string>) => ({
      mapboxId: s.mapbox_id,
      name: s.name,
      place: s.place_formatted ?? s.full_address ?? "",
      full: s.full_address ?? [s.name, s.place_formatted].filter(Boolean).join(", "),
    }));
  } catch {
    return [];
  }
}

/** Resolve a chosen suggestion into coordinates + a canonical address. */
export async function retrieve(mapboxId: string, sessionToken: string): Promise<Place | null> {
  if (!mapboxEnabled) return null;
  const url = new URL(`${SEARCH_BASE}/retrieve/${encodeURIComponent(mapboxId)}`);
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  url.searchParams.set("session_token", sessionToken);

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const f = json.features?.[0];
    if (!f) return null;
    const [lng, lat] = f.geometry.coordinates as [number, number];
    const p = f.properties ?? {};
    return {
      address: p.full_address ?? p.name ?? "",
      lng,
      lat,
      mapboxId,
    };
  } catch {
    return null;
  }
}

/** Turn a dropped map pin into an address string. */
export async function reverseGeocode(lng: number, lat: number): Promise<Place | null> {
  if (!mapboxEnabled) return null;
  const url = new URL(`${SEARCH_BASE}/reverse`);
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  url.searchParams.set("language", LANGUAGE);
  url.searchParams.set("country", COUNTRY);

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const f = json.features?.[0];
    if (!f) return { address: "", lng, lat };
    const p = f.properties ?? {};
    return { address: p.full_address ?? p.name ?? "", lng, lat };
  } catch {
    return { address: "", lng, lat };
  }
}

/** Forward-geocode a free-text address to a single best coordinate. */
export async function geocode(query: string): Promise<Place | null> {
  if (!mapboxEnabled || !query.trim()) return null;
  const url = new URL(`${SEARCH_BASE}/forward`);
  url.searchParams.set("q", query);
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  url.searchParams.set("language", LANGUAGE);
  url.searchParams.set("country", COUNTRY);
  url.searchParams.set("proximity", GTA_PROXIMITY);
  url.searchParams.set("limit", "1");

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const f = json.features?.[0];
    if (!f) return null;
    const [lng, lat] = f.geometry.coordinates as [number, number];
    return { address: f.properties?.full_address ?? query, lng, lat };
  } catch {
    return null;
  }
}

/** Driving distance/duration/geometry between two coordinates. */
export async function getDirections(
  pickup: { lng: number; lat: number },
  dropoff: { lng: number; lat: number },
): Promise<Directions | null> {
  if (!mapboxEnabled) return null;
  const coords = `${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}`;
  const url = new URL(`${DIRECTIONS_BASE}/${coords}`);
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const route = json.routes?.[0];
    if (!route) return null;
    return {
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60,
      geometry: (route.geometry as GeoJSON.LineString) ?? null,
    };
  } catch {
    return null;
  }
}
