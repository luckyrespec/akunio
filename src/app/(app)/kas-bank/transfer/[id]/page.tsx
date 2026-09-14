import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { getCashEntryDetailRepo } from "@/server/db/repos/cash-bank.repo";
import { getEntryWithLines, listEntryDocuments } from "@/server/db/repos/journals.repo";
import { CashEntryDetail } from "@/components/kas-bank/cash-entry-detail";
import { notFound } from "next/navigation";

export default async function TransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  const { detail, journal, docs } = await withOrg(ctx.orgId, async (tx) => {
    const detail = await getCashEntryDetailRepo(tx, ctx.orgId, id);
    if (!detail || detail.kind !== "TRANSFER") return { detail: null, journal: null, docs: [] };
    const journal = detail.journalEntryId
      ? await getEntryWithLines(tx, ctx.orgId, detail.journalEntryId)
      : null;
    const docs = detail.journalEntryId
      ? await listEntryDocuments(tx, ctx.orgId, detail.journalEntryId)
      : [];
    return { detail, journal, docs };
  });
  if (!detail) {
    notFound();
  }

  return <CashEntryDetail detail={detail} journal={journal} docs={docs} />;
}
