import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { withOrg } from "@/server/db/repos/with-org";
import { inventoryItems } from "@/server/db/schema/inventory";
import { deleteDocument, putInventoryImage, validateInventoryImage } from "./storage";

function revalidateItemPaths(itemId: string) {
  revalidatePath("/persediaan/daftar");
  revalidatePath(`/persediaan/daftar/${itemId}`);
  revalidatePath(`/persediaan/jasa/${itemId}`);
  revalidatePath("/faktur/baru");
  revalidatePath("/kasir");
}

/** Simpan/ganti foto item (barang atau jasa). Objek lama dihapus best-effort. */
export async function saveItemImage(input: {
  orgId: string;
  itemId: string;
  buffer: Buffer;
  mime: string;
}): Promise<{ storageKey: string; imageMime: string }> {
  const { orgId, itemId, buffer, mime } = input;
  validateInventoryImage(buffer, mime);
  const res = await withOrg(orgId, async (tx) => {
    const [current] = await tx
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.orgId, orgId), eq(inventoryItems.id, itemId)))
      .limit(1);
    if (!current) throw new Error("ITEM_TIDAK_DITEMUKAN");
    const { storageKey } = await putInventoryImage(orgId, itemId, { buffer, mime });
    const [updated] = await tx
      .update(inventoryItems)
      .set({ imageStorageKey: storageKey, imageMime: mime, updatedAt: new Date() })
      .where(eq(inventoryItems.id, itemId))
      .returning({ storageKey: inventoryItems.imageStorageKey, imageMime: inventoryItems.imageMime });
    return { updated, oldKey: current.imageStorageKey };
  });
  if (res.oldKey) {
    try {
      await deleteDocument(res.oldKey);
    } catch {
      /* objek lama gagal dihapus — abaikan */
    }
  }
  revalidateItemPaths(itemId);
  return { storageKey: res.updated.storageKey!, imageMime: res.updated.imageMime ?? mime };
}

/** Hapus foto item (barang atau jasa). */
export async function removeItemImage(input: {
  orgId: string;
  itemId: string;
}): Promise<{ removed: boolean }> {
  const { orgId, itemId } = input;
  const oldKey = await withOrg(orgId, async (tx) => {
    const [current] = await tx
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.orgId, orgId), eq(inventoryItems.id, itemId)))
      .limit(1);
    if (!current) throw new Error("ITEM_TIDAK_DITEMUKAN");
    await tx
      .update(inventoryItems)
      .set({ imageStorageKey: null, imageMime: null, updatedAt: new Date() })
      .where(eq(inventoryItems.id, itemId));
    return current.imageStorageKey;
  });
  if (oldKey) {
    try {
      await deleteDocument(oldKey);
    } catch {
      /* best-effort */
    }
  }
  revalidateItemPaths(itemId);
  return { removed: Boolean(oldKey) };
}
