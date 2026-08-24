"use server";
import { db } from "@/server/db";
import { requireContext } from "@/server/auth/guard";
import { createDraft } from "@/server/db/repos/drafts.repo";
import { appendAudit } from "@/server/db/repos/audit.repo";
import { isRedirectError } from "./redirect-guard";

export async function createCorrectionDraftAction(input: {
  threadId: string;
  draft: unknown;
}): Promise<{ ok: boolean; draftId?: string; error?: string }> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const row = await db.transaction(async (tx) => {
      const d = await createDraft(tx, {
        orgId: ctx.orgId,
        kind: "TEXT",
        inputText: `usulan dari chat ${input.threadId}`,
        draft: input.draft,
        model: "advisor",
      });
      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: "ADVISOR_DRAFT_CREATE",
        subjectType: "ai_draft",
        subjectId: d.id,
        data: { threadId: input.threadId },
      });
      return d;
    });
    return { ok: true, draftId: row.id };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    console.error(e);
    return { ok: false, error: "Gagal membuat draft koreksi." };
  }
}
