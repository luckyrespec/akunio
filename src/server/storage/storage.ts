import { randomUUID } from "node:crypto";
import {
  S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { extForMime, getStorageConfig } from "./config";

export { MAX_DOCUMENT_BYTES, ALLOWED_MIMES } from "./config";

function client() {
  const c = getStorageConfig();
  return new S3Client({
    endpoint: c.endpoint, region: c.region, forcePathStyle: true,
    credentials: { accessKeyId: c.accessKey, secretAccessKey: c.secretKey },
    // SeaweedFS rejects the SDK's default flexible checksums.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

export async function putDocument(
  orgId: string, file: { buffer: Buffer; mime: string },
): Promise<{ storageKey: string }> {
  const key = `orgs/${orgId}/${randomUUID()}${extForMime(file.mime)}`;
  const c = getStorageConfig();
  await client().send(new PutObjectCommand({
    Bucket: c.bucket, Key: key, Body: file.buffer, ContentType: file.mime,
  }));
  return { storageKey: key };
}

export async function getDocument(storageKey: string): Promise<Buffer> {
  const c = getStorageConfig();
  const res = await client().send(new GetObjectCommand({ Bucket: c.bucket, Key: storageKey }));
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error("DOKUMEN_KOSONG");
  return Buffer.from(bytes);
}

export async function deleteDocument(storageKey: string): Promise<void> {
  const c = getStorageConfig();
  await client().send(new DeleteObjectCommand({ Bucket: c.bucket, Key: storageKey }));
}

export const MAX_INVENTORY_IMAGE_BYTES = 500 * 1024;

const INVENTORY_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;

export function validateInventoryImage(buffer: Buffer, mime: string): void {
  if (!(INVENTORY_IMAGE_MIMES as readonly string[]).includes(mime)) {
    throw new Error("MIME_TIDAK_DIDUKUNG: foto barang harus JPG, PNG, atau WebP");
  }
  if (buffer.length > MAX_INVENTORY_IMAGE_BYTES) {
    throw new Error("FOTO_KEBESARAN: ukuran foto maksimal 500 KB");
  }
}

export async function putInventoryImage(
  orgId: string,
  itemId: string,
  file: { buffer: Buffer; mime: string },
): Promise<{ storageKey: string }> {
  validateInventoryImage(file.buffer, file.mime);
  const key = `orgs/${orgId}/inventory/${itemId}/${randomUUID()}${extForMime(file.mime)}`;
  const c = getStorageConfig();
  await client().send(new PutObjectCommand({
    Bucket: c.bucket, Key: key, Body: file.buffer, ContentType: file.mime,
  }));
  return { storageKey: key };
}
