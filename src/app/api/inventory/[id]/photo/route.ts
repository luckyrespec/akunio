import { NextResponse } from "next/server";
import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { getInventoryItem } from "@/server/db/repos/inventory.repo";
import { getDocument, MAX_INVENTORY_IMAGE_BYTES } from "@/server/storage/storage";
import { removeItemImage, saveItemImage } from "@/server/storage/inventory-image";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext();
  const item = await withOrg(ctx.orgId, (tx) => getInventoryItem(tx, ctx.orgId, id));
  if (!item?.imageStorageKey) {
    return NextResponse.json({ error: "Foto tidak ada." }, { status: 404 });
  }
  try {
    const buf = await getDocument(item.imageStorageKey);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": item.imageMime ?? "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    // S3/SeaweedFS tidak hidup atau objek hilang — anggap foto tak ada (404),
    // jangan 500 beruntun di log. Jalankan `bun run weed:dev` untuk foto.
    console.warn(
      `[inventory-photo] gagal ambil ${item.imageStorageKey}:`,
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "Foto tidak tersedia." }, { status: 404 });
  }
}

/** Ganti/simpan foto item. Dipakai XHR klien agar bisa menampilkan progress. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "File foto wajib diisi." }, { status: 400 });
  }
  if (file.size > MAX_INVENTORY_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "Ukuran foto maksimal 500 KB (kompresi gagal?)." },
      { status: 400 },
    );
  }
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await saveItemImage({ orgId: ctx.orgId, itemId: id, buffer, mime: file.type });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal menyimpan foto.";
    const status = message.startsWith("ITEM_TIDAK_DITEMUKAN") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

/** Hapus foto item. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
  try {
    await removeItemImage({ orgId: ctx.orgId, itemId: id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal menghapus foto.";
    const status = message.startsWith("ITEM_TIDAK_DITEMUKAN") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
