import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { accounts as accountsTable } from "@/server/db/schema/org";
import { eq } from "drizzle-orm";
import { getDraft, effectiveStatus } from "@/server/db/repos/drafts.repo";
import { getDocumentRow } from "@/server/db/repos/documents.repo";
import { PageHeader } from "@/components/page-header";
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
        <Link href="/jurnal?tab=draft" className="text-xs text-ink-soft underline">← Draft AI</Link>
        <div className="mt-2">
          <PageHeader title="Draft sudah diproses" eyebrow="Jurnal AI" />
        </div>
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
  const mergedLines = raw.lines.map((l, i) => ({
    ...l,
    accountId: mappedLines[i]?.accountId ?? null,
    matchedName: mappedLines[i]?.matchedName ?? null,
    unresolved: mappedLines[i]?.unresolved ?? true,
  }));
  const reviewDraft = {
    dateISO: raw.dateISO, memo: raw.memo,
    lines: mergedLines, overallConfidence: raw.overallConfidence,
    explanation: raw.explanation, mapping: raw.mapping,
  };

  return (
    <section>
      <Link href="/jurnal?tab=draft" className="text-xs text-ink-soft underline">← Draft AI</Link>
      <div className="mt-2">
        <PageHeader title="Review Draft Asisten" eyebrow="Jurnal AI" />
      </div>
      <ReviewClient
        draftId={data.draft.id}
        draft={reviewDraft}
        accounts={leaves.map((a) => ({ id: a.id, label: `${a.code} · ${a.name}` }))}
        documentMeta={doc ? { mime: doc.mime, storageKey: doc.storageKey } : null}
      />
    </section>
  );
}
