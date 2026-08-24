import { describe, it, expect, beforeAll } from "vitest";
import "dotenv/config";

const run = process.env.SKIP_STORAGE_TESTS !== "1";

describe.skipIf(!run)("seaweedfs storage", () => {
  beforeAll(async () => {
    // probe: bucket must exist (npm run weed:dev first)
    const { getDocument } = await import("@/server/storage/storage");
    await expect(getDocument("orgs/probe/definitely-missing.pdf")).rejects.toThrow();
  });

  it("puts, gets, and deletes a document", async () => {
    const { putDocument, getDocument, deleteDocument } = await import("@/server/storage/storage");
    const orgId = crypto.randomUUID();
    const buf = Buffer.from("%PDF-1.4 test payload");
    const { storageKey } = await putDocument(orgId, { buffer: buf, mime: "application/pdf" });
    expect(storageKey).toMatch(new RegExp(`^orgs/${orgId}/[0-9a-f-]+\\.pdf$`));
    const back = await getDocument(storageKey);
    expect(back.equals(buf)).toBe(true);
    await deleteDocument(storageKey);
    await expect(getDocument(storageKey)).rejects.toThrow();
  });

  it("rejects unsupported mime", async () => {
    const { putDocument } = await import("@/server/storage/storage");
    await expect(putDocument(crypto.randomUUID(), {
      buffer: Buffer.from("x"), mime: "text/plain",
    })).rejects.toThrow("MIME_TIDAK_DIDUKUNG");
  });
});
