import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { getOrCreateAdkSession, syncTurnToThread } from "@/server/ai/session-bridge";
import { withOrg } from "@/server/db/repos/with-org";
import { listMessages } from "@/server/db/repos/chat.repo";

describe("session bridge", () => {
  let orgId = "";
  beforeAll(async () => { await truncateAll(); orgId = (await makeOrg("PT Bridge")).orgId; });
  afterEach(async () => { await truncateAll(); });
  it("thread tak dikenal → throw", async () => {
    await expect(getOrCreateAdkSession(orgId, "00000000-0000-0000-0000-000000000000")).rejects.toThrow();
  });
  it("roundtrip user+assistant tersimpan", async () => {
    const { orgId: oid } = await makeOrg("PT Bridge2");
    const { createThread } = await import("@/server/db/repos/chat.repo");
    const t = await withOrg(oid, (tx) => createThread(tx, oid, "uji", "fast"));
    const s = await getOrCreateAdkSession(oid, t.id);
    expect(s.sessionKey).toContain(t.id);
    await syncTurnToThread(oid, t.id, { role: "user", content: "halo" });
    await syncTurnToThread(oid, t.id, { role: "assistant", content: "hai", toolInvocations: [{ tool: "get_report" }] });
    const msgs = await withOrg(oid, (tx) => listMessages(tx, t.id));
    expect(msgs.length).toBe(2);
  });
});
