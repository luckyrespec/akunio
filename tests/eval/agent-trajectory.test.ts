import { describe, it, expect } from "vitest";
import { matchTrajectory } from "@/server/ai/eval/trajectory";

const GOLDEN = [
  "extract_invoice",
  "detect_duplicate_invoice",
  "get_tax_rule",
  "search_account",
  "create_journal_draft",
  "validate_journal_entry",
  "request_approval",
];

describe("trajectory", () => {
  it("IN_ORDER toleran tool baca tambahan", () => {
    expect(
      matchTrajectory(
        [
          "extract_invoice",
          "list_accounts",
          "detect_duplicate_invoice",
          "get_tax_rule",
          "search_account",
          "create_journal_draft",
          "validate_journal_entry",
          "request_approval",
        ],
        GOLDEN,
        "IN_ORDER",
      ),
    ).toBe(true);
  });

  it("post tanpa approval = FAIL", () => {
    expect(matchTrajectory(["extract_invoice", "post_journal"], GOLDEN, "IN_ORDER")).toBe(false);
  });

  it("EXACT menolak ekstra dan menerima identik", () => {
    expect(matchTrajectory([...GOLDEN, "list_accounts"], GOLDEN, "EXACT")).toBe(false);
    expect(matchTrajectory([...GOLDEN], GOLDEN, "EXACT")).toBe(true);
  });

  it("ANY_ORDER acak + ekstra lolos, hilang satu gagal", () => {
    expect(
      matchTrajectory(
        [
          "request_approval",
          "list_accounts",
          "validate_journal_entry",
          "create_journal_draft",
          "search_account",
          "get_tax_rule",
          "detect_duplicate_invoice",
          "extract_invoice",
        ],
        GOLDEN,
        "ANY_ORDER",
      ),
    ).toBe(true);
    const missing = GOLDEN.slice(0, GOLDEN.length - 1);
    expect(matchTrajectory(missing, GOLDEN, "ANY_ORDER")).toBe(false);
  });

  it("IN_ORDER urutan terbalik dua tool = FAIL", () => {
    const swapped = [...GOLDEN];
    const a = swapped[2];
    swapped[2] = swapped[3];
    swapped[3] = a;
    expect(matchTrajectory(swapped, GOLDEN, "IN_ORDER")).toBe(false);
  });
});

const INVOICE_GOLDEN = [
  "extract_invoice",
  "detect_duplicate_invoice",
  "validate_invoice",
  "find_contact",
];

describe("trajectory invoice_agent (BILL-only)", () => {
  it("IN_ORDER golden invoice toleran tool baca ekstra", () => {
    expect(
      matchTrajectory(
        [
          "extract_invoice",
          "list_contacts",
          "detect_duplicate_invoice",
          "get_server_time",
          "validate_invoice",
          "find_contact",
        ],
        INVOICE_GOLDEN,
        "IN_ORDER",
      ),
    ).toBe(true);
  });

  it("posting langsung (post_journal) setelah extract = FAIL", () => {
    expect(matchTrajectory(["extract_invoice", "post_journal"], INVOICE_GOLDEN, "IN_ORDER")).toBe(
      false,
    );
  });
});
