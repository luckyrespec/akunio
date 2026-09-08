import { describe, expect, it } from "vitest";
import { getPool, truncateAll, makeOrg } from "./helpers";
import { withOrg } from "@/server/db/repos/with-org";
import { deleteMemory, listMemories, saveMemory } from "@/server/db/repos/assistant-memory.repo";

describe("memory actions", () => {
  it("CRUD round-trip + toggle tidak merusak settings lain", async () => {
    await truncateAll();
    const pool = getPool();
    const { orgId } = await makeOrg("mem-ui");
    const row = await withOrg(orgId, (tx) =>
      saveMemory(tx, orgId, { kind: "PREFERENCE", content: "Sapa dengan nama Toko Maju", source: "user" }),
    );
    expect(row.id).toBeTruthy();
    expect(await withOrg(orgId, (tx) => listMemories(tx, orgId))).toHaveLength(1);
    expect(await withOrg(orgId, (tx) => deleteMemory(tx, orgId, row.id))).toBe(true);
    expect(await withOrg(orgId, (tx) => listMemories(tx, orgId))).toHaveLength(0);
    await pool.end();
  });
});
