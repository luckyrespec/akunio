import { describe, it, expect } from "vitest";
import { Money } from "@/core/money/money";
import { validateEntry, MAX_MINOR } from "@/core/journals/validate";
import { toMinor } from "@/server/db/repos/journals.repo";

function hasCode(issues: Array<{ code: string }>, code: string): boolean {
  return issues.some((i) => i.code === code);
}

describe("unifikasi money", () => {
  it("toMinor eksak pada nominal sen tanpa float", () => {
    expect(toMinor("10000.55")).toBe(1_000_055n);
    expect(toMinor("0.05")).toBe(5n);
    expect(toMinor("10000.55") + toMinor("0.05")).toBe(1_000_060n);
    expect(toMinor("0")).toBe(0n);
    expect(toMinor("-5.25")).toBe(-525n);
  });

  it("Money.fromMinor memformat sen persis", () => {
    expect(Money.fromMinor(1_000_060n).formatIdr()).toBe("Rp10.000,60");
    expect(Money.fromMinor(5n).formatIdr()).toBe("Rp0,05");
  });

  it("batas atas = kapasitas numeric(18,2)", () => {
    // 18 digit, 2 di belakang koma → minor maksimum = 10^18 - 1
    // (Rp9.999.999.999.999.999,99).
    expect(MAX_MINOR).toBe(9_999_999_999_999_999_99n);
    expect(MAX_MINOR).toBe(10n ** 18n - 1n);
  });

  it("validateEntry menolak nominal di atas batas dengan MELEBIHI_BATAS", () => {
    const huge = MAX_MINOR + 1n;
    const issues = validateEntry(
      {
        dateISO: "2026-02-10",
        memo: "huge",
        lines: [
          { accountId: "a", debitMinor: huge, creditMinor: 0n },
          { accountId: "b", debitMinor: 0n, creditMinor: huge },
        ],
      },
      "OPEN",
    );
    expect(hasCode(issues, "MELEBIHI_BATAS")).toBe(true);
  });

  it("validateEntry menerima nominal tepat di batas", () => {
    const issues = validateEntry(
      {
        dateISO: "2026-02-10",
        memo: "max",
        lines: [
          { accountId: "a", debitMinor: MAX_MINOR, creditMinor: 0n },
          { accountId: "b", debitMinor: 0n, creditMinor: MAX_MINOR },
        ],
      },
      "OPEN",
    );
    expect(hasCode(issues, "MELEBIHI_BATAS")).toBe(false);
  });
});
