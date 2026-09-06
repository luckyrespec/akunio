import { describe, it, expect, beforeEach } from "vitest";
import { truncateAll, makeOrg } from "./helpers";
import { withOrg } from "@/server/db/repos/with-org";
import { createInventoryItem, listItemTransactions } from "@/server/db/repos/inventory.repo";

describe("katalog jasa", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("SKU jasa prefix JSA- dan tanpa layer/transaksi", async () => {
    const { orgId } = await makeOrg("salon");
    const item = await withOrg(orgId, (tx) =>
      createInventoryItem(tx, orgId, {
        itemType: "JASA",
        name: "Cuci Rambut",
        standardSellingPriceMinor: 50000n,
      }),
    );
    expect(item.code.startsWith("JSA-")).toBe(true);
    expect(item.itemType).toBe("JASA");
    const txs = await withOrg(orgId, (tx) => listItemTransactions(tx, orgId, item.id));
    expect(txs.length).toBe(0);
  });

  it("JASA tolak initialQty > 0", async () => {
    const { orgId } = await makeOrg("salon2");
    await expect(
      withOrg(orgId, (tx) =>
        createInventoryItem(tx, orgId, { itemType: "JASA", name: "Creambath", initialQty: 5 }),
      ),
    ).rejects.toThrow("JASA_TANPA_STOK");
  });
});
