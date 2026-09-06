/** Kompres gambar di browser hingga <= maxBytes. Tanpa dep tambahan. */
export async function compressImageToLimit(
  file: File,
  maxBytes = 500 * 1024,
): Promise<{ blob: Blob; mime: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) throw new Error("Browser tidak mendukung kanvas");
  ctx2d.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (blob && blob.size <= maxBytes) return { blob, mime: "image/jpeg" };
  }
  throw new Error("Foto melebihi 500 KB walau sudah dikompres");
}
