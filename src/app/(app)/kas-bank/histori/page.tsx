import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getCashHistoryRepo } from "@/server/db/repos/cash-bank.repo";
import { accounts } from "@/server/db/schema/org";
import { Money } from "@/core/money/money";
import { HistoryTable } from "@/components/kas-bank/history-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { eq, and, or } from "drizzle-orm";

function monthRange(d: Date): { dari: string; sampai: string } {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const last = new Date(y, d.getMonth() + 1, 0).getDate();
  return { dari: `${y}-${m}-01`, sampai: `${y}-${m}-${last}` };
}

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
  const def = monthRange(new Date());
  const akun = sp.akun ?? cashAccounts[0]?.id ?? "";
  const dari = sp.dari ?? def.dari;
  const sampai = sp.sampai ?? def.sampai;
  const history = akun
    ? await getCashHistoryRepo(db, ctx.orgId, akun, dari, sampai)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">
          Histori Bank
        </h1>
        <p className="text-sm text-ink-soft">
          Mutasi kas/bank versi pembukuan — dasar pencocokan rekonsiliasi.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="hist-akun" className="text-xs font-medium text-ink">
            Akun
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
            Dari
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
            Sampai
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
        <p className="text-sm text-ink-soft">
          {history.account.code} {history.account.name} · Saldo awal{" "}
          {Money.formatIdr(history.openingMinor)}
        </p>
      )}
      {history && <HistoryTable rows={history.rows} />}
    </div>
  );
}
