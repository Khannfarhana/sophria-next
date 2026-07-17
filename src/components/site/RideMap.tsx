"use client";

import { useEffect, useRef, useState } from "react";
import { MAPBOX_TOKEN, mapboxEnabled, geocode, getDirections } from "@/lib/mapbox";
import { routableStops, type BookingStop } from "@/lib/stops";

type Coords = { lng: number; lat: number };

interface Props {
  pickup: string;
  dropoff: string;
  /** Pass known coordinates to skip geocoding the address strings. */
  pickupCoords?: Coords | null;
  dropoffCoords?: Coords | null;
  /** Intermediate stops, in order. Routed through and marked 1..n. */
  stops?: BookingStop[];
  className?: string;
  height?: number;
}

/**
 * Mapbox GL route preview. Prefers passed coordinates and falls back to
 * geocoding the address strings (for legacy string-only rows). Renders a
 * graceful placeholder when no token is configured.
 *
 * The drawn path routes through `stops` in order, matching how the fare is
 * priced (actions.ts routes the same waypoints through Mapbox). Without them
 * the map showed a direct pickup->drop-off line while the customer was billed
 * for the longer multi-stop route — the picture contradicted the price.
 */
export function RideMap({ pickup, dropoff, pickupCoords, dropoffCoords, stops, className, height = 320 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const [failed, setFailed] = useState(false);
  const stopsKey = JSON.stringify(routableStops(stops ?? []));

  useEffect(() => {
    if (!mapboxEnabled) return;
    let cancelled = false;
    let map: import("mapbox-gl").Map | null = null;
    let resizeObs: ResizeObserver | null = null;
    let raf = 0;

    // Container may not be attached/sized yet (e.g. inside a dialog). Poll for it.
    const waitForContainer = (): Promise<HTMLDivElement | null> =>
      new Promise((res) => {
        const check = () => {
          if (cancelled) return res(null);
          const el = containerRef.current;
          if (el && el.clientWidth > 0 && el.clientHeight > 0) return res(el);
          raf = requestAnimationFrame(check);
        };
        check();
      });

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;

      // Resolve both endpoints to coordinates.
      const [p, d] = await Promise.all([
        pickupCoords ?? geocode(pickup),
        dropoffCoords ?? geocode(dropoff),
      ]);
      if (cancelled) return;
      if (!p || !d) { setFailed(true); return; }

      const el = await waitForContainer();
      if (cancelled || !el) return;

      mapboxgl.accessToken = MAPBOX_TOKEN;
      map = new mapboxgl.Map({
        container: el,
        style: "mapbox://styles/mapbox/dark-v11",
        center: [p.lng, p.lat],
        zoom: 11,
        attributionControl: false,
        interactive: true,
      });
      mapRef.current = map;
      map.on("error", (e) => console.error("[RideMap] mapbox error", e?.error ?? e));

      const ro = new ResizeObserver(() => map?.resize());
      ro.observe(el);
      resizeObs = ro;

      new mapboxgl.Marker({ color: "#4ade80" }).setLngLat([p.lng, p.lat]).addTo(map);
      new mapboxgl.Marker({ color: "#c9a76a" }).setLngLat([d.lng, d.lat]).addTo(map);

      // Only stops Mapbox can route to. A stop the customer typed that didn't
      // geocode still rides along on the driver's itinerary (see stops.ts) —
      // it just can't be drawn, so it is skipped here rather than faked.
      const waypoints = routableStops(stops ?? []);
      waypoints.forEach((s, i) => {
        const badge = document.createElement("div");
        badge.textContent = String(i + 1);
        badge.style.cssText =
          "display:grid;place-items:center;width:22px;height:22px;border-radius:9999px;" +
          "background:#e7d3a8;color:#141416;font:600 11px/1 ui-sans-serif,system-ui;" +
          "box-shadow:0 0 0 2px rgba(0,0,0,.45)";
        new mapboxgl.Marker({ element: badge }).setLngLat([s.lng, s.lat]).addTo(map!);
      });

      const bounds = new mapboxgl.LngLatBounds([p.lng, p.lat], [p.lng, p.lat]).extend([d.lng, d.lat]);
      for (const s of waypoints) bounds.extend([s.lng, s.lat]);
      map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 0 });

      const dir = await getDirections(p, d, waypoints);
      if (cancelled || !dir?.geometry || !map) return;

      const drawRoute = () => {
        if (cancelled || !map) return;
        map.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: dir.geometry! } });
        map.addLayer({
          id: "route",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#c9a76a", "line-width": 4, "line-opacity": 0.9 },
        });
      };
      // `once("load")` alone is a race: getDirections is awaited above, so the
      // style has often already loaded by now — and `load` never fires twice,
      // leaving the route silently undrawn.
      if (map.isStyleLoaded()) drawRoute();
      else map.once("load", drawRoute);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      resizeObs?.disconnect();
      map?.remove();
      mapRef.current = null;
    };
    // stopsKey (not `stops`) so a new array with identical coordinates doesn't
    // tear down and rebuild the map on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup, dropoff, pickupCoords?.lng, pickupCoords?.lat, dropoffCoords?.lng, dropoffCoords?.lat, stopsKey]);

  if (!mapboxEnabled || failed) {
    return (
      <div className={className} style={{ height }} role="img" aria-label="Map preview unavailable">
        <div className="flex h-full items-center justify-center rounded-md border border-border bg-muted text-sm text-ink-muted">
          Map unavailable
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`w-full overflow-hidden rounded-md border border-border ${className ?? ""}`}
      style={{ height }}
    />
  );
}

export function navigateUrl(pickup: string, dropoff: string) {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
    pickup,
  )}&destination=${encodeURIComponent(dropoff)}&travelmode=driving`;
}
