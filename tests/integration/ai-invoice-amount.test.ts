import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { executeNaraTool } from "@/server/ai/nara-tools";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("AI invoice exact-minor", () => {
  let orgId: string;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT AI Exact")).orgId;
    await seedOrgData(orgId);
  });
  afterAll(async () => {
    await admin.end();
    await truncateAll();
  });

  async function invoiceTotal(invoiceNumber: string): Promise<bigint> {
    const r = await admin.query<{ total_minor: string }>(
      `SELECT total_minor FROM invoices WHERE org_id=$1 AND invoice_number=$2`,
      [orgId, invoiceNumber],
    );
    return BigInt(r.rows[0].total_minor);
  }

  it("create_invoice desimal eksak (100.5 x 2 = 201.00)", async () => {
    const res = await executeNaraTool(orgId, "t@t.id", "create_invoice", {
      type: "INVOICE",
      customerName: "Bu Exact",
      dueDate: "2026-09-20",
      items: [{ description: "Item Desimal", quantity: 2, unitPrice: "100.5", taxRate: 0 }],
    });
    expect(res.success).toBe(true);
    const data = res.data as Record<string, unknown>;
    expect(await invoiceTotal(String(data.invoiceNumber))).toBe(20_100n);
  });

  it("create_invoice tiga desimal ditolak (bukan dibulatkan diam-diam)", async () => {
    const res = await executeNaraTool(orgId, "t@t.id", "create_invoice", {
      type: "INVOICE",
      customerName: "Bu Exact",
      dueDate: "2026-09-20",
      items: [{ description: "Item Jahat", quantity: 1, unitPrice: "1.005", taxRate: 0 }],
    });
    expect(res.success).toBe(false);
  });
});
