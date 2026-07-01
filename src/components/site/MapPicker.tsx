"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, MapPin, Search, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { MAPBOX_TOKEN, reverseGeocode, suggest, retrieve, newSessionToken, type Place, type Suggestion } from "@/lib/mapbox";

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

  // Search-on-map state.
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const sessionRef = useRef(newSessionToken());
  const skipNextQuery = useRef(false);
  const debouncedQuery = useDebouncedValue(query, 280);

  // Resolve an address for the current pin position.
  const resolve = async (lng: number, lat: number) => {
    setResolving(true);
    const p = await reverseGeocode(lng, lat);
    setResolving(false);
    setAddress(p?.address ?? "");
  };

  // Move map + pin to a coordinate and resolve its address.
  const goTo = (lng: number, lat: number) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 15 });
    markerRef.current?.setLngLat([lng, lat]);
    setCoords({ lng, lat });
    resolve(lng, lat);
  };

  // Debounced address suggestions for the search box.
  useEffect(() => {
    if (!MAPBOX_TOKEN) return;
    if (skipNextQuery.current) { skipNextQuery.current = false; return; }
    const q = debouncedQuery.trim();
    if (q.length < 3) { setSuggestions([]); setSearching(false); return; }
    const controller = new AbortController();
    setSearching(true);
    suggest(q, sessionRef.current, { signal: controller.signal }).then((res) => {
      setSuggestions(res);
      setSearching(false);
    });
    return () => controller.abort();
  }, [debouncedQuery]);

  const pickSuggestion = async (sug: Suggestion) => {
    skipNextQuery.current = true;
    setQuery(sug.full);
    setSuggestions([]);
    const place = await retrieve(sug.mapboxId, sessionRef.current);
    sessionRef.current = newSessionToken();
    if (place) {
      goTo(place.lng, place.lat);
      setAddress(place.address || sug.full);
    }
  };

  // Reset search whenever the dialog reopens.
  useEffect(() => {
    if (open) { setQuery(""); setSuggestions([]); sessionRef.current = newSessionToken(); }
  }, [open]);

  useEffect(() => {
    if (!open || !MAPBOX_TOKEN) return;
    let cancelled = false;
    let map: import("mapbox-gl").Map | null = null;
    let resizeObs: ResizeObserver | null = null;
    let resizeTimers: number[] = [];
    let raf = 0;

    // The picker is a Radix dialog stacked on another dialog — the container
    // may not be attached or laid out when this effect first runs. Poll a few
    // frames until it exists AND has a real size, then create the map.
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
      const el = await waitForContainer();
      if (cancelled || !el) return;
      mapboxgl.accessToken = MAPBOX_TOKEN;

      const start: [number, number] = initial ? [initial.lng, initial.lat] : TORONTO;
      map = new mapboxgl.Map({
        container: el,
        style: "mapbox://styles/mapbox/dark-v11",
        center: start,
        zoom: initial ? 14 : 11,
        attributionControl: false,
      });
      mapRef.current = map;
      map.on("error", (e) => console.error("[MapPicker] mapbox error", e?.error ?? e));

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
        marker!.setLngLat(e.lngLat);
        commit(e.lngLat.lng, e.lngLat.lat);
      });

      map.on("load", () => map?.resize());
      commit(start[0], start[1]);

      // Belt-and-suspenders: resize as the dialog settles and on size changes.
      const ro = new ResizeObserver(() => map?.resize());
      ro.observe(el);
      resizeObs = ro;
      resizeTimers = [80, 250, 500].map((ms) => window.setTimeout(() => map?.resize(), ms));
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      resizeObs?.disconnect();
      resizeTimers.forEach(clearTimeout);
      markerRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => goTo(pos.coords.longitude, pos.coords.latitude));
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
            {/* Search */}
            <div className="relative z-10">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-input px-3 py-2.5 focus-within:border-foreground">
                <Search className="h-4 w-4 shrink-0 text-ink-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search for an address or place"
                  autoComplete="off"
                  className="w-full bg-transparent text-sm text-foreground placeholder:text-ink-soft focus:outline-none"
                />
                {searching ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink-soft" />
                ) : query ? (
                  <button type="button" onClick={() => { setQuery(""); setSuggestions([]); }} className="shrink-0 text-ink-soft hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              {suggestions.length > 0 && (
                <ul className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-56 overflow-auto rounded-lg border border-border bg-popover py-1 shadow-lg">
                  {suggestions.map((sug) => (
                    <li key={sug.mapboxId}>
                      <button
                        type="button"
                        onClick={() => pickSuggestion(sug)}
                        className="flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left hover:bg-muted"
                      >
                        <span className="text-sm text-foreground">{sug.name}</span>
                        {sug.place && <span className="text-xs text-ink-muted">{sug.place}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

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
              <span>{resolving ? "Locating address…" : address || "Search, drag the pin, or tap the map"}</span>
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
