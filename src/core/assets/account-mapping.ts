/** Pico-resolver pemetaan akun aset: kode template dulu, semantik kemudian.
 *  Murni (tanpa I/O) agar mudah diuji. Mengembalikan "" bila tak ada kandidat
 *  — pemanggil menampilkan CTA buat-akun, JANGAN menebak akun yang salah. */

export interface MappableAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  normal: string;
  contra?: boolean | null;
  isCash?: boolean | null;
  isBank?: boolean | null;
  archivedAt?: string | Date | null;
  parentCode?: string | null;
}

export interface AssetMapping {
  assetId: string;
  accumId: string;
  expenseId: string;
}

function isPostable(rows: MappableAccount[], a: MappableAccount): boolean {
  return !a.archivedAt && !rows.some((c) => c.parentCode === a.code);
}

function first(
  rows: MappableAccount[],
  codes: string[],
  pred: (a: MappableAccount) => boolean,
): string {
  const postable = rows.filter((a) => isPostable(rows, a));
  for (const code of codes) {
    const hit = postable.find((a) => a.code === code && pred(a));
    if (hit) return hit.id;
  }
  const any = [...postable]
    .sort((x, y) => x.code.localeCompare(y.code))
    .find(pred);
  return any?.id ?? "";
}

/**
 * Urutan: kode template eksak (postable + berperan benar) → akun semantik
 * pertama → "" (tidak ada). Tak pernah fallback ke daun sembarang.
 */
export function resolveAssetMapping(
  rows: MappableAccount[],
  wants: { asset: string[]; accum: string[]; expense: string[] },
): AssetMapping {
  const isAsset = (a: MappableAccount) => a.type === "ASET";
  return {
    assetId: first(
      rows,
      wants.asset,
      (a) => isAsset(a) && !a.contra && !a.isCash && !a.isBank && a.normal === "D",
    ),
    accumId: first(
      rows,
      wants.accum,
      (a) => isAsset(a) && !!a.contra,
    ),
    expenseId: first(
      rows,
      wants.expense,
      (a) => a.type === "BEBAN" && a.normal === "D" && !a.contra,
    ),
  };
}

/** Validasi peran untuk fail-closed server + peringatan UI. Bahasa Indonesia. */
export function validateAssetMapping(
  rows: MappableAccount[],
  mapping: { assetId: string; accumId: string; expenseId: string },
): string[] {
  const errors: string[] = [];
  const byId = new Map(rows.map((a) => [a.id, a]));
  const asset = byId.get(mapping.assetId);
  const accum = byId.get(mapping.accumId);
  const expense = byId.get(mapping.expenseId);
  if (!asset || !isPostable(rows, asset) || asset.type !== "ASET" || asset.contra || asset.isCash || asset.isBank) {
    errors.push("Akun Aset wajib akun ASET daun non-kontra (bukan kas/bank/akumulasi).");
  }
  if (!accum || !isPostable(rows, accum) || accum.type !== "ASET" || !accum.contra) {
    errors.push("Akun Akumulasi wajib akun kontra (akumulasi penyusutan/amortisasi).");
  }
  if (!expense || !isPostable(rows, expense) || expense.type !== "BEBAN") {
    errors.push("Akun Beban wajib akun bertipe Beban yang bisa diposting.");
  }
  return errors;
}
