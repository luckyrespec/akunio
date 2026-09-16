import { describe, expect, it } from "vitest";
import { buildAkunioSystemPrompt, buildPageAngle } from "@/server/ai/persona";

describe("persona Mentor UMKM", () => {
  it("menegaskan identitas Akunio bukan Nara", () => {
    const s = buildAkunioSystemPrompt({});
    expect(s).toMatch(/Namamu adalah Akunio/);
    expect(s).toMatch(/jangan pernah mengaku bernama Nara/);
  });
  it("sudut dashboard = analis, aturan = pengajar SAK", () => {
    expect(buildPageAngle("Dashboard")).toMatch(/analis/i);
    expect(buildPageAngle("Aturan")).toMatch(/SAK/);
  });
  it("blok ingatan disisipkan bila ada", () => {
    const s = buildAkunioSystemPrompt({ memoryBlock: "Ingatan tersimpan:\n- Toko Maju, tutup buku tiap tgl 5" });
    expect(s).toContain("Toko Maju");
  });
  it("tanpa ingatan tidak ada header ingatan", () => {
    expect(buildAkunioSystemPrompt({})).not.toContain("Ingatan tersimpan:");
  });
  it("aturan sitasi selektif: marker sak:/jurnal:, tanpa daftar sumber", () => {
    const s = buildAkunioSystemPrompt({});
    expect(s).toContain("sak:11:11.1-11.3");
    expect(s).toContain("jurnal:JE-2026-0004");
    expect(s).toMatch(/tanpa sitasi sama sekali/i);
  });
});
