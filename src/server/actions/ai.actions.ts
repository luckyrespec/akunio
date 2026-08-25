"use server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { requireContext } from "@/server/auth/guard";
import { isRedirectError } from "./redirect-guard";
import { appendAudit } from "@/server/db/repos/audit.repo";
import { accounts as accountsTable } from "@/server/db/schema/org";
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
    const out = await db.transaction(async (tx) => {
      const draft = await getDraft(tx, ctx.orgId, draftId);
      if (!draft) throw new Error("DRAFT_TIDAK_DITEMUKAN");
      if (draft.status !== "PENDING") throw new Error("DRAFT_SUDAH_DIPROSES");

      const entry = {
        dateISO: edited.dateISO,
        memo: edited.memo.trim() || "(tanpa keterangan)",
        source: "AI" as const,
        idempotencyKey: crypto.randomUUID(),
        lines: edited.lines.map((l) => ({
          accountId: l.accountId,
          debitMinor: Money.parseIdr(l.debitText.trim() === "" ? "0" : l.debitText).minor,
          creditMinor: Money.parseIdr(l.creditText.trim() === "" ? "0" : l.creditText).minor,
        })),
      };
      const posted = await postJournalEntry(tx, ctx.orgId, ctx.userEmail, entry);
      await linkPostedEntry(tx, ctx.orgId, draftId, posted.id);
      await appendAudit(tx, {
        orgId: ctx.orgId, actor: ctx.userEmail, action: "AI_DRAFT_ACCEPT",
        subjectType: "ai_draft", subjectId: draftId,
        data: { number: posted.number },
      });
      return posted;
    });
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
    console.error(e);
    return { ok: false, error: "Terjadi kesalahan tak terduga." };
  }
}
