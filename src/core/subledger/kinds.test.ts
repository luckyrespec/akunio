import { describe, expect, it } from "vitest";
import { moduleLabelForKind, validateSubledgerControl } from "./guard";
import { SUBLEDGER_LIST_ROUTE, SUBLEDGER_KIND_LABEL } from "./cards";

describe("subledger kinds baru", () => {
  it("label modul dikenali guard", () => {
    expect(moduleLabelForKind("DIMUKA")).toBe("Sewa Dibayar di Muka");
    expect(moduleLabelForKind("ASET_TETAP")).toBe("Aset Tetap");
  });
  it("route dan label kartu terdaftar", () => {
    expect(SUBLEDGER_LIST_ROUTE.DIMUKA).toBe("/buku-pembantu/dimuka");
    expect(SUBLEDGER_LIST_ROUTE.ASET_TETAP).toBe("/buku-pembantu/aset");
    expect(SUBLEDGER_KIND_LABEL.DIMUKA).toBe("Dimuka per Kontrak");
  });
  it("jurnal manual menyentuh 1600 ditolak walau tanpa links", () => {
    const issues = validateSubledgerControl({
      lines: [{ accountId: "acc-1600", debitMinor: 100000n, creditMinor: 0n }],
      controlByAccountId: new Map([["acc-1600", "DIMUKA"]]),
      source: "MANUAL",
    });
    expect(issues).toEqual([{ code: "AKUN_KONTROL_WAJIB_VIA_MODUL", index: 0, kind: "DIMUKA" }]);
  });
  it("source DIMUKA dengan links senilai diterima", () => {
    const issues = validateSubledgerControl({
      lines: [{
        accountId: "acc-1600", debitMinor: 0n, creditMinor: 100000n,
        links: [{ kind: "DIMUKA", refId: "c1", amountMinor: 100000n }],
      }],
      controlByAccountId: new Map([["acc-1600", "DIMUKA"]]),
      source: "DIMUKA",
    });
    expect(issues).toEqual([]);
  });
});
