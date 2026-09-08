import { describe, it, expect, beforeEach } from "vitest";
import { truncateAll, makeOrg } from "./helpers";
import { withOrg } from "@/server/db/repos/with-org";
import { ensureFiscalYearPeriods, listPeriods } from "@/server/db/repos/periods.repo";

describe("ensureFiscalYearPeriods", () => {
  beforeEach(async () => { await truncateAll(); });

  it("buat 12 bulan, idempoten, lewati yang sudah ada", async () => {
    const { orgId } = await makeOrg("tahun");
    const first = await withOrg(orgId, (tx) => ensureFiscalYearPeriods(tx, orgId, 2027));
    expect(first).toEqual({ year: 2027, created: 12 });
    const again = await withOrg(orgId, (tx) => ensureFiscalYearPeriods(tx, orgId, 2027));
    expect(again.created).toBe(0);
    const periods = await withOrg(orgId, (tx) => listPeriods(tx, orgId));
    expect(periods.map((p) => p.name)).toEqual(
      Array.from({ length: 12 }, (_, i) => `2027-${String(i + 1).padStart(2, "0")}`),
    );
    expect(periods[0]).toMatchObject({ startsOn: "2027-01-01", endsOn: "2027-01-31", status: "OPEN" });
    expect(periods[1]).toMatchObject({ startsOn: "2027-02-01", endsOn: "2027-02-28", status: "OPEN" });
  });

  it("tahun lalu bisa dibuat; tahun aneh ditolak", async () => {
    const { orgId } = await makeOrg("tahun-lalu");
    const past = await withOrg(orgId, (tx) => ensureFiscalYearPeriods(tx, orgId, 2024));
    expect(past.created).toBe(12);
    await expect(
      withOrg(orgId, (tx) => ensureFiscalYearPeriods(tx, orgId, 1999)),
    ).rejects.toThrow("TAHUN_TIDAK_VALID");
    await expect(
      withOrg(orgId, (tx) => ensureFiscalYearPeriods(tx, orgId, 2027.5)),
    ).rejects.toThrow("TAHUN_TIDAK_VALID");
  });
});
