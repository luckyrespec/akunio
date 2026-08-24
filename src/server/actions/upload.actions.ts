"use server";
import { db } from "@/server/db";
import { requireContext } from "@/server/auth/guard";
import {
  putDocument, MAX_DOCUMENT_BYTES, ALLOWED_MIMES,
} from "@/server/storage/storage";
import { createDocumentRow } from "@/server/db/repos/documents.repo";
import { isRedirectError } from "./redirect-guard";

export interface UploadResult {
  ok: boolean;
  error?: string;
  documentId?: string;
}

export async function uploadDocumentAction(formData: FormData): Promise<UploadResult> {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const file = formData.get("file");
    if (!(file instanceof File)) return { ok: false, error: "File tidak ditemukan." };
    if (!ALLOWED_MIMES.includes(file.type as never)) {
      return { ok: false, error: "Tipe file harus gambar atau PDF." };
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      return { ok: false, error: "Ukuran file maksimal 5 MB." };
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const { storageKey } = await putDocument(ctx.orgId, { buffer, mime: file.type });
    const row = await db.transaction((tx) => createDocumentRow(tx, {
      orgId: ctx.orgId, storageKey, mime: file.type, sizeBytes: file.size,
    }));
    return { ok: true, documentId: row.id };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    console.error(e);
    return { ok: false, error: "Gagal mengunggah dokumen." };
  }
}
