import { describe, expect, it } from "vitest";
import { extractExplicitMemory, formatMemoriesForPrompt } from "@/server/ai/memory-extractor";

describe("memory-extractor", () => {
  it("tangkap perintah ingat eksplisit", () => {
    const r = extractExplicitMemory("ingat ya, tutup buku tiap tanggal 5");
    expect(r?.content).toContain("tanggal 5");
    expect(["PROFILE", "PREFERENCE", "FACT"]).toContain(r?.kind);
  });
  it("abaikan chat biasa", () => {
    expect(extractExplicitMemory("berapa saldo kas bulan ini?")).toBeNull();
  });
  it("format blok prompt kosong bila tak ada ingatan", () => {
    expect(formatMemoriesForPrompt([])).toBe("");
  });
  it("format blok berisi ≤20 item dengan header", () => {
    const s = formatMemoriesForPrompt([
      { id: "1", orgId: "o", kind: "FACT", content: "Tutup buku tgl 5", source: "user", sourceThreadId: null, updatedAt: new Date() },
    ]);
    expect(s).toContain("Ingatan tersimpan:");
    expect(s).toContain("Tutup buku tgl 5");
  });
});
