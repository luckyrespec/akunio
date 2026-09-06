import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getCashEntryDetailRepo } from "@/server/db/repos/cash-bank.repo";
import { getEntryWithLines, listEntryDocuments } from "@/server/db/repos/journals.repo";
import { CashEntryDetail } from "@/components/kas-bank/cash-entry-detail";
import { notFound } from "next/navigation";

export default async function PenerimaanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  const detail = await getCashEntryDetailRepo(db, ctx.orgId, id);
  if (!detail || detail.kind !== "TERIMA") {
    notFound();
  }
  const journal = detail.journalEntryId
    ? await getEntryWithLines(db, ctx.orgId, detail.journalEntryId)
    : null;
  const docs = detail.journalEntryId
    ? await listEntryDocuments(db, ctx.orgId, detail.journalEntryId)
    : [];

  return <CashEntryDetail detail={detail} journal={journal} docs={docs} />;
}
