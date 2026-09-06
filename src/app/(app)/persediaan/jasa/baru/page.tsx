import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { accounts } from "@/server/db/schema/org";
import { eq } from "drizzle-orm";
import { JasaBaruClient } from "./jasa-baru-client";

export const metadata = {
  title: "Tambah Jasa | Akunio",
  description: "Daftarkan layanan baru ke katalog jasa.",
};

export default async function JasaBaruPage() {
  const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
  const allAccounts = await db
    .select({
      id: accounts.id,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
    })
    .from(accounts)
    .where(eq(accounts.orgId, ctx.orgId));

  return <JasaBaruClient accounts={allAccounts} />;
}
