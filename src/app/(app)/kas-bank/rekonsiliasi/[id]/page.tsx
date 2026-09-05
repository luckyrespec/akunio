import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
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

  const session = await getReconciliationByIdRepo(db, ctx.orgId, id);
  if (!session || !session.bankAccount) {
    notFound();
  }

  const unmatchedLedgerLines = await getUnmatchedLedgerLinesRepo(
    db,
    ctx.orgId,
    session.bankAccountId,
    session.statementDate
  );

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
