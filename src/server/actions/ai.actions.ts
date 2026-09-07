"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { withOrg } from "@/server/db/repos/with-org";
import type { AccountProposal } from "@/server/doctor/builders";
import { requireContext } from "@/server/auth/guard";
import { isRedirectError } from "./redirect-guard";
import { appendAudit } from "@/server/db/repos/audit.repo";
import { accounts as accountsTable } from "@/server/db/schema/org";
import { aiDrafts } from "@/server/db/schema/ai";
import { getDocumentRow, setDocumentStatus } from "@/server/db/repos/documents.repo";
import {
  createDraft, getDraft, setDraftStatus, linkPostedEntry,
} from "@/server/db/repos/drafts.repo";
import { getDocument } from "@/server/storage/storage";
import { generateJournalDraft } from "@/server/ai/adapter";
import { resolveDraftAccounts } from "@/core/ai/map-accounts";
import { postJournalEntry, PostingError } from "@/server/db/repos/journals.repo";
import { issueToMessage } from "@/core/journals/messages";
import { Money } from "@/core/money/money";

export interface ActionResult {
  ok: boolean;
  error?: string;
  draftId?: string;
  number?: string;
}

function fail(e: unknown): ActionResult {
  if (isRedirectError(e)) throw e;
  if (e instanceof PostingError) {
    return { ok: false, error: e.issues.map((i) => issueToMessage(i)).join("; ") };
  }
  if (e instanceof Error && e.message === "FORBIDDEN_AKSES") {
    return { ok: false, error: "Anda tidak memiliki izin untuk aksi ini." };
  }
  if (e instanceof Error && e.message === "AI_TIDAK_TERSEDIA") {
    return { ok: false, error: "Asisten sedang tidak tersedia. Coba lagi sebentar." };
  }
  console.error(e);
  return { ok: false, error: "Terjadi kesalahan tak terduga." };
}

async function leafAccounts(orgId: string) {
  const rows = await db.select().from(accountsTable).where(eq(accountsTable.orgId, orgId));
  return rows.filter((a) => !rows.some((c) => c.parentCode === a.code));
}

// Test seam: reads a draft directly (server actions lack session context in
// integration tests). Production code paths never use it.
export async function getDraftForTest(orgId: string, draftId: string) {
  const { getDraft: g } = await import("@/server/db/repos/drafts.repo");
  return g(db, orgId, draftId);
}

