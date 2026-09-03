import { describe, it, expect } from "vitest";
import { parseBusinessType } from "@/server/onboarding/parse";
import type { BusinessType } from "@/core/accounts/business-types";

// Locked Indonesian phrase → template mapping (deterministic parser, no LLM).
const CASES: Array<{ input: string; expected: BusinessType }> = [
  { input: "warteg di Tebet", expected: "KULINER" },
  { input: "jualan baju di shopee", expected: "ONLINE_RESALE" },
  { input: "kos 10 pintu di Jogja", expected: "KOS_PROPERTI" },
  { input: "bengkel motor", expected: "JASA" },
  { input: "toko kelontong", expected: "DAGANG" },
  { input: "konveksi seragam sekolah", expected: "MANUFAKTUR" },
  { input: "coffee shop specialty", expected: "KULINER" },
  { input: "jasa desain logo", expected: "JASA" },
  { input: "reseller skincare tiktok", expected: "ONLINE_RESALE" },
  { input: "kontrakan 5 petak", expected: "KOS_PROPERTI" },
];

describe("onboarding business-type mapping", () => {
  for (const c of CASES) {
    it(`"${c.input}" → ${c.expected}`, () => {
      expect(parseBusinessType(c.input)).toBe(c.expected);
    });
  }
});
