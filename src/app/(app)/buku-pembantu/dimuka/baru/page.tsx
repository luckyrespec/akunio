import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { listAccounts } from "@/server/db/repos/accounts.repo";
import { PageHeader } from "@/components/page-header";
import { DimukaForm } from "./dimuka-form";

export default async function DimukaBaruPage() {
  const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
  const rows = await withOrg(ctx.orgId, (tx) => listAccounts(tx, ctx.orgId));
  const active = rows.filter((a) => !a.archivedAt);
  const leaves = active.filter((a) => !active.some((c) => c.parentCode === a.code));
  const control = leaves.find((a) => a.code === "1600");
  const expenseDefault = leaves.find((a) => a.code === "5300") ?? leaves.find((a) => a.type === "BEBAN") ?? null;
  const cashIds = leaves.filter((a) => a.isCash || a.isBank).map((a) => a.id);
  const options = leaves.map((a) => ({ id: a.id, code: a.code, name: a.name, label: `${a.code} · ${a.name}` }));

  return (
    <div className="space-y-4">
      <Link href="/buku-pembantu/dimuka" className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink transition-colors">
        <ArrowLeft className="size-3.5" />
        <span>Kembali ke Kartu Dimuka</span>
      </Link>
      <PageHeader
        title="Kontrak Baru"
        eyebrow="Catat sewa atau asuransi dibayar di muka — jurnal awal dan jadwal bulanan dibuat otomatis"
      />
      {!control ? (
        <div className="rounded-xl border border-rule bg-paper p-8 text-center text-xs text-ink-soft shadow-2xs">
          Akun 1600 Sewa Dibayar di Muka tidak ditemukan di bagan akun. Tambahkan dulu via Pengaturan.
        </div>
      ) : (
        <DimukaForm
          accountOptions={options}
          controlAccountId={control.id}
          defaultExpenseAccountId={expenseDefault?.id ?? null}
          cashAccountIds={cashIds}
        />
      )}
    </div>
  );
}
