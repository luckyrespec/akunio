import { requireContext } from "@/server/auth/guard";
import { KasirShell } from "./_components/kasir-shell";
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

  if (error || !cashRes.ok || !catalogRes.ok || !shiftsRes.ok) {
    return (
      <p className="m-4 rounded-xl border border-rule bg-paper p-4 text-sm text-ink-soft">
        {error ?? "Gagal memuat data kasir."}
      </p>
    );
  }
  return <KasirShell cashAccounts={cashRes.data} catalog={catalogRes.data} shifts={shiftsRes.data} />;
}
