type IssueLike = Record<string, unknown>;

export function issueToMessage(i: IssueLike): string {
  const row = typeof i.index === "number" ? i.index + 1 : null;
  switch (i.code) {
    case "BAD_DATE": return "Tanggal tidak valid.";
    case "MIN_LINES": return "Jurnal minimal memiliki dua baris.";
    case "NEGATIVE_AMOUNT": return `Baris ${row}: nominal tidak boleh negatif.`;
    case "LINE_EMPTY": return `Baris ${row}: salah satu dari debit atau kredit wajib diisi.`;
    case "LINE_BOTH_SIDES": return `Baris ${row}: isi salah satu dari debit atau kredit saja.`;
    case "UNBALANCED": return "Total debit dan kredit tidak seimbang.";
    case "PERIOD_NOT_OPEN":
      return i.periodStatus === "LOCKED"
        ? "Periode sudah terkunci — tidak dapat mencatat transaksi baru."
        : "Periode tutup buku — buka kembali periode untuk mencatat transaksi.";
    case "PERIODE_TIDAK_DITEMUKAN":
      return "Tidak ada periode akuntansi yang cocok dengan tanggal tersebut.";
    case "UNKNOWN_ACCOUNT": return `Baris ${row}: akun tidak dikenal.`;
    case "ARCHIVED_ACCOUNT": return `Baris ${row}: akun sudah diarsipkan.`;
    case "GROUP_ACCOUNT": return `Baris ${row}: akun induk (kelompok) tidak dapat dipakai untuk transaksi.`;
    default: return "Data jurnal tidak valid.";
  }
}
