export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export const ALLOWED_MIMES = [
  "image/jpeg", "image/png", "image/webp", "application/pdf",
] as const;

const EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

export function extForMime(mime: string): string {
  const ext = EXT[mime];
  if (!ext) throw new Error("MIME_TIDAK_DIDUKUNG");
  return ext;
}

export function getStorageConfig() {
  return {
    endpoint: process.env.S3_ENDPOINT ?? "http://127.0.0.1:8333",
    bucket: process.env.S3_BUCKET ?? "neraca-docs",
    accessKey: process.env.S3_ACCESS_KEY ?? "demo",
    secretKey: process.env.S3_SECRET_KEY ?? "demo",
    region: "us-east-1",
  };
}
