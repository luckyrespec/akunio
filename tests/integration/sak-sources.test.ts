import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { registerSakSource, getActiveSakSource, isSakSection } from "@/server/db/repos/sak.repo";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("sak sources registry", () => {
  it("isSakSection detects SAK sections only", () => {
    expect(isSakSection("SAK-EMKM-Bab7")).toBe(true);
    expect(isSakSection("IFRS-SME-3")).toBe(false);
  });

  it("registers and returns the latest effective source", async () => {
    const { db } = await import("@/server/db");
    const docId = `TEST-DOC-${crypto.randomUUID()}`;
    await db.transaction(async (tx) => {
      await registerSakSource(tx as never, { docId, version: "v2024.1", effectiveDate: "2024-01-01" });
      await registerSakSource(tx as never, { docId, version: "v2024.2", effectiveDate: "2024-06-01" });
      const active = await getActiveSakSource(tx as never);
      expect(active?.version).toBe("v2024.2");
    });
    await db.execute(sql`DELETE FROM sak_sources WHERE doc_id = ${docId}`);
  });
});
