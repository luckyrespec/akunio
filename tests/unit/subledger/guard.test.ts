import { describe, it, expect } from "vitest";
import { validateSubledgerControl } from "@/core/subledger/guard";

const controls = new Map([["acc-pers", "PERSEDIAAN" as const]]);
const line = (over: Record<string, unknown> = {}) => ({
  accountId: "acc-pers", debitMinor: 0n, creditMinor: 7_500_000n, ...over,
});

describe("validateSubledgerControl", () => {
  it("MANUAL ke akun kontrol ditolak", () => {
    const issues = validateSubledgerControl({ lines: [line()], controlByAccountId: controls, source: "MANUAL" });
    expect(issues).toEqual([{ code: "AKUN_KONTROL_WAJIB_VIA_MODUL", index: 0, kind: "PERSEDIAAN" }]);
  });

  it("AI dan IMPORT juga ditolak", () => {
    for (const source of ["AI", "IMPORT"] as const) {
      const issues = validateSubledgerControl({ lines: [line()], controlByAccountId: controls, source });
      expect(issues[0]?.code).toBe("AKUN_KONTROL_WAJIB_VIA_MODUL");
    }
  });

  it("modul tanpa links ditolak", () => {
    const issues = validateSubledgerControl({ lines: [line()], controlByAccountId: controls, source: "DOCUMENT" });
    expect(issues).toEqual([{ code: "SUBLEDGER_REF_WAJIB", index: 0, kind: "PERSEDIAAN" }]);
  });

  it("kind link salah ditolak", () => {
    const issues = validateSubledgerControl({
      lines: [line({ links: [{ kind: "PIUTANG", refId: "c1", amountMinor: 7_500_000n }] })],
      controlByAccountId: controls, source: "DOCUMENT",
    });
    expect(issues[0]).toMatchObject({ code: "SUBLEDGER_KIND_TIDAK_COCok", expected: "PERSEDIAAN", actual: "PIUTANG" });
  });

  it("total link tidak sama ditolak", () => {
    const issues = validateSubledgerControl({
      lines: [line({ links: [{ kind: "PERSEDIAAN", refId: "i1", amountMinor: 7_800_000n }] })],
      controlByAccountId: controls, source: "DOCUMENT",
    });
    expect(issues[0]).toMatchObject({ code: "SUBLEDGER_TOTAL_TIDAK_COCok", expectedMinor: 7_500_000n, actualMinor: 7_800_000n });
  });

  it("agregat N link yang pas lolos (kasus HPP multi-SKU)", () => {
    const issues = validateSubledgerControl({
      lines: [line({ links: [
        { kind: "PERSEDIAAN", refId: "i1", amountMinor: 5_000_000n, qty: 20 },
        { kind: "PERSEDIAAN", refId: "i2", amountMinor: 2_500_000n, qty: 10 },
      ] })],
      controlByAccountId: controls, source: "DOCUMENT",
    });
    expect(issues).toEqual([]);
  });

  it("saldo awal onboarding bypass", () => {
    const issues = validateSubledgerControl({ lines: [line()], controlByAccountId: controls, source: "MANUAL", isOpeningBalance: true });
    expect(issues).toEqual([]);
  });

  it("akun non-kontrol tidak diperiksa", () => {
    const issues = validateSubledgerControl({
      lines: [{ accountId: "acc-beban", debitMinor: 1_000n, creditMinor: 0n }],
      controlByAccountId: controls, source: "MANUAL",
    });
    expect(issues).toEqual([]);
  });
});
