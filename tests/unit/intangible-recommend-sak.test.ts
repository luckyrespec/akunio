import { describe, expect, it, afterEach } from "vitest";
import { recommendIntangibleWithSak } from "@/server/ai/intangible-recommend";

const savedMock = process.env.AI_MOCK;
const savedKey = process.env.GEMINI_API_KEY;

afterEach(() => {
  if (savedMock === undefined) delete process.env.AI_MOCK;
  else process.env.AI_MOCK = savedMock;
  if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = savedKey;
});

describe("recommendIntangibleWithSak (luring)", () => {
  it("AI_MOCK=1 tanpa network, kategori lisensi", async () => {
    process.env.AI_MOCK = "1";
    const r = await recommendIntangibleWithSak("Lisensi Akuntansi Awan", "LAINNYA");
    expect(r.heuristic).toBe(true);
    expect(r.category).toBe("LISENSI_SOFTWARE");
    expect(r.sakRef).toContain("Bab 12");
    expect(r.analysis.length).toBeGreaterThan(0);
  });

  it("tanpa API key jatuh ke heuristik", async () => {
    delete process.env.AI_MOCK;
    delete process.env.GEMINI_API_KEY;
    const r = await recommendIntangibleWithSak("Merek Dagang Kopi", "LAINNYA");
    expect(r.heuristic).toBe(true);
    expect(r.category).toBe("MEREK_DAGANG");
  });
});
