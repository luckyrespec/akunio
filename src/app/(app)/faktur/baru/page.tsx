import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listContactsRepo } from "@/server/db/repos/contacts.repo";
import { organizations } from "@/server/db/schema/org";
import { FakturBaruClient } from "./faktur-baru-client";
import type { InvoiceType } from "@/server/db/schema/invoicing";
import { eq } from "drizzle-orm";

export default async function FakturBaruPage({
  searchParams,
}: {
  searchParams: Promise<{ tipe?: string }>;
}) {
  const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
  const sp = await searchParams;
  const tipe: InvoiceType = sp.tipe === "bill" ? "BILL" : "INVOICE";

  const [contactsList, [org]] = await Promise.all([
    listContactsRepo(db, ctx.orgId),
    db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, ctx.orgId)),
  ]);

  return (
    <section className="w-full space-y-0">
      <FakturBaruClient
        contacts={contactsList.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          paymentTermsDays: c.paymentTermsDays,
        }))}
        initialType={tipe}
        orgName={org?.name || "Perusahaan"}
      />
    </section>
  );
}
