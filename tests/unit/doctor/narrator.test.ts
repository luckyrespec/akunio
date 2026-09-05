import { describe, it, expect } from "vitest";
import { generateCorrectionNarration } from "@/server/ai/correction-narrator";

describe("correction narrator (mock)", () => {
  it("returns deterministic narration citing the first chunk without API key", async () => {
    process.env.AI_MOCK = "1";
    const n = await generateCorrectionNarration({
      findingType: "duplicates",
      frameSummary: "pembalik Rp150.000 atas JE-2026-0001",
      chunks: [{ id: "c1", section: "SAK-EMKM-Bab7", content: "x" }],
      docId: "D",
    });
    expect(n.citations[0].docId).toBe("D");
    expect(n.explanation.length).toBeGreaterThanOrEqual(20);
    delete process.env.AI_MOCK;
  });

  it("throws SAK_TIDAK_TERSEDIA when no chunks", async () => {
    process.env.AI_MOCK = "1";
    await expect(generateCorrectionNarration({
      findingType: "duplicates", frameSummary: "x", chunks: [], docId: "D",
    })).rejects.toThrow("SAK_TIDAK_TERSEDIA");
    delete process.env.AI_MOCK;
  });
});
