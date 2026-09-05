import { describe, it, expect } from "vitest";
import {
  proposalChipLabel,
  citationLabel,
  proposalDetailLabel,
  findingErrorMessage,
} from "@/app/(app)/jurnal/ai/[id]/proposal-labels";

describe("proposal labels", () => {
  it("labels proposed accounts", () => {
    expect(proposalChipLabel({ accountCode: "1180", proposed: true })).toBe("akun baru");
    expect(proposalChipLabel({ accountCode: "5100", proposed: false })).toBe("periksa");
  });
  it("formats verified citations", () => {
    expect(citationLabel({ docId: "SAK-EMKM-2024", bab: "7", paragraph: "7.16" }))
      .toBe("Dok SAK-EMKM-2024 Bab 7 par. 7.16");
  });
  it("formats proposal detail from draft data only", () => {
    expect(
      proposalDetailLabel({ code: "1180", name: "Uang Muka", parentCode: "1100" }),
    ).toBe("1180 · Uang Muka · induk 1100");
  });
  it("maps raw Task 7 error codes to friendly Bahasa Indonesia", () => {
    expect(findingErrorMessage("TEMUAN_SUDAH_SELESAI")).toContain("sudah selesai");
    expect(findingErrorMessage("TIPE_TEMUAN_TIDAK_DIDUKUNG")).toContain("belum didukung");
    expect(findingErrorMessage("SITASI_TIDAK_VALID")).toContain("Sitasi SAK tidak valid");
    expect(findingErrorMessage("AKUN_PENAMPUNG_TIDAK_ADA")).toContain("Akun penampung");
    expect(findingErrorMessage("SAK_BELUM_TERSEDIA")).toContain("belum tersedia");
    expect(findingErrorMessage("SAK_BELUM_TERSEDIA: jalankan ingest dokumen")).toContain(
      "belum tersedia",
    );
    expect(findingErrorMessage("Gagal memuat data terkait")).toBe("Gagal memuat data terkait");
  });
});
