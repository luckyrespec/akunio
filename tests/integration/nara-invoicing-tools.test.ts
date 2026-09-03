import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { executeNaraTool } from "@/server/ai/nara-tools";
import { db } from "@/server/db";
import { accounts } from "@/server/db/schema/org";
import { eq, and } from "drizzle-orm";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Nara Invoicing Tools", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Nara Invoicing Tool Test")).orgId;
    await seedOrgData(orgId);
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("creates an invoice via Nara create_invoice tool", async () => {
    const res = await executeNaraTool(orgId, "test@test.id", "create_invoice", {
      type: "INVOICE",
      customerName: "Bu Sarah Katering",
      customerPhone: "081298765432",
      dueDate: "2026-09-20",
      items: [
        {
          description: "Nasi Kotak Ayam Bakar (20 porsi)",
          quantity: 20,
          unitPrice: 25000,
          taxRate: 0,
        },
      ],
    });

    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
    const data = res.data as Record<string, unknown>;
    expect(data.invoiceNumber).toBeDefined();
    expect(data.totalFormatted).toBe("Rp500.000");

    // Check aging via get_ar_ap_aging tool
    const agingRes = await executeNaraTool(orgId, "test@test.id", "get_ar_ap_aging", {
      type: "INVOICE",
    });
    expect(agingRes.success).toBe(true);
    const agingData = agingRes.data as Record<string, unknown>;
    expect(agingData.totalOutstandingFormatted).toBe("Rp500.000");
  });
});
