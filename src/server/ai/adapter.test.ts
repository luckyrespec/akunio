import { describe, it, expect, vi, beforeEach } from "vitest";
import { MOCK_TEXT_DRAFT, MOCK_DOCUMENT_DRAFT } from "./fixtures";
import { DraftEntrySchema } from "./schema";

vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: class {
      interactions = {
        create: vi.fn(async ({ input }: { input: unknown }) => {
          const text = JSON.stringify(input);
          // crude: if input contains document-like mime, return document draft
          const isDoc = text.includes("application/pdf") || text.includes("document");
          // detect via isDoc flag from content? fallback to MOCK_TEXT_DRAFT vs DOCUMENT
          // The adapter sends kind via prompt? For test we inspect if input has document content
          // Simpler: if the test passes DOCUMENT kind, the adapter will include document mime; so check for "aGk=" base64 marker
          const draft = text.includes("aGk=") ? MOCK_DOCUMENT_DRAFT : MOCK_TEXT_DRAFT;
          return { output_text: JSON.stringify(draft) };
        }),
      };
    },
  };
});

const accounts = [
  { code: "1110", name: "Kas", normal: "D" as const },
  { code: "5900", name: "Beban Lain-lain", normal: "D" as const },
];

describe("generateJournalDraft (mocked Gemini)", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
  });
  it("returns the text fixture for TEXT kind", async () => {
    const { generateJournalDraft } = await import("./adapter");
    const d = await generateJournalDraft({
      kind: "TEXT", text: "beli perlengkapan", accounts, todayISO: "2026-01-15",
    });
    expect(d).toEqual(MOCK_TEXT_DRAFT);
    expect(() => DraftEntrySchema.parse(d)).not.toThrow();
  });

  it("returns the document fixture for DOCUMENT kind", async () => {
    const { generateJournalDraft } = await import("./adapter");
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
