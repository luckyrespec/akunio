import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { accounts as accountsTable } from "@/server/db/schema/org";
import { eq } from "drizzle-orm";
import { getDraft, effectiveStatus } from "@/server/db/repos/drafts.repo";
import { getDocumentRow } from "@/server/db/repos/documents.repo";
import { ReviewClient } from "./review-client";

export default async function ReviewPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
  const { id } = await params;

  const data = await db.transaction(async (tx) => {
    const draft = await getDraft(tx, ctx.orgId, id);
    const accRows = await tx.select().from(accountsTable).where(eq(accountsTable.orgId, ctx.orgId));
    return { draft, accRows };
  });
  if (!data.draft) notFound();

  const status = effectiveStatus(data.draft, new Date());
  if (status !== "PENDING") {
    return (
      <section className="max-w-2xl">
        <Link href="/jurnal" className="inline-flex items-center gap-1 text-xs text-ink-soft underline">
          <ArrowLeft className="size-3" />
          Jurnal Umum
        </Link>
        <h1 className="mt-2 font-display text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
          Draft sudah diproses
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Status draft ini: {status === "ACCEPTED" ? "diterima & diposting" : "ditolak"}.
        </p>
      </section>
    );
  }

  const leaves = data.accRows.filter((a) => !data.accRows.some((c) => c.parentCode === a.code));
  const doc = data.draft.documentId
    ? await getDocumentRow(db, ctx.orgId, data.draft.documentId)
    : null;
  // Merge account mapping (stored separately) into each line for the review UI.
  const raw = data.draft.draft as {
    dateISO: string;
    memo: string;
    lines: Array<Record<string, unknown> & {
      accountCode: string; debitText: string; creditText: string;
      confidence: number; reason: string;
    }>;
    overallConfidence: number;
    explanation: string;
    mapping?: {
      lines: Array<{ accountId: string | null; matchedName: string | null; unresolved: boolean }>;
      warnings: string[];
    };
  };
  const mappedLines = raw.mapping?.lines ?? [];
  // Sembuhkan draf lama: hitung ulang mapping ke COA saat ini agar draf yang
  // tersimpan sebelum perbaikan (tanpa mapping) ikut ter-resolve. Kode valid
  // seperti 5100 langsung terpilih; kode fiktif (1180) tetap unresolved jujur.
  const { resolveDraftAccounts } = await import("@/core/ai/map-accounts");
  const fresh = resolveDraftAccounts(
    { lines: raw.lines.map((l) => ({ accountCode: l.accountCode })) },
    leaves.map((a) => ({ id: a.id, code: a.code, name: a.name })),
  );
  const mergedLines = raw.lines.map((l, i) => {
    const m = fresh.lines[i] ?? mappedLines[i];
    const unresolved = m?.unresolved ?? true;
    const confidence = unresolved ? Math.min(l.confidence ?? 0, 0.45) : (l.confidence ?? 0);
    const reason = unresolved && !/tidak ada di COA|tidak ada akun yang cocok/i.test(l.reason ?? "")
      ? `${l.reason} (kode ${l.accountCode} tidak ada di COA — pilih akun pengganti)`
      : l.reason;
    return {
      ...l,
      accountId: m?.accountId ?? null,
      matchedName: m?.matchedName ?? null,
      unresolved,
      confidence,
      reason,
    };
  });
  const reviewDraft = {
    dateISO: raw.dateISO, memo: raw.memo,
    lines: mergedLines, overallConfidence: raw.overallConfidence,
    explanation: raw.explanation, mapping: { warnings: fresh.warnings },
  };

  return (
    <section>
      <Link href="/jurnal" className="inline-flex items-center gap-1 text-xs text-ink-soft underline">
        <ArrowLeft className="size-3" />
        Jurnal Umum
      </Link>
      <div className="mt-2">
        <ReviewClient
          draftId={data.draft.id}
          draft={reviewDraft}
          accounts={leaves.map((a) => ({
            id: a.id,
            code: a.code,
            name: a.name,
            label: `${a.code} · ${a.name}`,
          }))}
          documentMeta={doc ? { mime: doc.mime, storageKey: doc.storageKey } : null}
        />
      </div>
    </section>
  );
}
