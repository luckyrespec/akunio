import { requireContext } from "@/server/auth/guard";
import { PageHeader } from "@/components/page-header";
import { KasirClient } from "./kasir-client";
import {
  getPosCashAccountsAction,
  getPosCatalogAction,
  getOpenShiftsAction,
} from "@/server/actions/pos.actions";

export const metadata = {
  title: "Kasir | Akunio",
  description: "Kasir cepat untuk toko dagang dan warung — jual, terima bayar, cetak struk.",
};

export default async function KasirPage() {
  await requireContext(["OWNER", "ACCOUNTANT"]);
  const [cashRes, catalogRes, shiftsRes] = await Promise.all([
    getPosCashAccountsAction(),
    getPosCatalogAction(),
    getOpenShiftsAction(),
  ]);
  const error = !cashRes.ok ? cashRes.error : !catalogRes.ok ? catalogRes.error : !shiftsRes.ok ? shiftsRes.error : null;

  return (
    <section className="w-full space-y-6">
      <PageHeader title="Kasir" eyebrow="Operasional · jual cepat, stok dan jurnal ikut tercatat" />
      {error || !cashRes.ok || !catalogRes.ok || !shiftsRes.ok ? (
        <p className="rounded-xl border border-rule bg-paper p-4 text-sm text-ink-soft">
          {error ?? "Gagal memuat data kasir."}
        </p>
      ) : (
        <KasirClient cashAccounts={cashRes.data} catalog={catalogRes.data} shifts={shiftsRes.data} />
      )}
    </section>
  );
}
