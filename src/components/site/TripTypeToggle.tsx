"use client";

import { TRIP_TYPES, type TripType } from "@/lib/pricing";

/**
 * Segmented control for booking trip mode. Two visual variants:
 * - "light" (default): for white cards (booking widget, /book step)
 * - "dark": for use on dark hero surfaces
 */
export function TripTypeToggle({
  value,
  onChange,
  variant = "light",
  className = "",
}: {
  value: TripType;
  onChange: (t: TripType) => void;
  variant?: "light" | "dark";
  className?: string;
}) {
  const track =
    variant === "dark"
      ? "border-white/15 bg-white/[0.06]"
      : "border-border bg-surface";

  return (
    <div className={`inline-flex rounded-full border p-1 ${track} ${className}`}>
      {TRIP_TYPES.map((t) => {
        const active = value === t.value;
        const activeCls =
          variant === "dark" ? "bg-white text-black" : "bg-foreground text-background";
        const idleCls =
          variant === "dark"
            ? "text-white/60 hover:text-white"
            : "text-ink-muted hover:text-foreground";
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={`cursor-pointer rounded-full px-4 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
              active ? activeCls : idleCls
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
