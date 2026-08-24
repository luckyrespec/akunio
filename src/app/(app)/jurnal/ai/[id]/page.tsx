import Link from "next/link";
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
        <Link href="/jurnal?tab=draft" className="text-xs text-ink-soft underline">← Draft AI</Link>
        <h1 className="mt-2 font-display text-2xl">Draft sudah diproses</h1>
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

  return (
    <section>
      <Link href="/jurnal?tab=draft" className="text-xs text-ink-soft underline">← Draft AI</Link>
      <h1 className="mt-2 font-display text-2xl">Review Draft Asisten</h1>
      <ReviewClient
        draftId={data.draft.id}
        draft={data.draft.draft as never}
        accounts={leaves.map((a) => ({ id: a.id, label: `${a.code} · ${a.name}` }))}
        documentMeta={doc ? { mime: doc.mime, storageKey: doc.storageKey } : null}
      />
    </section>
  );
}
