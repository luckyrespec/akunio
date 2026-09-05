import { describe, it, expect } from "vitest";
import { DraftEntrySchema } from "./schema";

const base = {
  dateISO: "2022-07-01",
  memo: "Pencatatan aset laptop dari modal disetor",
  overallConfidence: 0.9,
  explanation: "Aset laptop Rp10.000.000 dari modal disetor",
};

describe("DraftEntrySchema sisi kosong", () => {
  it("menerima '0' string sebagai sisi kosong (output umum model)", () => {
    const res = DraftEntrySchema.safeParse({
      ...base,
      lines: [
        { accountCode: "1500", debitText: "10000000", creditText: "0", confidence: 0.9, reason: "aset" },
        { accountCode: "3100", debitText: "0", creditText: "10000000", confidence: 0.9, reason: "modal" },
      ],
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.lines[0]?.creditText).toBe("");
      expect(res.data.lines[1]?.debitText).toBe("");
    }
  });

  it("menerima 0 numerik sebagai sisi kosong", () => {
    const res = DraftEntrySchema.safeParse({
      ...base,
      lines: [
        { accountCode: "1500", debitText: "10000000", creditText: 0, confidence: 0.9, reason: "aset" },
        { accountCode: "3100", debitText: 0, creditText: "10000000", confidence: 0.9, reason: "modal" },
      ],
    });
    expect(res.success).toBe(true);
  });

  it("tetap menolak baris yang dua sisinya terisi", () => {
    const res = DraftEntrySchema.safeParse({
      ...base,
      lines: [
        { accountCode: "1500", debitText: "10000000", creditText: "5000", confidence: 0.9, reason: "aset" },
        { accountCode: "3100", debitText: "", creditText: "10000000", confidence: 0.9, reason: "modal" },
      ],
    });
    expect(res.success).toBe(false);
  });
});
