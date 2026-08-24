import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("documents repo", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  const adminDb = drizzle(admin);
  let orgId: string;

  beforeAll(async () => { await truncateAll(); orgId = (await makeOrg("PT Doc")).orgId; });
  afterAll(async () => { await admin.end(); await truncateAll(); });

  it("creates a row and transitions status with extracted payload", async () => {
    const { createDocumentRow, setDocumentStatus } =
      await import("@/server/db/repos/documents.repo");
    const { db } = await import("@/server/db");

    const row = await db.transaction((tx) => createDocumentRow(tx, {
      orgId, storageKey: `orgs/${orgId}/a.pdf`, mime: "application/pdf", sizeBytes: 10,
    }));
    expect(row.status).toBe("UPLOADED");

    const upd = await db.transaction((tx) =>
      setDocumentStatus(tx, orgId, row.id, "EXTRACTED", { merchant: "Toko X" }));
    expect(upd.status).toBe("EXTRACTED");
    expect(upd.extracted).toEqual({ merchant: "Toko X" });
  });

  it("throws when transitioning an unknown document", async () => {
    const { setDocumentStatus } = await import("@/server/db/repos/documents.repo");
    await expect(setDocumentStatus(adminDb, orgId, crypto.randomUUID(), "FAILED"))
      .rejects.toThrow("DOKUMEN_TIDAK_DITEMUKAN");
  });
});
