import { describe, expect, it } from "vitest";
import { Pool } from "pg";
import { getPool, truncateAll, makeOrg } from "./helpers";
import { withOrg } from "@/server/db/repos/with-org";
import { deleteMemory, listMemories, saveMemory } from "@/server/db/repos/assistant-memory.repo";

describe("assistant_memories", () => {
  it("simpan, baca, hapus dalam satu org; org lain terisolasi", async () => {
    await truncateAll();
    const pool: Pool = getPool();
    const a = await makeOrg("mem-a");
    const b = await makeOrg("mem-b");
    await withOrg(a.orgId, (tx) =>
      saveMemory(tx, a.orgId, { kind: "FACT", content: "Tutup buku tiap tanggal 5", source: "user" }),
    );
    const seen = await withOrg(a.orgId, (tx) => listMemories(tx, a.orgId));
    expect(seen).toHaveLength(1);
    const other = await withOrg(b.orgId, (tx) => listMemories(tx, b.orgId));
    expect(other).toHaveLength(0);
    const ok = await withOrg(a.orgId, (tx) => deleteMemory(tx, a.orgId, seen[0].id));
    expect(ok).toBe(true);
    await pool.end();
  });

  it("tolak konten kosong dan lebih dari 500 char", async () => {
    await truncateAll();
    const pool: Pool = getPool();
    const a = await makeOrg("mem-b");
    await expect(
      withOrg(a.orgId, (tx) => saveMemory(tx, a.orgId, { kind: "FACT", content: "  ", source: "user" })),
    ).rejects.toThrow();
    await expect(
      withOrg(a.orgId, (tx) => saveMemory(tx, a.orgId, { kind: "FACT", content: "x".repeat(501), source: "user" })),
    ).rejects.toThrow();
    await pool.end();
  });
});
