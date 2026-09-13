"use server";
import { revalidatePath } from "next/cache";
import { requireContext } from "@/server/auth/guard";
import { isRedirectError } from "./redirect-guard";
import { db } from "@/server/db";
import { withOrg } from "@/server/db/repos/with-org";
import { appendAudit } from "@/server/db/repos/audit.repo";
import {
  postJournalEntry, getPostedEntry, linkDocumentToEntry, PostingError,
  findReversalEntries,
} from "@/server/db/repos/journals.repo";
import { makeReversal } from "@/core/journals/validate";
import type { JournalSource } from "@/core/journals/types";
import type { SubledgerLinkInput } from "@/core/subledger/guard";
import { listLinksForEntry } from "@/server/db/repos/subledger.repo";
import { issueToMessage } from "@/core/journals/messages";
import { Money } from "@/core/money/money";
import {
  ALLOWED_MIMES,
  MAX_DOCUMENT_BYTES,
  putDocument,
} from "@/server/storage/storage";
import { createDocumentRow } from "@/server/db/repos/documents.repo";

export interface ActionResult {
  ok: boolean;
  error?: string;
  number?: string;
  id?: string;
}

// revalidatePath melempar di luar request-scope Next (mis. vitest di balik
// seam TEST_CTX_ORG) — padahal posting/audit sudah komit. Pola yang sama
// dipakai tax.actions.ts agar server action tetap teruji langsung.
function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {}
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
  /** Kunci per submit dari client (crypto.randomUUID per form instance). */
  idempotencyKey?: string;
}): Promise<ActionResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]); // viewer may not post
    const entry = {
      dateISO: payload.dateISO,
      memo: payload.memo.trim() || "(tanpa keterangan)",
      source: "MANUAL" as const,
      idempotencyKey: payload.idempotencyKey?.trim() || crypto.randomUUID(),
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
    safeRevalidate("/jurnal");
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
      // Idempoten: balikan ganda (double-klik / retry) kembali ke record sama.
      const [existing] = await findReversalEntries(tx, ctx.orgId, original.id);
      if (existing) return { id: existing.id, number: existing.number };
      // Reversal mewarisi source + mirror links entri asal (refId dan
      // amountMinor sama) agar lolos guard kontrol modul (mis. DOCUMENT).
      const origLinkRows = await listLinksForEntry(tx, ctx.orgId, original.id);
      const linksByLine = new Map<string, SubledgerLinkInput[]>();
      for (const r of origLinkRows) {
        if (!r.linkId) continue;
        const arr = linksByLine.get(r.lineId) ?? [];
        arr.push({
          kind: r.kind as SubledgerLinkInput["kind"],
          refId: r.refId!,
          amountMinor: r.amountMinor!,
        });
        linksByLine.set(r.lineId, arr);
      }
      const reversalInput = makeReversal(
        {
          number: original.number,
          source: (original.source ?? "MANUAL") as JournalSource,
          lines: original.lines.map((l) => ({
            accountId: l.accountId, debitMinor: l.debitMinor, creditMinor: l.creditMinor,
            ...(linksByLine.get(l.id)?.length ? { subledgerLinks: linksByLine.get(l.id)! } : {}),
          })),
        },
        dateISO,
      );
      // Kunci deterministik per jurnal asal: race konkuren runtuh ke satu
      // record via tangkapan je_org_idem_uq di postJournalEntry.
      reversalInput.idempotencyKey = `reversal-${original.id}`;
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
    safeRevalidate("/jurnal");
    return { ok: true, number: out.number, id: out.id };
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
}export interface JournalDetailResult {
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

/**
 * Lampirkan dokumen bukti ke entri jurnal — berlaku untuk draf maupun POSTED.
 * Lampiran adalah bukti audit, bukan isi buku besar; baris jurnal tetap terkunci.
 */
export async function attachJournalDocumentAction(entryId: string, formData: FormData) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false as const, error: "File lampiran wajib diisi." };
    }
    if (!ALLOWED_MIMES.includes(file.type as never)) {
      return { ok: false as const, error: "Tipe lampiran harus gambar, PDF, atau spreadsheet." };
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      return { ok: false as const, error: "Ukuran lampiran maksimal 5 MB." };
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const { storageKey } = await putDocument(ctx.orgId, { buffer, mime: file.type });
    await withOrg(ctx.orgId, async (tx) => {
      const doc = await createDocumentRow(tx, {
        orgId: ctx.orgId,
        storageKey,
        mime: file.type,
        sizeBytes: file.size,
      });
      await linkDocumentToEntry(tx, {
        orgId: ctx.orgId,
        entryId,
        documentId: doc.id,
        fileName: file.name,
      });
    });
    revalidatePath(`/jurnal/${entryId}`);
    revalidatePath("/jurnal");
    revalidatePath("/persediaan/opname");
    return { ok: true as const };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    const raw = e instanceof Error ? e.message : "Gagal mengunggah lampiran.";
    const friendly = raw.startsWith("JURNAL_TIDAK_DITEMUKAN")
      ? "Jurnal tidak ditemukan."
      : raw;
    return { ok: false as const, error: friendly };
  }
}
