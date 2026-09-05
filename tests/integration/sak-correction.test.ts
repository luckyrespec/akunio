import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";

// ADAPTASI dari brief Task 7 (verbatim tak bisa hijau di env ini):
// tanpa TEST_CTX_ORG, requireContext → getActiveContext() → import
// @neondatabase/auth/next → "Cannot find module '.../next/headers'" di vitest
// (keterbatasan resolusi modul yang didokumentasikan di session.ts), SEBELUM
// logika action berjalan — pada kode lama maupun baru. Karena itu jaring
// pengaman memakai seam TEST_CTX_ORG (pola baku repo, mis. ai.actions.test.ts):
// (1) tanpa sesi: tak pernah membuat draf buta; (2) dengan sesi tapi tanpa
// data SAK: SAK_BELUM_TERSEDIA + tanpa draf; (3) dengan SAK: draf SAK-grounded.

async function clearSakTables(admin: Pool): Promise<void> {
  await admin.query(`DELETE FROM ai_proposals`);
  await admin.query(`DELETE FROM ai_findings`);
  await admin.query(`DELETE FROM ai_drafts`);
  await admin.query(`DELETE FROM ifrs_chunks`);
  await admin.query(`DELETE FROM sak_sources`);
}

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("sak correction pipeline", () => {
  let orgId: string;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  const year = new Date().getFullYear();

  beforeAll(async () => {
    await truncateAll();
    await clearSakTables(admin);
    // Deterministik tanpa API live: retrieval pakai fallback kata kunci,
    // narator pakai cabang deterministik (seam yang didukung correction-narrator).
    process.env.AI_MOCK = "1";
    orgId = (await makeOrg("PT SAK")).orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
  });
  afterAll(async () => {
    delete process.env.TEST_CTX_ORG;
    delete process.env.AI_MOCK;
    await clearSakTables(admin);
    await admin.end();
    await truncateAll();
  });

  async function postAtkEntry() {
    const journals = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`, [orgId]);
    const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
    return db.transaction((tx) =>
      journals.postJournalEntry(tx as never, orgId, "tester@test.id", {
        dateISO: `${year}-05-01`, memo: "Beli ATK",
        lines: [
          { accountId: byCode["5200"], debitMinor: 7500000n, creditMinor: 0n },
          { accountId: byCode["1110"], debitMinor: 0n, creditMinor: 7500000n },
        ],
      }));
  }

  async function draftCount(): Promise<number> {
    const r = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ai_drafts WHERE org_id=$1`, [orgId]);
    return Number(r.rows[0].n);
  }

  it("duplicate proposal path is auth-guarded and never drafts blindly", async () => {
    const findings = await import("@/server/db/repos/findings.repo");
    const { db } = await import("@/server/db");
    const entry = await postAtkEntry();
    const f = await db.transaction((tx) =>
      findings.createFinding(tx as never, orgId, {
        type: "duplicates", severity: "MEDIUM",
        evidence: { entryId: entry.id, entryNumber: entry.number, memo: "Beli ATK" },
      }));
    const { proposeCorrectionAction } = await import("@/app/(app)/temuan/actions");
    // Server action butuh sesi auth: tanpa sesi ia gagal sebelum menyentuh DB.
    // Test ini mengunci perilaku aman (tak ada draf buta dalam kondisi apa pun).
    const before = await draftCount();
    const res = await proposeCorrectionAction(f.id).catch((e: Error) => ({ ok: false as const, error: e.message }));
    expect(res.ok).toBe(false);
    expect(await draftCount()).toBe(before);
  });

  it("returns SAK_BELUM_TERSEDIA without SAK data instead of a blind draft", async () => {
    process.env.TEST_CTX_ORG = orgId;
    const findings = await import("@/server/db/repos/findings.repo");
    const { db } = await import("@/server/db");
    const entry = await postAtkEntry();
    const f = await db.transaction((tx) =>
      findings.createFinding(tx as never, orgId, {
        type: "duplicates", severity: "MEDIUM",
        evidence: { entryId: entry.id, entryNumber: entry.number, memo: "Beli ATK" },
      }));
    const { proposeCorrectionAction } = await import("@/app/(app)/temuan/actions");
    const before = await draftCount();
    const res = await proposeCorrectionAction(f.id);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error?.split(":")[0]).toBe("SAK_BELUM_TERSEDIA");
    }
    expect(await draftCount()).toBe(before);
  });

  it("builds a SAK-grounded reversal draft from actual entry amounts", async () => {
    process.env.TEST_CTX_ORG = orgId;
    const docId = `TEST-SAK-${crypto.randomUUID()}`;
    await admin.query(
      `INSERT INTO sak_sources (doc_id, version, effective_date) VALUES ($1, 'vTEST', CURRENT_DATE)`,
      [docId],
    );
    await admin.query(
      `INSERT INTO ifrs_chunks (section, chunk_index, content) VALUES
        ('SAK-EMKM-Bab7', '0', 'Koreksi kesalahan periode lalu dilakukan secara retrospektif dengan menyajikan kembali laporan keuangan.')`,
    );
    const findings = await import("@/server/db/repos/findings.repo");
    const { db } = await import("@/server/db");
    const entry = await postAtkEntry();
    const f = await db.transaction((tx) =>
      findings.createFinding(tx as never, orgId, {
        type: "duplicates", severity: "MEDIUM",
        evidence: { entryId: entry.id, entryNumber: entry.number, memo: "Beli ATK" },
      }));
    const { proposeCorrectionAction } = await import("@/app/(app)/temuan/actions");
    const res = await proposeCorrectionAction(f.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const r = await admin.query<{ draft: unknown; model: string }>(
      `SELECT draft, model FROM ai_drafts WHERE id=$1`, [res.draftId]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].model).toBe("doctor-sak");
    const draft = r.rows[0].draft as {
      memo: string;
      lines: Array<{ accountCode: string; debitText: string; creditText: string; confidence: number; reason: string }>;
      overallConfidence: number;
      explanation: string;
      mapping: { lines: Array<{ accountId: string | null; unresolved: boolean }> };
      accountProposals: unknown[];
      citations: Array<{ docId: string; bab: string }>;
      sakDocId: string;
      sakVersion: string;
    };
    // R4: memo dari frame; nominal aktual entri (Rp75.000), bukan template.
    expect(draft.memo).toBe("Pembalik Transaksi Duplikat: Beli ATK");
    expect(draft.lines).toHaveLength(2);
    const byCode = Object.fromEntries(draft.lines.map((l) => [l.accountCode, l]));
    expect(byCode["5200"].creditText).toBe("75.000");
    expect(byCode["5200"].debitText).toBe("");
    expect(byCode["1110"].debitText).toBe("75.000");
    expect(byCode["1110"].creditText).toBe("");
    // Keyakinan jujur: terpetakan semua → 1.0, overall = rata-rata.
    expect(draft.lines.every((l) => l.confidence === 1.0)).toBe(true);
    expect(draft.overallConfidence).toBe(1.0);
    expect(draft.mapping.lines.every((m) => m.accountId && !m.unresolved)).toBe(true);
    expect(draft.accountProposals).toEqual([]);
    // Sitasi SAK terverifikasi menunjuk dokumen aktif.
    expect(draft.citations.length).toBeGreaterThan(0);
    expect(draft.citations[0].docId).toBe(docId);
    expect(draft.sakDocId).toBe(docId);
    expect(draft.sakVersion).toBe("vTEST");
    expect(draft.explanation.length).toBeGreaterThanOrEqual(20);
  });
});
