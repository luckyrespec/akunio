import { describe, it, expect } from "vitest";
import "dotenv/config";

// Reachability probe: if S3 (SeaweedFS) is not running, skip the whole suite
// instead of failing — external dev service, not part of the core gate.
const reachable = await (async () => {
  try {
    const { getDocument } = await import("@/server/storage/storage");
    await getDocument("orgs/probe/definitely-missing.pdf");
    return true; // S3 answered (missing-object 404 counts as reachable)
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND") || msg.includes("fetch failed")) {
      return false;
    }
    return true; // any other error (e.g. NoSuchKey) means the server is up
  }
})();

describe.skipIf(!reachable || process.env.SKIP_STORAGE_TESTS === "1")("seaweedfs storage", () => {
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
