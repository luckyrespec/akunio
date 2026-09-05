import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listCashEntriesRepo } from "@/server/db/repos/cash-bank.repo";
import { Money } from "@/core/money/money";

const KIND = "TERIMA" as const;

export default async function PenerimaanPage() {
  const ctx = await requireContext();
  const entries = await listCashEntriesRepo(db, ctx.orgId, KIND);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">
          Penerimaan
        </h1>
        <p className="text-sm text-ink-soft">
          Catat pemasukan kas/bank — otomatis menjadi jurnal.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-soft">
            <th className="py-2 pr-4 font-medium">Tanggal</th>
            <th className="py-2 pr-4 font-medium">Nomor</th>
            <th className="py-2 pr-4 font-medium">Keterangan</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 font-medium text-right">Nominal</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-t border-rule">
              <td className="py-2 pr-4">{e.entryDate}</td>
              <td className="py-2 pr-4">{e.number}</td>
              <td className="py-2 pr-4">{e.memo}</td>
              <td className="py-2 pr-4">{e.status}</td>
              <td className="py-2 text-right">
                {Money.formatIdr(e.amountMinor)}
              </td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr className="border-t border-rule">
              <td colSpan={5} className="py-6 text-center text-ink-soft">
                Belum ada penerimaan tercatat.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
