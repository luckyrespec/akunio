import { describe, it, expect } from "vitest";
import { STORE_INTERACTIONS, interactionBaseParams, isStaleInteractionError } from "./interaction-memory";

describe("interaction-memory", () => {
  it("memakai store:true agar state tersimpan per sesi", () => {
    expect(STORE_INTERACTIONS).toBe(true);
    expect(interactionBaseParams(null)).toEqual({ store: true });
    expect(interactionBaseParams(undefined)).toEqual({ store: true });
  });

  it("merangkai previous_interaction_id per thread", () => {
    expect(interactionBaseParams("abc-123")).toEqual({
      store: true,
      previous_interaction_id: "abc-123",
    });
  });

  it("mendeteksi error id basi untuk fallback tanpa chaining", () => {
    expect(isStaleInteractionError(new Error("previous_interaction_id not found"))).toBe(true);
    expect(isStaleInteractionError(new Error("Interaction expired"))).toBe(true);
    expect(isStaleInteractionError(new Error("quota exceeded"))).toBe(false);
    expect(isStaleInteractionError("some random failure")).toBe(false);
  });
});
