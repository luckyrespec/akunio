import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/server/db";
import { makeOrg, truncateAll } from "./helpers";
import { documents } from "@/server/db/schema/ai";
import { batchAnalyzeDocuments } from "@/server/ai/batch-documents";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Batch Document Analysis", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Batch Test")).orgId;
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("evaluates confidence and categorizes documents into ready vs needs_review", async () => {
    // Insert mock document records in DB
    const [doc1] = await db
      .insert(documents)
      .values({
        orgId,
        storageKey: "test/doc1.jpg",
        mime: "image/jpeg",
        sizeBytes: 1024,
      })
      .returning();

    const [doc2] = await db
      .insert(documents)
      .values({
        orgId,
        storageKey: "test/doc2.jpg",
        mime: "image/jpeg",
        sizeBytes: 2048,
      })
      .returning();

    const result = await batchAnalyzeDocuments(orgId, [doc1.id, doc2.id]);

    expect(result.items.length).toBe(2);
    expect(result.readyCount + result.needsReviewCount).toBe(2);
    expect(result.batchId).toBeDefined();
    expect(Array.isArray(result.suggestions)).toBe(true);
  });
});
