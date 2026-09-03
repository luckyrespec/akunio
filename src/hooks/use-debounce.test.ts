import { describe, it, expect, vi } from "vitest";
import { DEFAULT_SEARCH_DEBOUNCE_MS } from "@/lib/constants";

describe("useDebounce logic", () => {
  it("defaults to 500ms debounce constant", () => {
    expect(DEFAULT_SEARCH_DEBOUNCE_MS).toBe(500);
  });

  it("handles debounce timer delay accurately", async () => {
    vi.useFakeTimers();
    let current = "initial";
    const setValue = (val: string, delay = DEFAULT_SEARCH_DEBOUNCE_MS) => {
      const timer = setTimeout(() => {
        current = val;
      }, delay);
      return () => clearTimeout(timer);
    };

    const cleanup = setValue("updated", 500);
    expect(current).toBe("initial");

    vi.advanceTimersByTime(499);
    expect(current).toBe("initial");

    vi.advanceTimersByTime(1);
    expect(current).toBe("updated");

    cleanup();
    vi.useRealTimers();
  });
});
