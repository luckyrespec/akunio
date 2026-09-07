import { useEffect, useState } from "react";
import { DEFAULT_DEBOUNCE_MS } from "@/lib/constants";

/**
 * Custom hook to debounce any rapidly changing value (e.g. search inputs).
 *
 * @param value The value to debounce.
 * @param delayMs Delay in milliseconds (defaults to global DEFAULT_DEBOUNCE_MS = 300ms).
 * @returns The debounced value.
 */
export function useDebounce<T>(
  value: T,
  delayMs: number = DEFAULT_DEBOUNCE_MS
): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delayMs]);

  return debouncedValue;
}
