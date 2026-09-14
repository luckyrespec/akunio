import Link from "next/link";
import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { listAccountsWithBalances } from "@/server/db/repos/ledger.repo";
import { PageHeader } from "@/components/page-header";
import { LedgerClient, type AccountBalanceItem } from "@/components/ledger/ledger-client";
import { Button } from "@/components/ui/button";
import { BookOpen, Plus } from "lucide-react";

export default async function BukuBesarPage() {
  const ctx = await requireContext();

  const accounts = await withOrg(ctx.orgId, (tx) =>
    listAccountsWithBalances(tx, ctx.orgId),
  );

  const clientAccounts: AccountBalanceItem[] = accounts.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type as AccountBalanceItem["type"],
    normal: a.normal,
    parentCode: a.parentCode,
    archivedAt: a.archivedAt ? a.archivedAt.toISOString() : null,
    debitMinor: a.debitMinor.toString(),
    creditMinor: a.creditMinor.toString(),
    balanceMinor: a.balanceMinor.toString(),
    transactionCount: a.transactionCount,
  }));

  return (
    <section className="space-y-6">
      <PageHeader
        title="Buku Besar"
        eyebrow="Daftar bagan akun (COA) dengan akumulasi saldo mutasi & riwayat transaksi"
        actions={
          <div className="flex items-center gap-2.5">
            <Link href="/jurnal">
              <Button variant="outline" size="sm" className="border-rule bg-paper hover:bg-canvas text-xs gap-1.5 shadow-2xs">
                <BookOpen className="size-3.5 text-ink-soft" />
                <span>Lihat Jurnal</span>
              </Button>
            </Link>
            <Link href="/jurnal/baru">
              <Button size="sm" className="bg-terra text-white hover:bg-terra/90 text-xs gap-1.5 shadow-xs">
                <Plus className="size-3.5" />
                <span>Tulis Jurnal</span>
              </Button>
            </Link>
          </div>
        }
      />

      <LedgerClient accounts={clientAccounts} />
    </section>
  );
}