export async function createDraftAction(
  input: { text?: string; documentId?: string },
): Promise<ActionResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);

    const { checkAssistantQuota } = await import("@/server/db/repos/chat.repo");
    const quota = await checkAssistantQuota(db, ctx.orgId);
    if (!quota.allowed) return { ok: false, error: quota.message };

    let kind: "TEXT" | "DOCUMENT" = "TEXT";
    let documentId: string | undefined;
    let promptText = (input.text ?? "").trim();
    let document: { dataBase64: string; mime: string } | undefined;

    if (input.documentId) {
      kind = "DOCUMENT";
      documentId = input.documentId;
      const row = await getDocumentRow(db, ctx.orgId, input.documentId);
      if (!row) return { ok: false, error: "Dokumen tidak ditemukan." };
      const bytes = await getDocument(row.storageKey);
      document = { dataBase64: bytes.toString("base64"), mime: row.mime };
      if (!promptText) promptText = "Buat jurnal dari dokumen terlampir.";
      await db.transaction((tx) => setDocumentStatus(tx, ctx.orgId, row.id, "EXTRACTED"));
    }
    if (!promptText) return { ok: false, error: "Deskripsi tidak boleh kosong." };

    // Cegah duplikasi draf jika dokumen yang sama sudah pernah diekstrak dan masih PENDING
    if (documentId) {
      const [existing] = await db
        .select({ id: aiDrafts.id })
        .from(aiDrafts)
        .where(
          and(
            eq(aiDrafts.orgId, ctx.orgId),
            eq(aiDrafts.documentId, documentId),
            eq(aiDrafts.status, "PENDING"),
          ),
        )
        .limit(1);
      if (existing?.id) {
        return { ok: true, draftId: existing.id };
      }
    }

    const leaves = await leafAccounts(ctx.orgId);
    const draft = await generateJournalDraft({
      kind,
      text: promptText,
      document,
      todayISO: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }),
      accounts: leaves.map((a) => ({
        code: a.code, name: a.name, normal: a.normal === "D" ? "D" as const : "K" as const,
      })),
    });

    const mapping = resolveDraftAccounts(
      draft,
      leaves.map((a) => ({ id: a.id, code: a.code, name: a.name })),
    );
    const draftWithMapping = { ...draft, mapping };
    const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

    const row = await db.transaction(async (tx) => {
      const d = await createDraft(tx, {
        orgId: ctx.orgId, kind, documentId, inputText: promptText,
        draft: draftWithMapping, model,
      });
      await appendAudit(tx, {
        orgId: ctx.orgId, actor: ctx.userEmail, action: "AI_DRAFT_CREATE",
        subjectType: "ai_draft", subjectId: d.id,
        data: { kind, overallConfidence: draft.overallConfidence },
      });
      return d;
    });
    return { ok: true, draftId: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function rejectDraftAction(draftId: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    await db.transaction(async (tx) => {
      await setDraftStatus(tx, ctx.orgId, draftId, "REJECTED");
      await appendAudit(tx, {
        orgId: ctx.orgId, actor: ctx.userEmail, action: "AI_DRAFT_REJECT",
        subjectType: "ai_draft", subjectId: draftId, data: {},
      });
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function bulkRejectDraftsAction(draftIds: string[]): Promise<ActionResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    if (!draftIds.length) return { ok: true };

    await db.transaction(async (tx) => {
      for (const id of draftIds) {
        await setDraftStatus(tx, ctx.orgId, id, "REJECTED");
      }
      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: "AI_DRAFT_BULK_REJECT",
        subjectType: "ai_draft",
        subjectId: draftIds[0] ?? "",
        data: { count: draftIds.length, draftIds },
      });
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export interface AcceptLine {
  accountId: string;
  debitText: string;
  creditText: string;
}

export async function acceptDraftAction(
  draftId: string,
  edited: { dateISO: string; memo: string; lines: AcceptLine[] },
): Promise<ActionResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const out = await withOrg(ctx.orgId, async (tx) => {
      const draft = await getDraft(tx, ctx.orgId, draftId);
      if (!draft) throw new Error("DRAFT_TIDAK_DITEMUKAN");
      if (draft.status !== "PENDING") throw new Error("DRAFT_SUDAH_DIPROSES");

      // Usulan akun COA dari Doctor SAK: validasi + buat yang MASIH DIRUJUK
      // DAHULU dalam transaksi yang sama, lalu petakan ulang baris yang
      // accountId-nya kosong ke akun baru tersebut (posisi baris ↔ kode draf,
      // atau kode usulan yang dikirim sebagai accountId) — baru posting.
      // Gagal di langkah mana pun → throw, transaksi rollback, tak ada akun
      // yatim. D8: saring dulu ke usulan yang masih dirujuk baris yang BELUM
      // diselesaikan manual (submitted lines[i].accountId kosong dan kode
      // draf raw.lines[i].accountCode sama dengan kode usulan, serta kode
      // itu tidak sudah ada sebagai akun — bisa dipetakan ulang ke akun
      // lama). Baris yang user petakan manual ke akun nyata dilewati penuh:
      // draf yang semua barisnya resolved manual diposting sebagai jurnal
      // biasa tanpa membuat akun apa pun. R6 tetap: usulan yang masih
      // dirujuk divalidasi ketat (placeholder gagal tertutup).
      const raw = draft.draft as {
        lines?: Array<{ accountCode?: string }>;
        accountProposals?: AccountProposal[];
      } | null;
      const allProposals = Array.isArray(raw?.accountProposals) ? raw.accountProposals : [];
      const existingRows = allProposals.length > 0
        ? await tx.select({ id: accountsTable.id, code: accountsTable.code })
          .from(accountsTable).where(eq(accountsTable.orgId, ctx.orgId))
        : [];
      const existingByCode = new Map(existingRows.map((r) => [r.code.trim(), r.id]));
      const existingByLower = new Map(
        existingRows.map((r) => [r.code.trim().toLowerCase(), r.id]),
      );
      const proposals = allProposals.filter((p) => {
        const pCode = p.code.trim();
        if (existingByCode.has(pCode) || existingByLower.has(pCode.toLowerCase())) return false;
        return edited.lines.some((l, i) => {
          const submitted = l.accountId.trim();
          if (submitted === "") {
            return raw?.lines?.[i]?.accountCode?.trim() === pCode;
          }
          return submitted === pCode;
        });
      });
      const codeToId = new Map<string, string>();
      if (proposals.length > 0) {
        const { validateAccountProposal } = await import("@/server/accounts/propose");
        const { createAccount } = await import("@/server/db/repos/accounts.repo");
        const seen = new Set<string>();
        for (const p of proposals) {
          const code = p.code.trim();
          if (seen.has(code)) {
            throw new Error(`USULAN_AKUN_TIDAK_VALID: kode akun ${code} diusulkan ganda.`);
          }
          seen.add(code);
          await validateAccountProposal(tx, ctx.orgId, p);
        }
        for (const p of proposals) {
          const code = p.code.trim();
          const created = await createAccount(tx, {
            orgId: ctx.orgId,
            code,
            name: p.name.trim(),
            type: p.type,
            normal: p.normal,
            parentCode: p.parentCode.trim(),
          });
          codeToId.set(code, created.id);
        }
      }

      const entry = {
        dateISO: edited.dateISO,
        memo: edited.memo.trim() || "(tanpa keterangan)",
        source: "AI" as const,
        idempotencyKey: crypto.randomUUID(),
        lines: edited.lines.map((l, i) => {
          let accountId = l.accountId;
          if (accountId.trim() === "") {
            const code = raw?.lines?.[i]?.accountCode?.trim();
            const resolved = code
              ? (codeToId.get(code)
                ?? existingByCode.get(code)
                ?? existingByLower.get(code.toLowerCase()))
              : undefined;
            if (resolved) accountId = resolved;
          } else {
            const resolved = codeToId.get(accountId.trim());
            if (resolved) accountId = resolved;
          }
          return {
            accountId,
            debitMinor: Money.parseIdr(l.debitText.trim() === "" ? "0" : l.debitText).minor,
            creditMinor: Money.parseIdr(l.creditText.trim() === "" ? "0" : l.creditText).minor,
          };
        }),
      };
      const posted = await postJournalEntry(tx, ctx.orgId, ctx.userEmail, entry);
      await linkPostedEntry(tx, ctx.orgId, draftId, posted.id);

      // Tautkan akrual pajak: draf rule pp-55-2022 yang diterima menandai
      // tax_summaries ACCRUED + menyimpan id jurnalnya, sehingga status
      // ACCRUED selalu reachable dan pelunasan tertaut ke akrual.
      if (draft.model === "rule:pp-55-2022") {
        const { taxSummaries } = await import("@/server/db/schema/tax");
        await tx
          .update(taxSummaries)
          .set({ accrualJournalEntryId: posted.id, status: "ACCRUED", updatedAt: new Date() })
          .where(and(eq(taxSummaries.orgId, ctx.orgId), eq(taxSummaries.accrualDraftId, draftId)));
      }
      await appendAudit(tx, {
        orgId: ctx.orgId, actor: ctx.userEmail, action: "AI_DRAFT_ACCEPT",
        subjectType: "ai_draft", subjectId: draftId,
        data: { number: posted.number },
      });

      // Jika draf berasal dari rekomendasi Akunio Doctor, tandai temuan & proposal terkait selesai
      const findingId = (draft.draft as { findingId?: string })?.findingId;
      const proposalId = (draft.draft as { proposalId?: string })?.proposalId;
      if (findingId) {
        const { resolveFinding, updateProposalStatus } = await import("@/server/db/repos/findings.repo");
        try {
          await resolveFinding(tx, ctx.orgId, findingId);
          if (proposalId) {
            await updateProposalStatus(tx, ctx.orgId, proposalId, "accepted");
          }
          await appendAudit(tx, {
            orgId: ctx.orgId,
            actor: ctx.userEmail,
            action: "FINDING_RESOLVED",
            subjectType: "ai_finding",
            subjectId: findingId,
            data: { postedEntryId: posted.id, postedNumber: posted.number, proposalId },
          });
        } catch (err) {
          console.error("Gagal menandai temuan selesai:", err);
        }
      }

      return posted;
    });
    try {
      revalidatePath("/temuan");
      revalidatePath("/jurnal");
      revalidatePath(`/jurnal/ai/${draftId}`);
    } catch {}
    return { ok: true, number: out.number };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    if (e instanceof PostingError) {
      return { ok: false, error: e.issues.map((i) => issueToMessage(i)).join("; ") };
    }
    if (e instanceof Error && e.message === "FORBIDDEN_AKSES") {
      return { ok: false, error: "Anda tidak memiliki izin untuk aksi ini." };
    }
    if (e instanceof Error && e.message === "DRAFT_SUDAH_DIPROSES") {
      return { ok: false, error: "Draft ini sudah pernah diproses." };
    }
    if (e instanceof Error && e.message.startsWith("USULAN_AKUN_TIDAK_VALID")) {
      return { ok: false, error: e.message };
    }
    console.error(e);
    return { ok: false, error: "Terjadi kesalahan tak terduga." };
  }
}

export async function getSakCitationDetailAction(babStr: string, paragraphStr: string) {
  try {
    await requireContext();
    const { getSakChapterByBab } = await import("@/server/db/repos/sak-docs.repo");
    const babNum = parseInt(babStr.replace(/\D/g, ""), 10);
    if (!babNum || isNaN(babNum)) {
      return { ok: false, error: "Nomor bab tidak valid" };
    }
    const chapter = await getSakChapterByBab(babNum);
    if (!chapter) {
      return { ok: false, error: "Bab aturan tidak ditemukan" };
    }

    // Cari chunk yang paling spesifik memuat nomor paragraf tersebut
    const cleanP = paragraphStr.trim();
    let targetChunk = chapter.chunks.find((c) =>
      c.content.includes(`${cleanP}.`) || c.content.includes(cleanP) || c.paragraphRange.includes(cleanP)
    );
    if (!targetChunk && chapter.chunks.length > 0) {
      targetChunk = chapter.chunks[0];
    }

    return {
      ok: true,
      data: {
        bab: chapter.bab,
        babTitle: chapter.title,
        description: chapter.description,
        sectionTitle: targetChunk?.title ?? `Bab ${chapter.bab}`,
        paragraphRange: targetChunk?.paragraphRange ?? "",
        content: targetChunk?.content ?? "",
      },
    };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "Gagal memuat aturan SAK" };
  }
}

