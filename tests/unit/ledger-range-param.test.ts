import { describe, it, expect } from "vitest";
import { resolveLedgerRange } from "@/lib/ledger-range";

describe("resolveLedgerRange", () => {
  it("kosong → undefined (tampil semua)", () => {
    expect(resolveLedgerRange({})).toBeUndefined();
  });
  it("tanggal rusak diabaikan", () => {
    expect(resolveLedgerRange({ dari: "kemarin", sampai: "2026-13-40" })).toBeUndefined();
  });
  it("dari+sampai valid diteruskan", () => {
    expect(resolveLedgerRange({ dari: "2026-09-01", sampai: "2026-09-30" })).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });
  it("satu sisi valid dipakai, sisi rusak dibuang", () => {
    expect(resolveLedgerRange({ dari: "2026-09-01", sampai: "rusak" })).toEqual({
      from: "2026-09-01",
      to: undefined,
    });
  });
  it("dari > sampai → undefined (hindari tabel kosong membingungkan)", () => {
    expect(resolveLedgerRange({ dari: "2026-09-30", sampai: "2026-09-01" })).toBeUndefined();
  });
  it("preset bulan-ini dari today", () => {
    expect(resolveLedgerRange({ preset: "bulan-ini", today: "2026-09-15" })).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });
  it("preset bulan-lalu", () => {
    expect(resolveLedgerRange({ preset: "bulan-lalu", today: "2026-09-15" })).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
  });
  it("preset tahun-berjalan", () => {
    expect(resolveLedgerRange({ preset: "tahun-berjalan", today: "2026-09-15" })).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });
  it("preset semua → undefined", () => {
    expect(resolveLedgerRange({ preset: "semua", today: "2026-09-15" })).toBeUndefined();
  });
  it("eksplisit mengalahkan preset", () => {
    expect(
      resolveLedgerRange({ preset: "tahun-berjalan", dari: "2026-09-01", sampai: "2026-09-30", today: "2026-09-15" }),
    ).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });
});
