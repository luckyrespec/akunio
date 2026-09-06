import { eq, sql } from "drizzle-orm";
import type { Queryable } from "./queryable";
import { inventorySkuCounters } from "../schema/inventory";

/** Satu-satunya tempat format SKU/barcode app. Counter per-org + advisory lock
 *  agar insert konkuren tidak mendapat nomor sama (pola journal_seq_counters).
 *  kind BARANG -> BRG-NNNN, JASA -> JSA-NNNN (satu counter berurutan). */
export async function nextSkuCodes(
  q: Queryable,
  orgId: string,
  kind: "BARANG" | "JASA" = "BARANG",
): Promise<{ code: string; appBarcode: string }> {
  await q.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`sku:${orgId}`}))`);
  const [row] = await q
    .select()
    .from(inventorySkuCounters)
    .where(eq(inventorySkuCounters.orgId, orgId))
    .limit(1);
  const seq = (row?.lastSeq ?? 0) + 1;
  if (row) {
    await q
      .update(inventorySkuCounters)
      .set({ lastSeq: seq })
      .where(eq(inventorySkuCounters.orgId, orgId));
  } else {
    await q.insert(inventorySkuCounters).values({ orgId, lastSeq: seq });
  }
  return {
    code: `${kind === "JASA" ? "JSA-" : "BRG-"}${String(seq).padStart(4, "0")}`,
    appBarcode: String(20_000_000 + seq),
  };
}
