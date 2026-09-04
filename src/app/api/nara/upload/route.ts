import { NextRequest, NextResponse } from "next/server";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import {
  ALLOWED_MIMES,
  MAX_DOCUMENT_BYTES,
  putDocument,
} from "@/server/storage/storage";
import { createDocumentRow } from "@/server/db/repos/documents.repo";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireContext();
    const ct = req.headers.get("content-type") ?? "";
    if (!ct.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Content-Type harus multipart/form-data." },
        { status: 400 },
      );
    }

    const fd = await req.formData();
    const rawFiles = fd.getAll("files").concat(fd.getAll("file"));
    const files = rawFiles.filter((f): f is File => f instanceof File && f.size > 0);

    if (files.length === 0) {
      return NextResponse.json({ error: "Tidak ada file yang diunggah." }, { status: 400 });
    }

    for (const file of files) {
      if (!ALLOWED_MIMES.includes(file.type as never)) {
        return NextResponse.json(
          { error: `Tipe file ${file.name} tidak didukung. Tipe file harus gambar (PNG, JPG, WebP), PDF, atau Spreadsheet (CSV / Excel).` },
          { status: 400 },
        );
      }
      if (file.size > MAX_DOCUMENT_BYTES) {
        return NextResponse.json(
          { error: `Ukuran file ${file.name} melebihi batas maksimal 5 MB.` },
          { status: 400 },
        );
      }
    }

    const uploaded = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { storageKey } = await putDocument(ctx.orgId, { buffer, mime: file.type });
      const row = await db.transaction((tx) =>
        createDocumentRow(tx, {
          orgId: ctx.orgId,
          storageKey,
          mime: file.type,
          sizeBytes: file.size,
        }),
      );
      uploaded.push({
        id: row.id,
        storageKey: row.storageKey,
        mime: file.type,
        fileName: file.name,
        sizeBytes: file.size,
        url: `/api/documents/${row.id}`,
      });
    }

    return NextResponse.json({ files: uploaded });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal mengunggah file.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
