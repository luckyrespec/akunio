import { describe, it, expect } from "vitest";
import { chunkIfsSection, chunkJournal } from "./chunking";

describe("chunkIfsSection", () => {
  it("splits 1000-token input into 3 chunks with 60 overlap", () => {
    const text = Array.from({ length: 1000 }, (_, i) => `tok${i}`).join(" ");
    const chunks = chunkIfsSection(text, "Section 10");
    expect(chunks.length).toBe(3);
    expect(chunks[0].metadata.section).toBe("Section 10");
    expect(chunks[0].metadata.chunk_index).toBe(0);
    // Overlap: last 60 tokens of chunk 0 should equal first 60 of chunk 1
    const c0Tokens = chunks[0].content.split(" ");
    const c1Tokens = chunks[1].content.split(" ");
    expect(c0Tokens.slice(-60)).toEqual(c1Tokens.slice(0, 60));
  });

  it("handles short text as single chunk", () => {
    const chunks = chunkIfsSection("hello world", "Intro");
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toBe("hello world");
  });
});

describe("chunkJournal", () => {
  it("contains JE number", () => {
    const content = chunkJournal({
      number: "JE-2026-0001",
      entryDate: "2026-01-15",
      memo: "Beli perlengkapan",
      lines: [{ accountCode: "5900", debitText: "500.000", creditText: "" }],
    });
    expect(content).toContain("JE-2026-0001");
    expect(content).toContain("Beli perlengkapan");
  });
});
