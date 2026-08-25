"use server";
import { revalidatePath } from "next/cache";
import { requireContext } from "@/server/auth/guard";
import { isRedirectError } from "@/server/actions/redirect-guard";
import { db } from "@/server/db";
import { resolveFinding, dismissFinding, createProposal } from "@/server/db/repos/findings.repo";
import { createDraft } from "@/server/db/repos/drafts.repo";
import { appendAudit } from "@/server/db/repos/audit.repo";

export async function resolveFindingAction(id: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    await db.transaction(async (tx) => {
      await resolveFinding(tx, ctx.orgId, id);
      await appendAudit(tx, { orgId: ctx.orgId, actor: ctx.userEmail, action: "FINDING_RESOLVED", subjectType: "ai_finding", subjectId: id, data: {} });
    });
    revalidatePath("/temuan");
    return { ok: true };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "Gagal" };
  }
}

export async function dismissFindingAction(id: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    await db.transaction(async (tx) => {
      await dismissFinding(tx, ctx.orgId, id);
      await appendAudit(tx, { orgId: ctx.orgId, actor: ctx.userEmail, action: "FINDING_DISMISSED", subjectType: "ai_finding", subjectId: id, data: {} });
    });
    revalidatePath("/temuan");
    return { ok: true };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "Gagal" };
  }
}

export async function proposeCorrectionAction(findingId: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    // Minimal proposal draft — in real LLM review this would be enriched
    const draft = {
      dateISO: new Date().toISOString().slice(0, 10),
      memo: "Koreksi dari temuan Doctor",
      lines: [
        { accountCode: "1110", debitText: "100.000", creditText: "", confidence: 0.8, reason: "Koreksi Doctor" },
        { accountCode: "4100", debitText: "", creditText: "100.000", confidence: 0.8, reason: "Koreksi Doctor" },
      ],
      overallConfidence: 0.8,
      explanation: "Draft koreksi otomatis dari temuan",
    };
    const result = await db.transaction(async (tx) => {
      const proposal = await createProposal(tx, ctx.orgId, findingId, draft, "IFRS SME 10.3");
      const aiDraft = await createDraft(tx, {
        orgId: ctx.orgId,
        kind: "TEXT",
        inputText: `Koreksi untuk temuan ${findingId}`,
        draft: { ...draft, findingId, proposalId: proposal.id },
        model: "doctor",
      });
      await appendAudit(tx, {
        orgId: ctx.orgId,
        actor: ctx.userEmail,
        action: "PROPOSAL_CREATED",
        subjectType: "ai_proposal",
        subjectId: proposal.id,
        data: { findingId, aiDraftId: aiDraft.id },
      });
      return { proposal, aiDraft };
    });
    revalidatePath("/temuan");
    return { ok: true, draftId: result.aiDraft.id };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "Gagal" };
  }
}
