import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { getIntangibleDetail } from "@/server/db/repos/intangible-assets.repo";
import { db } from "@/server/db";
import { accounts } from "@/server/db/schema/org";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { AnimatedNumber } from "@/components/motion";
import { Money } from "@/core/money/money";
import { IntangibleDetailClient } from "./detail-client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function IntangibleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const ctx = await requireContext();
  const card = await withOrg(ctx.orgId, (tx) => getIntangibleDetail(tx, ctx.orgId, id));
  if (!card) notFound();

  const allAccounts = await db
    .select({
      id: accounts.id,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      isCash: accounts.isCash,
      isBank: accounts.isBank,
      parentCode: accounts.parentCode,
    })
    .from(accounts)
    .where(eq(accounts.orgId, ctx.orgId));
  const leaves = allAccounts.filter((a) => !allAccounts.some((c) => c.parentCode === a.code));
  const depositAccounts = leaves.filter((a) => a.isCash || a.isBank);
  const gainLossAccounts = leaves.filter((a) => a.type === "PENDAPATAN" || a.type === "BEBAN");

  const { asset, schedule } = card;
  const accumulatedMinor = schedule
    .filter((l) => l.status === "POSTED")
    .reduce((a, l) => a + l.amortizationAmountMinor, 0n);
  const remainingMinor = asset.acquisitionCostMinor - accumulatedMinor;
  const pct =
    asset.acquisitionCostMinor > 0n
      ? Number((accumulatedMinor * 100n) / asset.acquisitionCostMinor)
      : 0;

  return (
    <div className="space-y-4">
      <Link href="/aset-takberwujud" className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink transition-colors">
        <ArrowLeft className="size-3.5" />
        <span>Kembali ke Aset Takberwujud</span>
      </Link>
      <PageHeader
        title={`${asset.code} · ${asset.name}`}
        eyebrow="Kartu aset takberwujud — jadwal amortisasi garis lurus SAK EMKM Bab 12"
      />

      <div className="grid gap-3 rounded-xl border border-rule bg-paper p-4 shadow-2xs sm:grid-cols-3 text-xs tnum">
        <div>
          <p className="text-ink-soft">Biaya perolehan</p>
          <p className="mt-1 font-mono font-bold text-ink text-sm">{Money.formatIdr(asset.acquisitionCostMinor)}</p>
        </div>
        <div>
          <p className="text-ink-soft">Sudah diamortisasi</p>
          <p className="mt-1 font-mono text-ink text-sm">{Money.formatIdr(accumulatedMinor)}</p>
        </div>
        <div>
          <p className="text-ink-soft">Nilai buku ({Math.min(pct, 100)}% teramortisasi)</p>
          <AnimatedNumber
            minor={remainingMinor}
            className="mt-1 block font-display text-xl font-semibold tracking-tight text-ink tnum"
          />
          <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10">
            <div
              className="h-full rounded-full bg-terra/70"
              style={{ width: `${Math.max(Math.min(pct, 100), 2)}%` }}
            />
          </div>
        </div>
      </div>

      <IntangibleDetailClient
        assetId={asset.id}
        lines={schedule}
        totals={{
          totalMinor: asset.acquisitionCostMinor,
          accumulatedMinor,
          remainingMinor,
        }}
        depositAccounts={depositAccounts}
        gainLossAccounts={gainLossAccounts.length > 0 ? gainLossAccounts : leaves}
      />
    </div>
  );
}
