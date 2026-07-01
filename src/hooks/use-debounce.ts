import { useEffect, useState } from "react";

/**
 * Returns a copy of `value` that only updates after `delayMs` of no changes.
 * Used to throttle address-autocomplete requests so we query on pause,
 * not on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 280): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
