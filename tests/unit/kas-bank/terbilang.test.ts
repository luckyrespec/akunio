import { describe, it, expect } from "vitest";
import { terbilangRupiah } from "@/core/money/terbilang";

describe("terbilangRupiah", () => {
  it("menyebut nominal kecil", () => {
    expect(terbilangRupiah(0n)).toBe("Nol rupiah");
    expect(terbilangRupiah(100n)).toBe("Satu rupiah");
    expect(terbilangRupiah(1100n)).toBe("Sebelas rupiah");
    expect(terbilangRupiah(2500n)).toBe("Dua puluh lima rupiah");
  });
  it("ratusan dan ribuan khusus", () => {
    expect(terbilangRupiah(10000n)).toBe("Seratus rupiah");
    expect(terbilangRupiah(100000n)).toBe("Seribu rupiah");
    expect(terbilangRupiah(1_000_000n)).toBe("Sepuluh ribu rupiah");
    expect(terbilangRupiah(10_000_000n)).toBe("Seratus ribu rupiah");
  });
  it("jutaan ke atas", () => {
    expect(terbilangRupiah(150_000_000n)).toBe(
      "Satu juta lima ratus ribu rupiah"
    );
    expect(terbilangRupiah(2_000_000_000n)).toBe("Dua puluh juta rupiah");
    expect(terbilangRupiah(1_500_000_000_00n)).toBe(
      "Satu miliar lima ratus juta rupiah"
    );
  });
  it("menyebut sen bila ada", () => {
    expect(terbilangRupiah(150050n)).toBe(
      "Seribu lima ratus rupiah lima puluh sen"
    );
  });
});
