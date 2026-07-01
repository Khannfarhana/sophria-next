"use client";

import { useEffect, useRef, useState } from "react";
import { MAPBOX_TOKEN, mapboxEnabled, geocode, getDirections } from "@/lib/mapbox";

type Coords = { lng: number; lat: number };

interface Props {
  pickup: string;
  dropoff: string;
  /** Pass known coordinates to skip geocoding the address strings. */
  pickupCoords?: Coords | null;
  dropoffCoords?: Coords | null;
  className?: string;
  height?: number;
}

/**
 * Mapbox GL route preview between two points. Prefers passed coordinates and
 * falls back to geocoding the address strings (for legacy string-only rows).
 * Renders a graceful placeholder when no token is configured.
 */
export function RideMap({ pickup, dropoff, pickupCoords, dropoffCoords, className, height = 320 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const [failed, setFailed] = useState(false);

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

      const bounds = new mapboxgl.LngLatBounds([p.lng, p.lat], [p.lng, p.lat]).extend([d.lng, d.lat]);
      map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 0 });

      const dir = await getDirections(p, d);
      if (cancelled || !dir?.geometry || !map) return;
      map.once("load", () => {
        if (cancelled || !map) return;
        map.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: dir.geometry! } });
        map.addLayer({
          id: "route",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#c9a76a", "line-width": 4, "line-opacity": 0.9 },
        });
      });
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      resizeObs?.disconnect();
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup, dropoff, pickupCoords?.lng, pickupCoords?.lat, dropoffCoords?.lng, dropoffCoords?.lat]);

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
