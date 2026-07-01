"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { MAPBOX_TOKEN, reverseGeocode, type Place } from "@/lib/mapbox";

const TORONTO: [number, number] = [-79.3832, 43.6532];

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (place: Place) => void;
  initial?: { lng: number; lat: number } | null;
  title?: string;
}

/**
 * "Choose on map" modal. Pan the map / drag the pin, and we reverse-geocode the
 * pin's position into an address. Loads mapbox-gl lazily on the client.
 */
export function MapPicker({ open, onClose, onConfirm, initial, title = "Choose location on map" }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const markerRef = useRef<import("mapbox-gl").Marker | null>(null);
  const [coords, setCoords] = useState<{ lng: number; lat: number }>(initial ?? { lng: TORONTO[0], lat: TORONTO[1] });
  const [address, setAddress] = useState("");
  const [resolving, setResolving] = useState(false);

  // Resolve an address for the current pin position.
  const resolve = async (lng: number, lat: number) => {
    setResolving(true);
    const p = await reverseGeocode(lng, lat);
    setResolving(false);
    setAddress(p?.address ?? "");
  };

  useEffect(() => {
    if (!open || !containerRef.current || !MAPBOX_TOKEN) return;
    let cancelled = false;
    let resizeObs: ResizeObserver | null = null;
    let resizeTimers: number[] = [];

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = MAPBOX_TOKEN;

      const start: [number, number] = initial ? [initial.lng, initial.lat] : TORONTO;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center: start,
        zoom: initial ? 14 : 11,
        attributionControl: false,
      });
      mapRef.current = map;

      const marker = new mapboxgl.Marker({ color: "#c9a76a", draggable: true })
        .setLngLat(start)
        .addTo(map);
      markerRef.current = marker;

      const commit = (lng: number, lat: number) => {
        setCoords({ lng, lat });
        resolve(lng, lat);
      };

      marker.on("dragend", () => {
        const { lng, lat } = marker.getLngLat();
        commit(lng, lat);
      });
      map.on("click", (e) => {
        marker.setLngLat(e.lngLat);
        commit(e.lngLat.lng, e.lngLat.lat);
      });

      map.on("load", () => map.resize());
      commit(start[0], start[1]);

      // The dialog animates in — the container's final size isn't known at
      // creation time. Resize once it settles and on any later size change.
      const ro = new ResizeObserver(() => map?.resize());
      ro.observe(containerRef.current);
      resizeObs = ro;
      resizeTimers = [80, 250, 500].map((ms) => window.setTimeout(() => map?.resize(), ms));
    })();

    return () => {
      cancelled = true;
      resizeObs?.disconnect();
      resizeTimers.forEach(clearTimeout);
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const { longitude: lng, latitude: lat } = pos.coords;
      mapRef.current?.flyTo({ center: [lng, lat], zoom: 15 });
      markerRef.current?.setLngLat([lng, lat]);
      setCoords({ lng, lat });
      resolve(lng, lat);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Drag the pin or tap the map, then confirm.</DialogDescription>
        </DialogHeader>

        {!MAPBOX_TOKEN ? (
          <div className="flex h-64 items-center justify-center rounded-md border border-border bg-muted text-sm text-ink-muted">
            Map unavailable — set NEXT_PUBLIC_MAPBOX_TOKEN.
          </div>
        ) : (
          <>
            <div className="relative">
              <div ref={containerRef} className="h-72 w-full overflow-hidden rounded-md border border-border" />
              <button
                type="button"
                onClick={useMyLocation}
                className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-md bg-background/90 px-2.5 py-1.5 text-xs font-medium shadow-sm backdrop-blur hover:bg-background"
              >
                <Crosshair className="h-3.5 w-3.5" /> My location
              </button>
            </div>
            <div className="flex items-start gap-2 text-sm text-ink-muted">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{resolving ? "Locating address…" : address || "Move the pin to pick a spot"}</span>
            </div>
          </>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-border px-4 py-2 text-sm hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!MAPBOX_TOKEN}
            onClick={() => {
              onConfirm({ address, lng: coords.lng, lat: coords.lat });
              onClose();
            }}
            className="rounded-sm bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:bg-[#2A2A2A] disabled:opacity-50"
          >
            Use this location
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
