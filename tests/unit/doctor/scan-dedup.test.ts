import { describe, it, expect } from "vitest";
import { duplicates } from "@/core/doctor/rules";

describe("Doctor Scan Logic & Deduplication", () => {
  it("detects duplicate entries when neither is reversed", () => {
    const entries = [
      { memo: "Beli ATK", lines: [{ accountCode: "5101", debitMinor: "100000", creditMinor: "0" }] },
      { memo: "Beli ATK", lines: [{ accountCode: "5101", debitMinor: "100000", creditMinor: "0" }] },
    ];
    const dups = duplicates(entries);
    expect(dups.length).toBe(1);
    expect(dups[0].type).toBe("duplicates");
  });

  it("excludes reversed entries from duplicates check", () => {
    const rawEntries = [
      { id: "e1", number: "JE-001", memo: "Beli ATK", reversalOfId: null, lines: [{ accountCode: "5101", debitMinor: 100000n, creditMinor: 0n }] },
      { id: "e2", number: "JE-002", memo: "Beli ATK", reversalOfId: "e1", lines: [{ accountCode: "5101", debitMinor: 0n, creditMinor: 100000n }] },
    ];

    const reversedEntryIds = new Set<string>();
    for (const e of rawEntries) {
      if (e.reversalOfId) {
        reversedEntryIds.add(e.reversalOfId);
        reversedEntryIds.add(e.id);
      }
    }

    const active = rawEntries.filter((e) => !reversedEntryIds.has(e.id));
    const dups = duplicates(
      active.map((e) => ({
        memo: e.memo,
        lines: e.lines.map((l) => ({
          accountCode: l.accountCode,
          debitMinor: l.debitMinor.toString(),
          creditMinor: l.creditMinor.toString(),
        })),
      })),
    );

    expect(dups.length).toBe(0);
  });

  it("calculates health score ignoring resolved findings", () => {
    const allDrafts = [
      { type: "abnormalBalances", severity: "HIGH" as const, evidence: { code: "1-10001" } },
      { type: "missingReceipts", severity: "MEDIUM" as const, evidence: { entryId: "e9" } },
    ];

    const existingStatusMap = new Map<string, string>([
      ["abnormalBalances:1-10001", "resolved"],
      ["missingReceipts:e9", "open"],
    ]);

    const openDrafts = allDrafts.filter((draft) => {
      const ev = draft.evidence ?? {};
      const keyDetail = (ev as any).code || (ev as any).entryId;
      const key = `${draft.type}:${keyDetail}`;
      return existingStatusMap.get(key) === "open";
    });

    expect(openDrafts.length).toBe(1);
    expect(openDrafts[0].type).toBe("missingReceipts");

    let penalty = 0;
    penalty += openDrafts.filter((d) => d.type === "abnormalBalances").length * 15;
    penalty += openDrafts.filter((d) => d.type === "duplicates").length * 7;
    penalty += openDrafts.filter((d) => d.type === "missingReceipts").length * 5;
    penalty += openDrafts.filter((d) => d.type === "oddDates").length * 7;
    const healthScore = Math.max(0, Math.min(100, 100 - penalty));

    expect(healthScore).toBe(95);
  });
});
