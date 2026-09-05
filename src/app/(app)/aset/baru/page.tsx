import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { accounts } from "@/server/db/schema/org";
import { eq } from "drizzle-orm";
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
    <section className="w-full space-y-6">
      <div className="mb-2">
        <Link href="/aset" className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-terra transition-colors">
          <ArrowLeft className="size-3.5" />
          Kembali ke Daftar Aset
        </Link>
      </div>

      <AsetBaruClient accounts={allAccounts} />
    </section>
  );
}
