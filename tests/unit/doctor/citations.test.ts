import { describe, it, expect } from "vitest";
import { validateCitations } from "@/server/doctor/citations";

const retrieved = [{ id: "c1", section: "SAK-EMKM-Bab7" }];

describe("validateCitations", () => {
  it("accepts verifiable citations", () => {
    expect(validateCitations(
      { explanation: "Penjelasan yang cukup panjang untuk lolos batas minimal karakter.", citations: [{ docId: "D", bab: "7", paragraph: "7.16" }] },
      retrieved, "D",
    ).ok).toBe(true);
  });
  it("rejects wrong doc, unmatched bab, and short explanation", () => {
    expect(validateCitations(
      { explanation: "Penjelasan yang cukup panjang untuk lolos batas minimal karakter.", citations: [{ docId: "X", bab: "7", paragraph: "7.16" }] },
      retrieved, "D",
    ).ok).toBe(false);
    expect(validateCitations(
      { explanation: "Penjelasan yang cukup panjang untuk lolos batas minimal karakter.", citations: [{ docId: "D", bab: "99", paragraph: "99.1" }] },
      retrieved, "D",
    ).ok).toBe(false);
    expect(validateCitations({ explanation: "pendek", citations: [] }, retrieved, "D").ok).toBe(false);
  });
});
