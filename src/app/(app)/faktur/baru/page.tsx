import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { listContactsRepo } from "@/server/db/repos/contacts.repo";
import { getInventorySettings, listInventoryItems } from "@/server/db/repos/inventory.repo";
import { organizations } from "@/server/db/schema/org";
import { FakturBaruClient } from "./faktur-baru-client";
import type { InvoiceType } from "@/server/db/schema/invoicing";
import { eq } from "drizzle-orm";

type RecordingMethod = "PERPETUAL" | "PERIODIC";

// Catatan PERIODIC hanya informatif — halaman faktur tak boleh 500 bila read preferensi gagal.
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

export default async function FakturBaruPage({
  searchParams,
}: {
  searchParams: Promise<{ tipe?: string }>;
}) {
  const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
  const sp = await searchParams;
  const tipe: InvoiceType = sp.tipe === "bill" ? "BILL" : "INVOICE";

  // withOrg terpisah per query: satu pg client tak boleh query konkuren.
  const [contactsList, [org], catalogItems, recordingMethod] = await Promise.all([
    withOrg(ctx.orgId, (tx) => listContactsRepo(tx, ctx.orgId)),
    withOrg(ctx.orgId, (tx) =>
      tx.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, ctx.orgId)),
    ),
    withOrg(ctx.orgId, (tx) => listInventoryItems(tx, ctx.orgId)),
    withOrg(ctx.orgId, (tx) => getRecordingMethodSafe(tx, ctx.orgId)),
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
        catalog={catalogItems
          .filter((i) => i.isActive)
          .map((i) => ({
            id: i.id,
            name: i.name,
            itemType: i.itemType,
            priceMinor: i.standardSellingPriceMinor.toString(),
            qty: i.currentQty,
            unit: i.unit,
          }))}
        recordingMethod={recordingMethod}
      />
    </section>
  );
}
