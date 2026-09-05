/** Helper murni untuk pencarian global (Ctrl+K). Tanpa dependensi server. */

/** Parse nominal rupiah dari query ("10.000.000", "Rp 250000") → minor. Null bila bukan nominal murni. */
export function parseNominalMinor(term: string): bigint | null {
  const cleaned = term.toLowerCase().replace(/rp/g, "").replace(/[\s.,]/g, "");
  if (!/^\d+$/.test(cleaned) || cleaned.length < 4) return null;
  try {
    const v = BigInt(cleaned) * 100n;
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

export interface InvoiceMatchInput {
  invoiceNumber: string;
  contactName: string;
  notes?: string | null;
  totalMinor: bigint;
}

/** Cocokkan faktur berdasar nomor/kontak/keterangan, plus nominal bila query berupa angka. */
export function invoiceMatchesQuery(
  inv: InvoiceMatchInput,
  qLower: string,
  amountMinor: bigint | null,
): boolean {
  return (
    inv.invoiceNumber.toLowerCase().includes(qLower) ||
    inv.contactName.toLowerCase().includes(qLower) ||
    (inv.notes ?? "").toLowerCase().includes(qLower) ||
    (amountMinor !== null && inv.totalMinor === amountMinor)
  );
}
