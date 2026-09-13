"use server";
import { db } from "@/server/db";
import { requireContext } from "@/server/auth/guard";
import { isRedirectError } from "./redirect-guard";
import { countDraftsThisMonth, checkQuota, createDraft } from "@/server/db/repos/drafts.repo";
import { checkAssistantQuota, getThread } from "@/server/db/repos/chat.repo";
import { createDocumentRow } from "@/server/db/repos/documents.repo";
import { putDocument, MAX_DOCUMENT_BYTES, ALLOWED_MIMES } from "@/server/storage/storage";
import { resolveDraftAccounts } from "@/core/ai/map-accounts";
import { journalChat } from "@/server/ai/journal-chat";
import { saveThreadInteractionId } from "@/server/ai/interaction-memory";
import { getGeminiModel } from "@/server/ai/models";
import { appendAudit } from "@/server/db/repos/audit.repo";
import { eq } from "drizzle-orm";
import { accounts as accountsTable } from "@/server/db/schema/org";

export interface JournalChatResult {
  ok: boolean;
  error?: string;
  answer?: string;
  draftId?: string;
  draft?: unknown;
  /** Id interaksi baru untuk chaining turn berikutnya dalam thread yang sama. */
  interactionId?: string;
}

export async function journalAiChatAction(formData: FormData): Promise<JournalChatResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);

    // Unified quota check
    const quota = await checkAssistantQuota(db, ctx.orgId);
    // Allow chat even when quota exceeded if it's just a question (no draft), but block if draft would be created
    // For simplicity, block all chat when quota exceeded and message looks like draft request
    // We check after we know if draft was requested via function call, but for now check upfront for any chat that might create draft
    // If quota exceeded, we still allow general chat but not draft creation — handle after

    const message = String(formData.get("message") ?? "").trim();
    if (!message && !formData.get("file")) {
      return { ok: false, error: "Pesan tidak boleh kosong." };
    }

    const file = formData.get("file");
    let document: { dataBase64: string; mime: string } | undefined;
    let documentId: string | undefined;

    if (file instanceof File && file.size > 0) {
      if (!ALLOWED_MIMES.includes(file.type as never)) {
        return { ok: false, error: "Tipe file harus gambar atau PDF." };
      }
      if (file.size > MAX_DOCUMENT_BYTES) {
        return { ok: false, error: "Ukuran file maksimal 5 MB." };
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const { storageKey } = await putDocument(ctx.orgId, { buffer, mime: file.type });
      const row = await db.transaction((tx) =>
        createDocumentRow(tx, { orgId: ctx.orgId, storageKey, mime: file.type, sizeBytes: file.size }),
      );
      documentId = row.id;
      document = { dataBase64: buffer.toString("base64"), mime: file.type };
    }

    const allAccounts = await db.select().from(accountsTable).where(eq(accountsTable.orgId, ctx.orgId));
    const leaves = allAccounts.filter((a) => !allAccounts.some((c) => c.parentCode === a.code));

    // Unified quota blocks all if exceeded
    if (!quota.allowed) {
      return { ok: false, error: quota.message };
    }

    const historyRaw = String(formData.get("history") ?? "");
    let history: Array<{ role: "user" | "assistant"; content: string }> = [];
    try {
      if (historyRaw) history = JSON.parse(historyRaw);
    } catch {}

    // Threading server-side ala nara.ts: muat interaction id terakhir thread
    // ini agar Gemini mengingat konteks ("ok catatkan ya" tak lupa objeknya).
    // Best-effort: tanpa threadId valid chat tetap jalan stateless.
    const threadId = String(formData.get("threadId") ?? "").trim() || null;
    let previousInteractionId: string | null = null;
    if (threadId) {
      try {
        const t = await getThread(db, ctx.orgId, threadId);
        previousInteractionId = t?.geminiInteractionId ?? null;
      } catch {
        previousInteractionId = null;
      }
    }

    const result = await journalChat({
      message: message || "Buat jurnal dari dokumen terlampir",
      document,
      accounts: leaves.map((a) => ({ code: a.code, name: a.name, normal: a.normal === "D" ? "D" as const : "K" as const })),
      todayISO: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }),
      history,
      previousInteractionId,
    });

    if (threadId && result.interactionId) {
      await saveThreadInteractionId(ctx.orgId, threadId, result.interactionId);
    }

    // If function was called and draft exists, persist it
    if (result.draft && result.functionCalled) {
      // Re-check unified quota at persist time (race)
      const q2 = await checkAssistantQuota(db, ctx.orgId);
      if (!q2.allowed) return { ok: false, error: q2.message };

      const mapping = resolveDraftAccounts(
        result.draft as { lines: Array<{ accountCode: string }> },
        allAccounts.map((a) => ({ id: a.id, code: a.code, name: a.name, parentCode: a.parentCode, archivedAt: a.archivedAt })),
      );
      const draftWithMapping = { ...(result.draft as object), mapping };
      const model = getGeminiModel();

      const row = await db.transaction(async (tx) => {
        const d = await createDraft(tx, {
          orgId: ctx.orgId,
          kind: document ? "DOCUMENT" : "TEXT",
          documentId,
          inputText: message,
          draft: draftWithMapping,
          model,
        });
        await appendAudit(tx, {
          orgId: ctx.orgId,
          actor: ctx.userEmail,
          action: "AI_DRAFT_CREATE",
          subjectType: "ai_draft",
          subjectId: d.id,
          data: { kind: document ? "DOCUMENT" : "TEXT", via: "chat", overallConfidence: (result.draft as { overallConfidence?: number }).overallConfidence },
        });
        return d;
      });

      return { ok: true, answer: result.answer, draftId: row.id, draft: draftWithMapping, interactionId: result.interactionId };
    }

    return { ok: true, answer: result.answer, interactionId: result.interactionId };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    console.error(e);
    if (e instanceof Error && e.message === "AI_TIDAK_TERSEDIA") {
      return { ok: false, error: "Asisten sedang tidak tersedia. Coba lagi sebentar." };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Terjadi kesalahan." };
  }
}
