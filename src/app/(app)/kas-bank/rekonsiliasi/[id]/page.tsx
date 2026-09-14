import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import {
  getReconciliationByIdRepo,
  getUnmatchedLedgerLinesRepo,
} from "@/server/db/repos/reconciliation.repo";
import { ReconciliationWorksheet } from "@/components/reconciliation/reconciliation-worksheet";
import { notFound } from "next/navigation";

interface ReconciliationDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReconciliationDetailPage({
  params,
}: ReconciliationDetailPageProps) {
  const { id } = await params;
  const ctx = await requireContext();

  const { session, unmatchedLedgerLines } = await withOrg(ctx.orgId, async (tx) => {
    const session = await getReconciliationByIdRepo(tx, ctx.orgId, id);
    if (!session || !session.bankAccount) return { session: null, unmatchedLedgerLines: [] };
    const unmatchedLedgerLines = await getUnmatchedLedgerLinesRepo(
      tx,
      ctx.orgId,
      session.bankAccountId,
      session.statementDate
    );
    return { session, unmatchedLedgerLines };
  });
  if (!session) {
    notFound();
  }

  const formattedSession = {
    id: session.id,
    bankAccountCode: session.bankAccount.code,
    bankAccountName: session.bankAccount.name,
    statementDate: session.statementDate,
    statementBalanceMinor: session.statementBalanceMinor,
    ledgerBalanceMinor: session.ledgerBalanceMinor,
    differenceMinor: session.differenceMinor,
    status: session.status,
    notes: session.notes,
  };

  return (
    <div className="py-2">
      <ReconciliationWorksheet
        session={formattedSession}
        statementLines={session.lines}
        unmatchedLedgerLines={unmatchedLedgerLines}
      />
    </div>
  );
}
