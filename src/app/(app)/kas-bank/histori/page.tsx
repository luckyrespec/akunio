import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getCashHistoryRepo } from "@/server/db/repos/cash-bank.repo";
import { accounts } from "@/server/db/schema/org";
import { Money } from "@/core/money/money";
import { PageHeader } from "@/components/page-header";
import { HistoryTable } from "@/components/kas-bank/history-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { eq, and, or } from "drizzle-orm";
import { currentMonthRange } from "../_data";

export default async function HistoriPage({
  searchParams,
}: {
  searchParams: Promise<{ akun?: string; dari?: string; sampai?: string }>;
}) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const cashAccounts = await db
    .select({ id: accounts.id, code: accounts.code, name: accounts.name })
    .from(accounts)
    .where(
      and(
        eq(accounts.orgId, ctx.orgId),
        or(eq(accounts.isBank, true), eq(accounts.isCash, true))
      )
    );
  const def = currentMonthRange();
  const akun = sp.akun ?? cashAccounts[0]?.id ?? "";
  const dari = sp.dari ?? def.dari;
  const sampai = sp.sampai ?? def.sampai;
  const history = akun
    ? await getCashHistoryRepo(db, ctx.orgId, akun, dari, sampai)
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Histori Bank"
        eyebrow="Mutasi kas dan bank versi pembukuan. Bandingkan dengan rekening koran saat rekonsiliasi."
      />

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-rule bg-paper p-4 shadow-2xs"
      >
        <div className="space-y-1.5">
          <Label htmlFor="hist-akun" className="text-xs font-medium text-ink">
            Rekening
          </Label>
          <select
            id="hist-akun"
            name="akun"
            defaultValue={akun}
            className="rounded-md border border-rule bg-canvas px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-terra"
          >
            {cashAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} - {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hist-dari" className="text-xs font-medium text-ink">
            Dari tanggal
          </Label>
          <Input
            id="hist-dari"
            name="dari"
            type="date"
            defaultValue={dari}
            className="text-xs bg-canvas"
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="hist-sampai"
            className="text-xs font-medium text-ink"
          >
            Sampai tanggal
          </Label>
          <Input
            id="hist-sampai"
            name="sampai"
            type="date"
            defaultValue={sampai}
            className="text-xs bg-canvas"
          />
        </div>
        <Button type="submit" size="sm" variant="outline" className="text-xs">
          Tampilkan
        </Button>
      </form>

      {history && (
        <HistoryTable
          lede={`${history.account.code} ${history.account.name} · Saldo awal periode ${Money.formatIdr(history.openingMinor)}`}
          rows={history.rows}
        />
      )}
    </div>
  );
}
