import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/core/money/money";
import { getSubledgerReconAction } from "@/server/actions/subledger.actions";
import { RunCheckButton } from "./run-check-button";

const KIND_LABEL: Record<string, string> = {
  PIUTANG: "Piutang Usaha per Pelanggan",
  UTANG: "Utang Usaha per Pemasok",
  PERSEDIAAN: "Persediaan per SKU",
};

export default async function BukuPembantuPage() {
  const rows = await getSubledgerReconAction();

  return (
    <div>
      <PageHeader
        title="Buku Pembantu"
        eyebrow="Total rincian vs saldo akun kontrol — harus nol selisih"
        actions={<RunCheckButton />}
      />
      <div className="rounded-xl border border-rule overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase text-ink-soft border-b border-rule">
              <th className="text-left font-semibold px-4 py-2">Buku Pembantu</th>
              <th className="text-right font-semibold px-4 py-2">Saldo Kontrol</th>
              <th className="text-right font-semibold px-4 py-2">Total Pembantu</th>
              <th className="text-right font-semibold px-4 py-2">Selisih</th>
              <th className="text-right font-semibold px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ok = r.differenceMinor === "0";
              return (
                <tr key={r.kind} data-testid="subledger-row" className="border-b border-rule/60 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-ink">{KIND_LABEL[r.kind] ?? r.kind}</td>
                  <td className="px-4 py-2.5 text-right tnum">{Money.formatIdr(r.controlBalanceMinor)}</td>
                  <td className="px-4 py-2.5 text-right tnum">{Money.formatIdr(r.subledgerTotalMinor)}</td>
                  <td className="px-4 py-2.5 text-right tnum">{Money.formatIdr(r.differenceMinor)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Badge variant={ok ? "outline" : "destructive"}>{ok ? "Cocok" : "Selisih"}</Badge>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-soft">
                  Belum ada akun kontrol terdaftar. Selesaikan onboarding untuk seed registry subledger.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
