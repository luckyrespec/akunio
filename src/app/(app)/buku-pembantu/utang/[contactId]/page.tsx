import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Store } from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getContactCard } from "@/server/db/repos/subsidiary.repo";
import { PageHeader } from "@/components/page-header";
import { Money } from "@/core/money/money";
import { Reveal } from "@/components/motion";
import { ContactCardTable } from "@/components/subsidiary/contact-ledger";

interface UtangCardPageProps {
  params: Promise<{ contactId: string }>;
}

export default async function UtangCardPage({ params }: UtangCardPageProps) {
  const { contactId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contactId)) notFound();
  const ctx = await requireContext();
  const card = await getContactCard(db, ctx.orgId, contactId, "BILL");
  if (!card) notFound();

  const total = card.entries.reduce((a, e) => a + e.creditMinor, 0n);
  const paid = card.entries.reduce((a, e) => a + e.debitMinor, 0n);
  const sisa = card.entries.at(-1)?.balanceMinor ?? 0n;

  return (
    <div className="space-y-4">
      <Link href="/buku-pembantu/utang" className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink transition-colors">
        <ArrowLeft className="size-3.5" />
        <span>Kembali ke Kartu Utang</span>
      </Link>
      <PageHeader
        title={`Buku Pembantu — ${card.contact.name}`}
        eyebrow="Kartu utang: tagihan menambah, pelunasan mengurangi"
      />

      <Reveal delay={0.05}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-rule bg-paper p-3.5 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Pemasok</span>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-canvas border border-rule text-terra">
                <Store className="size-4" />
              </span>
              <span className="text-sm font-bold text-ink truncate" title={card.contact.name}>{card.contact.name}</span>
            </div>
          </div>
          <div className="rounded-2xl border border-rule bg-paper p-3.5 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Total Tagihan</span>
            <p className="mt-1 font-mono text-base font-bold text-ink">{Money.formatIdr(total)}</p>
          </div>
          <div className="rounded-2xl border border-rule bg-paper p-3.5 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Dilunasi</span>
            <p className="mt-1 font-mono text-base font-bold text-ink">{Money.formatIdr(paid)}</p>
          </div>
          <div className="rounded-2xl border border-rule bg-paper p-3.5 shadow-2xs md:col-span-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Sisa Utang</span>
            <p className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink tnum">{Money.formatIdr(sisa)}</p>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <ContactCardTable entries={card.entries} />
      </Reveal>
    </div>
  );
}
