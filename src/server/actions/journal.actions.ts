"use server";
import { revalidatePath } from "next/cache";
import { requireContext } from "@/server/auth/guard";
import { isRedirectError } from "./redirect-guard";
import { db } from "@/server/db";
import { appendAudit } from "@/server/db/repos/audit.repo";
import {
  postJournalEntry, getPostedEntry, PostingError,
} from "@/server/db/repos/journals.repo";
import { makeReversal } from "@/core/journals/validate";
import { issueToMessage } from "@/core/journals/messages";
import { Money } from "@/core/money/money";

export interface ActionResult {
  ok: boolean;
  error?: string;
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
  console.error(e);
  return { ok: false, error: "Terjadi kesalahan tak terduga." };
}

export async function createAndPostAction(payload: {
  dateISO: string;
  memo: string;
  lines: Array<{ accountId: string; debitText: string; creditText: string }>;
}): Promise<ActionResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]); // viewer may not post
    const entry = {
      dateISO: payload.dateISO,
      memo: payload.memo.trim() || "(tanpa keterangan)",
      source: "MANUAL" as const,
      idempotencyKey: crypto.randomUUID(),
      lines: payload.lines.map((l) => ({
        accountId: l.accountId,
        debitMinor: Money.parseIdr(l.debitText.trim() === "" ? "0" : l.debitText).minor,
        creditMinor: Money.parseIdr(l.creditText.trim() === "" ? "0" : l.creditText).minor,
      })),
    };
    const out = await db.transaction(async (tx) => {
      const r = await postJournalEntry(tx, ctx.orgId, ctx.userEmail, entry);
      await appendAudit(tx, {
        orgId: ctx.orgId, actor: ctx.userEmail, action: "JOURNAL_POST",
        subjectType: "journal_entry", subjectId: r.id,
        data: { number: r.number, memo: entry.memo },
      });
      return r;
    });
    revalidatePath("/jurnal");
    return { ok: true, number: out.number };
  } catch (e) {
    return fail(e);
  }
}

export async function reverseEntryAction(entryId: string, dateISO: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const out = await db.transaction(async (tx) => {
      const original = await getPostedEntry(tx, ctx.orgId, entryId);
      if (!original) throw new Error("JURNAL_TIDAK_DITEMUKAN");
      const reversalInput = makeReversal(
        {
          number: original.number,
          lines: original.lines.map((l) => ({
            accountId: l.accountId, debitMinor: l.debitMinor, creditMinor: l.creditMinor,
          })),
        },
        dateISO,
      );
      reversalInput.idempotencyKey = crypto.randomUUID();
      const r = await postJournalEntry(tx, ctx.orgId, ctx.userEmail, reversalInput, {
        reversalOfId: original.id,
      });
      await appendAudit(tx, {
        orgId: ctx.orgId, actor: ctx.userEmail, action: "JOURNAL_REVERSE",
        subjectType: "journal_entry", subjectId: original.id,
        data: { originalNumber: original.number, reversalNumber: r.number },
      });
      return r;
    });
    revalidatePath("/jurnal");
    return { ok: true, number: out.number };
  } catch (e) {
    return fail(e);
  }
}
