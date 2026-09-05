import { describe, it, expect } from "vitest";
import { seedSakChunks } from "@/server/ai/seed-sak";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BAB_FIXTURE = [
  "BAB 7",
  "KEBIJAKAN AKUNTANSI, ESTIMASI, DAN KESALAHAN",
  "",
  "Paragraf contoh pertama tentang koreksi kesalahan periode lalu secara retrospektif.",
  "Paragraf contoh kedua tentang estimasi akuntansi yang diakui prospektif.",
].join("\n");

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("sak ingest", () => {
  it("splits per BAB, sections prefixed, source registered", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sak-"));
    const p = join(dir, "sak.md");
    writeFileSync(p, `${BAB_FIXTURE}\n\nBAB 9\n\nParagraf contoh tentang persediaan diukur sebesar biaya perolehan.`);
    const fakeEmbed = async () => new Array(768).fill(0.01);
    const res = await seedSakChunks(p, {
      docId: `TEST-SAK-${crypto.randomUUID()}`,
      version: "vTEST",
      embedText: fakeEmbed,
    });
    expect(res.chunks).toBeGreaterThanOrEqual(2);
    const { db } = await import("@/server/db");
    const rows = (await db.execute(
      `SELECT section FROM ifrs_chunks WHERE section LIKE 'SAK-EMKM-%' LIMIT 5`,
    ) as unknown as { rows: Array<{ section: string }> }).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.section.startsWith("SAK-EMKM"))).toBe(true);
  });
});
