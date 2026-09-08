import { describe, expect, it } from "vitest";
import {
  friendlyToolLabel,
  shouldRenderTrace,
  thinkingTriggerLabel,
} from "@/components/ai-elements/tool-labels";

describe("friendlyToolLabel", () => {
  it("memetakan tool dikenal ke Bahasa Indonesia tanpa nama mentah", () => {
    expect(friendlyToolLabel("get_daily_briefing")).toBe("Ringkasan Briefing Harian");
    expect(friendlyToolLabel("create_journal_draft")).toBe("Menyusun Draf Jurnal");
    expect(friendlyToolLabel("get_report")).toBe("Membaca Laporan");
  });
  it("tidak pernah membocorkan nama mentah snake_case", () => {
    for (const raw of ["get_daily_briefing", "post_journal", "tool_tak_dikenal_xyz"]) {
      expect(friendlyToolLabel(raw)).not.toContain("_");
    }
  });
  it("fallback rapi untuk tool tak dikenal", () => {
    expect(friendlyToolLabel("list_cash_entries")).toBe("Memeriksa Kas & Bank");
  });
});

describe("thinkingTriggerLabel", () => {
  it("streaming memakai tulisan thinking", () => {
    expect(thinkingTriggerLabel(true, 0)).toMatch(/thinking/i);
  });
  it("selesai memakai frasa selesai", () => {
    expect(thinkingTriggerLabel(false, 2)).toMatch(/selesai/i);
  });
});

describe("shouldRenderTrace", () => {
  it("false bila tanpa reasoning dan tanpa tool", () => {
    expect(shouldRenderTrace({ reasoning: "", tools: [] })).toBe(false);
    expect(shouldRenderTrace({ reasoning: null, tools: [] })).toBe(false);
  });
  it("true bila ada reasoning saja", () => {
    expect(shouldRenderTrace({ reasoning: "cek saldo", tools: [] })).toBe(true);
  });
  it("true bila ada tool saja", () => {
    expect(shouldRenderTrace({ reasoning: "", tools: [{ toolName: "get_report" }] })).toBe(true);
  });
});
