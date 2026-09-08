import { describe, expect, it } from "vitest";
import { buildAkunioSystemPrompt, buildPageAngle } from "@/server/ai/persona";

describe("persona Mentor UMKM", () => {
  it("menegaskan identitas Akunio bukan Nara", () => {
    const s = buildAkunioSystemPrompt({});
    expect(s).toMatch(/Namamu adalah Akunio/);
    expect(s).toMatch(/jangan pernah mengaku bernama Nara/);
  });
  it("sudut dasbor = analis, aturan = pengajar SAK", () => {
    expect(buildPageAngle("Dasbor")).toMatch(/analis/i);
    expect(buildPageAngle("Aturan")).toMatch(/SAK/);
  });
  it("blok ingatan disisipkan bila ada", () => {
    const s = buildAkunioSystemPrompt({ memoryBlock: "Ingatan tersimpan:\n- Toko Maju, tutup buku tiap tgl 5" });
    expect(s).toContain("Toko Maju");
  });
  it("tanpa ingatan tidak ada header ingatan", () => {
    expect(buildAkunioSystemPrompt({})).not.toContain("Ingatan tersimpan:");
  });
});
