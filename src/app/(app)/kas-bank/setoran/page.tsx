import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { PageHeader } from "@/components/page-header";
import { SetoranClient } from "./setoran-client";
import {
  getPosCashAccountsAction,
  getVarianceAccountOptionsAction,
  getOpenShiftsAction,
} from "@/server/actions/pos.actions";

export const metadata = {
  title: "Setoran Shift | Akunio",
  description: "Buka dan tutup shift kasir, hitung setoran, selisihkan kas.",
};

export default async function SetoranPage() {
  await requireContext(["OWNER", "ACCOUNTANT"]);
  const [cashRes, varianceRes, shiftsRes] = await Promise.all([
    getPosCashAccountsAction(),
    getVarianceAccountOptionsAction(),
    getOpenShiftsAction(),
  ]);
  const error = !cashRes.ok
    ? cashRes.error
    : !varianceRes.ok
      ? varianceRes.error
      : !shiftsRes.ok
        ? shiftsRes.error
        : null;

  return (
    <section className="w-full space-y-6">
      <div className="mb-2">
        <Link
          href="/kas-bank/pembayaran"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-terra transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Kembali ke Kas &amp; Bank
        </Link>
      </div>
      <PageHeader title="Setoran Shift" eyebrow="Kas & Bank · tutup shift kasir dan selisihkan kas" />
      {error || !cashRes.ok || !varianceRes.ok || !shiftsRes.ok ? (
        <p className="rounded-xl border border-rule bg-paper p-4 text-sm text-ink-soft">
          {error ?? "Gagal memuat data setoran."}
        </p>
      ) : (
        <SetoranClient
          cashAccounts={cashRes.data}
          varianceAccounts={varianceRes.data}
          initialShifts={shiftsRes.data}
        />
      )}
    </section>
  );
}
