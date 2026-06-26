interface Props {
  pickup: string;
  dropoff: string;
  className?: string;
  height?: number;
}

/**
 * Embedded Google Maps directions view.
 * Uses the browser-restricted key (referrer-locked) — safe in client HTML.
 */
export function RideMap({ pickup, dropoff, className, height = 320 }: Props) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!key) {
    return (
      <div
        className={className}
        style={{ height }}
        role="img"
        aria-label="Map preview unavailable"
      >
        <div className="flex h-full items-center justify-center rounded-md border border-border bg-muted text-sm text-ink-muted">
          Map unavailable
        </div>
      </div>
    );
  }
  const src = `https://www.google.com/maps/embed/v1/directions?key=${key}&origin=${encodeURIComponent(
    pickup,
  )}&destination=${encodeURIComponent(dropoff)}&mode=driving`;
  return (
    <iframe
      title="Route map"
      src={src}
      className={`w-full rounded-md border border-border ${className ?? ""}`}
      style={{ height }}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      allowFullScreen
    />
  );
}

export function navigateUrl(pickup: string, dropoff: string) {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
    pickup,
  )}&destination=${encodeURIComponent(dropoff)}&travelmode=driving`;
}
