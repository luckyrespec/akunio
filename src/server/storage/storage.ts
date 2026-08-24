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
