"use server";
import { revalidatePath } from "next/cache";
import { requireContext } from "@/server/auth/guard";
import { isRedirectError } from "./redirect-guard";
import { db } from "@/server/db";
import { withOrg } from "@/server/db/repos/with-org";
import { appendAudit } from "@/server/db/repos/audit.repo";
import {
  postJournalEntry, getPostedEntry, linkDocumentToEntry, PostingError,
} from "@/server/db/repos/journals.repo";
import { makeReversal } from "@/core/journals/validate";
import { issueToMessage } from "@/core/journals/messages";
import { Money } from "@/core/money/money";

export interface ActionResult {
  ok: boolean;
  error?: string;
  number?: string;
  id?: string;
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
  document?: { id: string; fileName?: string };
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
    const out = await withOrg(ctx.orgId, async (tx) => {
      const r = await postJournalEntry(tx, ctx.orgId, ctx.userEmail, entry);
      if (payload.document) {
        await linkDocumentToEntry(tx, {
          orgId: ctx.orgId,
          entryId: r.id,
          documentId: payload.document.id,
          fileName: payload.document.fileName,
        });
      }
      await appendAudit(tx, {
        orgId: ctx.orgId, actor: ctx.userEmail, action: "JOURNAL_POST",
        subjectType: "journal_entry", subjectId: r.id,
        data: { number: r.number, memo: entry.memo, documentId: payload.document?.id ?? null },
      });
      return r;
    });
    revalidatePath("/jurnal");
    return { ok: true, number: out.number, id: out.id };
  } catch (e) {
    return fail(e);
  }
}

export async function reverseEntryAction(entryId: string, dateISO: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const out = await withOrg(ctx.orgId, async (tx) => {
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

export interface JournalDetailLineResult {
  accountCode: string;
  accountName: string;
  debitMinor: string;
  creditMinor: string;
  memo: string | null;
}

export interface JournalDetailResult {
  ok: boolean;
  number?: string;
  data?: {
    id: string;
    number: string;
    entryDate: string;
    memo: string;
    status: string;
    lines: JournalDetailLineResult[];
  };
  error?: string;
}

/**
 * Rincian satu jurnal untuk sheet drawer (dipakai chat Akunio + reusable).
 * Lookup per nomor (JE-YYYY-NNNN). Nominal diserialkan ke string.
 */
export async function getJournalDetailAction(number: string): Promise<JournalDetailResult> {
  try {
    const ctx = await requireContext();
    const clean = number.trim().toUpperCase();
    if (!clean) return fail(new Error("Nomor jurnal kosong."));
    const { searchEntriesWithLines } = await import("@/server/db/repos/journals.repo");
    const hits = await searchEntriesWithLines(db, ctx.orgId, clean, 5);
    const entry = hits.find((e) => e.number.toUpperCase() === clean) ?? hits[0];
    if (!entry) return fail(new Error(`Jurnal ${clean} tidak ditemukan.`));
    return {
      ok: true,
      number: entry.number,
      data: {
        id: entry.id,
        number: entry.number,
        entryDate: entry.entryDate,
        memo: entry.memo,
        status: entry.status,
        lines: entry.lines.map((l) => ({
          accountCode: l.accountCode,
          accountName: l.accountName,
          debitMinor: l.debitMinor.toString(),
          creditMinor: l.creditMinor.toString(),
          memo: l.memo,
        })),
      },
    };
  } catch (e) {
    return fail(e);
  }
}
