"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MapIcon, Loader2 } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounce";
import {
  suggest,
  retrieve,
  newSessionToken,
  mapboxEnabled,
  type Suggestion,
  type Place,
} from "@/lib/mapbox";
import { MapPicker } from "@/components/site/MapPicker";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (text: string) => void;
  /** Fired when a suggestion or map pin resolves to real coordinates. */
  onSelect: (place: Place) => void;
  placeholder?: string;
  inputClassName?: string;
  /** Icon rendered to the left of the input (matches existing field styling). */
  leadingIcon?: React.ReactNode;
  /** Center the map picker here if known (usually the counterpart endpoint). */
  mapInitial?: { lng: number; lat: number } | null;
  mapTitle?: string;
  required?: boolean;
  id?: string;
}

/**
 * Debounced address autocomplete backed by the Mapbox Search Box API, with a
 * "Choose on map" fallback. Degrades to a plain text input when no token is set.
 */
export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  inputClassName,
  leadingIcon,
  mapInitial,
  mapTitle,
  required,
  id,
}: Props) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const [pickerOpen, setPickerOpen] = useState(false);

  const sessionRef = useRef(newSessionToken());
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  // Text we just committed via selection — don't re-query it.
  const selectedRef = useRef<string | null>(null);

  const debounced = useDebouncedValue(value, 280);

  // Fetch suggestions when the debounced query settles.
  useEffect(() => {
    if (!mapboxEnabled) return;
    if (selectedRef.current === debounced) return;
    const q = debounced.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    suggest(q, sessionRef.current, { signal: controller.signal }).then((res) => {
      setSuggestions(res);
      setLoading(false);
      setActive(-1);
      if (res.length) setOpen(true);
    });
    return () => controller.abort();
  }, [debounced]);

  // Close the dropdown on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = async (s: Suggestion) => {
    onChange(s.full);
    selectedRef.current = s.full;
    setOpen(false);
    setSuggestions([]);
    const place = await retrieve(s.mapboxId, sessionRef.current);
    // New session after a completed retrieve (Search Box billing convention).
    sessionRef.current = newSessionToken();
    if (place) onSelect({ ...place, address: place.address || s.full });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || !suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="flex w-full items-center gap-3">
        {leadingIcon}
        <input
          id={id}
          value={value}
          onChange={(e) => {
            selectedRef.current = null;
            onChange(e.target.value);
          }}
          onFocus={() => suggestions.length && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
          className={inputClassName ?? "w-full bg-transparent text-sm placeholder:text-ink-soft focus:outline-none"}
        />
        {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink-soft" />}
        {mapboxEnabled && (
          <button
            type="button"
            title="Choose on map"
            aria-label="Choose on map"
            onClick={() => {
              setPickerOpen(true);
              setOpen(false);
            }}
            className="shrink-0 text-ink-soft transition-colors hover:text-foreground"
          >
            <MapIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && mapboxEnabled && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          <ul className="max-h-72 overflow-auto py-1">
            {suggestions.map((s, i) => (
              <li key={s.mapboxId}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(s)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left transition-colors",
                    i === active ? "bg-muted" : "hover:bg-muted",
                  )}
                >
                  <span className="text-sm text-foreground">{s.name}</span>
                  {s.place && <span className="text-xs text-ink-muted">{s.place}</span>}
                </button>
              </li>
            ))}
            {!loading && suggestions.length === 0 && value.trim().length >= 3 && (
              <li className="px-4 py-2 text-sm text-ink-muted">No matches</li>
            )}
          </ul>
          <button
            type="button"
            onClick={() => {
              setPickerOpen(true);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 border-t border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            <MapIcon className="h-4 w-4 text-ink-muted" /> Choose on map
          </button>
        </div>
      )}

      <MapPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        initial={mapInitial}
        title={mapTitle}
        onConfirm={(place) => {
          onChange(place.address);
          selectedRef.current = place.address;
          onSelect(place);
        }}
      />
    </div>
  );
}
