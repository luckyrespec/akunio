import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { getInventorySettings } from "@/server/db/repos/inventory.repo";
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

type RecordingMethod = "PERPETUAL" | "PERIODIC";

// Catatan PERIODIC hanya informatif — halaman kasir tak boleh 500 bila read preferensi gagal.
async function getRecordingMethodSafe(
  q: Parameters<typeof getInventorySettings>[0],
  orgId: string,
): Promise<RecordingMethod> {
  try {
    const s = await getInventorySettings(q, orgId);
    return s?.recordingMethod ?? "PERPETUAL";
  } catch {
    return "PERPETUAL";
  }
}

export default async function KasirPage() {
  const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
  const [cashRes, catalogRes, shiftsRes, recordingMethod] = await withOrg(ctx.orgId, (tx) =>
    Promise.all([
      getPosCashAccountsAction(),
      getPosCatalogAction(),
      getOpenShiftsAction(),
      getRecordingMethodSafe(tx, ctx.orgId),
    ]),
  );
  const error = !cashRes.ok ? cashRes.error : !catalogRes.ok ? catalogRes.error : !shiftsRes.ok ? shiftsRes.error : null;

  if (error || !cashRes.ok || !catalogRes.ok || !shiftsRes.ok) {
    return (
      <p className="m-4 rounded-xl border border-rule bg-paper p-4 text-sm text-ink-soft">
        {error ?? "Gagal memuat data kasir."}
      </p>
    );
  }
  return <KasirShell cashAccounts={cashRes.data} catalog={catalogRes.data} shifts={shiftsRes.data} recordingMethod={recordingMethod} />;
}
