import { describe, it, expect } from "vitest";
import { buildConfirmationText } from "@/server/ai/confirmation-text";

describe("buildConfirmationText", () => {
  it("post_journal memuat nomor dan memo", () => {
    const text = buildConfirmationText("post_journal", {
      number: "JE-2026-0007",
      memo: "Setoran modal awal",
    });
    expect(text).toContain("JE-2026-0007");
    expect(text).toContain("Setoran modal awal");
  });

  it("create_journal_draft memuat memo", () => {
    const text = buildConfirmationText("create_journal_draft", {
      id: "draft-1",
      memo: "Bayar sewa ruko",
    });
    expect(text).toContain("Bayar sewa ruko");
  });

  it("tool tak dikenal → fallback generik non-kosong", () => {
    const text = buildConfirmationText("tool_tak_ada", {});
    expect(text.trim().length).toBeGreaterThan(0);
  });
});
