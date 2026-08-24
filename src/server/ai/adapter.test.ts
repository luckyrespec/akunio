import { describe, it, expect } from "vitest";
import { generateJournalDraft } from "./adapter";
import { MOCK_TEXT_DRAFT } from "./fixtures";
import { DraftEntrySchema } from "./schema";

process.env.AI_MOCK = "1";

const accounts = [
  { code: "1110", name: "Kas", normal: "D" as const },
  { code: "5900", name: "Beban Lain-lain", normal: "D" as const },
];

describe("generateJournalDraft (mock)", () => {
  it("returns the text fixture for TEXT kind", async () => {
    const d = await generateJournalDraft({
      kind: "TEXT", text: "beli perlengkapan", accounts, todayISO: "2026-01-15",
    });
    expect(d).toEqual(MOCK_TEXT_DRAFT);
    expect(() => DraftEntrySchema.parse(d)).not.toThrow();
  });

  it("returns the document fixture for DOCUMENT kind", async () => {
    const d = await generateJournalDraft({
      kind: "DOCUMENT",
      document: { dataBase64: "aGk=", mime: "application/pdf" },
      accounts,
      todayISO: "2026-01-15",
    });
    expect(d.lines.length).toBeGreaterThanOrEqual(2);
  });

  it("prompt embeds accounts, rules and user text", async () => {
    const { buildDraftPrompt } = await import("./prompt");
    const p = buildDraftPrompt({ accounts, todayISO: "2026-01-15", text: "bayar sewa" });
    expect(p).toContain("1110 | Kas | normal DEBIT");
    expect(p).toContain("bayar sewa");
    expect(p).toContain("2026-01-15");
  });
});
