import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSuggestionsCache,
  FALLBACK_SUGGESTIONS,
  generatePersonalSuggestions,
} from "@/server/ai/suggestions";

beforeEach(() => {
  clearSuggestionsCache();
  delete process.env.GEMINI_API_KEY;
});

describe("suggest page-aware", () => {
  it("fallback tetap 8 item dengan batas panjang", async () => {
    const r = await generatePersonalSuggestions("org-sug-1");
    expect(r).toHaveLength(8);
    for (const s of r) {
      expect(s.label.length).toBeLessThanOrEqual(28);
      expect(s.prompt.length).toBeLessThanOrEqual(80);
    }
    expect(r).toEqual(FALLBACK_SUGGESTIONS);
  });

  it("/jurnal menaikkan saran jurnal ke depan", async () => {
    const r = await generatePersonalSuggestions("org-sug-2", { pagePath: "/jurnal" });
    expect(r).toHaveLength(8);
    expect(`${r[0].label} ${r[0].prompt}`).toMatch(/jurnal|draft|catat/i);
  });

  it("/kas-bank menaikkan saran kas ke depan", async () => {
    const r = await generatePersonalSuggestions("org-sug-3", { pagePath: "/kas-bank" });
    expect(r).toHaveLength(8);
    expect(`${r[0].label} ${r[0].prompt}`).toMatch(/kas|bank|saldo|bayar/i);
  });

  it("halaman tak dikenal tidak mengubah urutan", async () => {
    const r = await generatePersonalSuggestions("org-sug-4", { pagePath: "/pengaturan" });
    expect(r).toEqual(FALLBACK_SUGGESTIONS);
  });
});
