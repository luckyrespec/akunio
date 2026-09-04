import Link from "next/link";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { accounts } from "@/server/db/schema/org";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { AsetBaruClient } from "./aset-baru-client";

export default async function AsetBaruPage() {
  const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);

  const allAccounts = await db
    .select({
      id: accounts.id,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      isCash: accounts.isCash,
      isBank: accounts.isBank,
      parentCode: accounts.parentCode,
    })
    .from(accounts)
    .where(eq(accounts.orgId, ctx.orgId));

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6">
      <div className="mb-2">
        <Link href="/aset" className="inline-flex items-center text-xs font-medium text-ink-soft hover:text-terra transition-colors">
          ← Kembali ke Daftar Aset
        </Link>
      </div>

      <PageHeader
        title="Tambah Aset Tetap"
        eyebrow="Daftarkan aset, atur penyusutan SAK EMKM, dan otomatis catat jurnal perolehan."
      />

      <AsetBaruClient accounts={allAccounts} />
    </section>
  );
}
