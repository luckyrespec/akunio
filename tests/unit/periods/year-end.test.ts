import { describe, it, expect } from "vitest";
import { getYearEndPromptState } from "@/core/periods/year-end";

describe("getYearEndPromptState", () => {
  it("di luar Desember: mati total", () => {
    const s = getYearEndPromptState({ todayISO: "2026-09-07", decPeriodStatus: "OPEN", dismissedPeriod: null });
    expect(s.showBanner).toBe(false);
    expect(s.showModal).toBe(false);
  });

  it("Desember + OPEN + belum dismiss: banner dan modal", () => {
    const s = getYearEndPromptState({ todayISO: "2026-12-05", decPeriodStatus: "OPEN", dismissedPeriod: null });
    expect(s).toMatchObject({ active: true, year: 2026, periodName: "2026-12", showBanner: true, showModal: true, forceModal: false });
  });

  it("sudah dismiss: banner saja, modal tidak", () => {
    const s = getYearEndPromptState({ todayISO: "2026-12-05", decPeriodStatus: "OPEN", dismissedPeriod: "2026-12" });
    expect(s.showBanner).toBe(true);
    expect(s.showModal).toBe(false);
  });

  it("7 hari terakhir: modal paksa walau sudah dismiss", () => {
    const s = getYearEndPromptState({ todayISO: "2026-12-28", decPeriodStatus: "OPEN", dismissedPeriod: "2026-12" });
    expect(s.showModal).toBe(true);
    expect(s.forceModal).toBe(true);
  });

  it("Desember sudah CLOSED / tanpa periode: mati", () => {
    expect(getYearEndPromptState({ todayISO: "2026-12-10", decPeriodStatus: "CLOSED", dismissedPeriod: null }).showBanner).toBe(false);
    expect(getYearEndPromptState({ todayISO: "2026-12-10", decPeriodStatus: null, dismissedPeriod: null }).showModal).toBe(false);
  });
});
