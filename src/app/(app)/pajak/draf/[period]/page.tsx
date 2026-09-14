import { notFound } from "next/navigation";
import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import {
  getTaxSettings,
  upsertMonthlyTaxSummary,
  getTaxSummaryByMonth,
} from "@/server/db/repos/tax.repo";
import { generateTaxAccrualDraftAction } from "@/server/actions/tax.actions";
import { getDraft } from "@/server/db/repos/drafts.repo";
import { listAccounts } from "@/server/db/repos/accounts.repo";
import { TaxDraftReviewClient } from "./tax-draft-review-client";

interface PageProps {
  params: Promise<{ period: string }>;
}

export default async function TaxDraftReviewPage({ params }: PageProps) {
  const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
  const { period } = await params;

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    notFound();
  }

  // 1. Pastikan omzet & kalkulasi pajak bulanan mutakhir
  await withOrg(ctx.orgId, async (tx) => {
    await upsertMonthlyTaxSummary(tx, ctx.orgId, period);
  });

  // 2. Ambil ringkasan pajak masa tersebut
  let summary = await withOrg(ctx.orgId, async (tx) => {
    return getTaxSummaryByMonth(tx, ctx.orgId, period);
  });

  if (!summary) notFound();

  // 3. Jika belum ada draf akrual dan ada pajak terutang, buat drafnya
  if (!summary.accrualDraftId && summary.taxDueMinor > 0n && summary.status !== "PAID") {
    const genRes = await generateTaxAccrualDraftAction({ periodMonth: period });
    if (genRes.ok && genRes.draftId) {
      summary = await withOrg(ctx.orgId, async (tx) => {
        return getTaxSummaryByMonth(tx, ctx.orgId, period);
      });
    }
  }

  // 4. Ambil draf jurnal jika ada
  let draftData = null;
  if (summary?.accrualDraftId) {
    const rawDraft = await withOrg(ctx.orgId, async (tx) => {
      return getDraft(tx, ctx.orgId, summary!.accrualDraftId!);
    });
    if (rawDraft) {
      draftData = {
        id: rawDraft.id,
        status: rawDraft.status,
        draft: rawDraft.draft as {
          dateISO: string;
          memo: string;
          explanation: string;
          lines: Array<{
            accountCode: string;
            debitText: string;
            creditText: string;
            reason: string;
          }>;
        },
      };
    }
  }

  // 5. Ambil data pendukung (Pengaturan pajak & Akun Kas/Bank untuk opsi pelunasan langsung)
  const { settings, bankAccounts } = await withOrg(ctx.orgId, async (tx) => {
    const settings = await getTaxSettings(tx, ctx.orgId);
    const allAccounts = await listAccounts(tx, ctx.orgId);
    const bankAccounts = allAccounts
      .filter((a) => (a.isCash || a.isBank || a.type === "ASET") && !a.archivedAt)
      .map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
      }));
    return { settings, bankAccounts };
  });

  return (
    <TaxDraftReviewClient
      periodMonth={period}
      summary={summary!}
      draftData={draftData}
      settings={settings}
      bankAccounts={bankAccounts}
      userRole={ctx.role}
    />
  );
}
