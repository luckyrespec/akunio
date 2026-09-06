export interface DailyInsight {
  title: string;
  body: string;
  /** Rujukan Bab SAK EMKM yang relevan (tanpa klaim paragraf). */
  source: string;
  bab: number;
}

// Praktik kas/bank sehari-hari yang sejalan SAK EMKM — statis dan
// deterministik (tanpa AI/DB) agar selalu tersedia, bahkan luring data.
const INSIGHTS: DailyInsight[] = [
  {
    title: "Pisahkan uang usaha dan pribadi",
    body: "Campuran kas usaha dan pribadi membuat laba terlihat lebih besar dari aslinya. Satu rekening khusus usaha memudahkan pelacakan setiap rupiah.",
    source: "SAK EMKM · Bab 8 Aset dan Liabilitas Keuangan",
    bab: 8,
  },
  {
    title: "Catat kas keluar di hari yang sama",
    body: "Nota yang menumpuk seminggu sulit diverifikasi ulang. Catat pembayaran hari ini juga — lengkap dengan kuitansinya sebagai lampiran.",
    source: "SAK EMKM · Bab 7 Kebijakan Akuntansi",
    bab: 7,
  },
  {
    title: "Cocokkan saldo bank tiap akhir bulan",
    body: "Bandingkan mutasi pembukuan dengan rekening koran sebelum tutup bulan. Selisih kecil yang dibiarkan menumpuk menjadi sulit ditelusur.",
    source: "SAK EMKM · Bab 8 Aset dan Liabilitas Keuangan",
    bab: 8,
  },
  {
    title: "Simpan bukti untuk setiap transaksi",
    body: "Setiap angka di laporan harus bisa ditelusur ke buktinya. Foto nota dan simpan sebagai lampiran langsung saat mencatat.",
    source: "SAK EMKM · Bab 2 Konsep dan Prinsip Pervasif",
    bab: 2,
  },
  {
    title: "Kelompokkan beban sesuai jenisnya",
    body: "Gaji, sewa, dan utilitas yang tercatat terpisah membuat pemilik tahu pos mana yang paling menggerus kas setiap bulan.",
    source: "SAK EMKM · Bab 14 Pendapatan dan Beban",
    bab: 14,
  },
  {
    title: "Akui pendapatan saat diterima",
    body: "Untuk EMKM, pendapatan dicatat saat kas masuk — bukan saat janji dibayar. Prinsip ini menjaga laporan tetap jujur dan sederhana.",
    source: "SAK EMKM · Bab 14 Pendapatan dan Beban",
    bab: 14,
  },
  {
    title: "Setorkan tunai ke bank secara rutin",
    body: "Kas tunai yang mengendap di laci berisiko hilang dan sulit diawasi. Jadwalkan setoran, mis. setiap kas terkumpul Rp1.000.000.",
    source: "SAK EMKM · Bab 8 Aset dan Liabilitas Keuangan",
    bab: 8,
  },
  {
    title: "Bedakan utang usaha dan setoran modal",
    body: "Uang pemilik yang masuk bisa berupa tambahan modal atau pinjaman. Klasifikasi yang benar menentukan apakah uang itu harus dikembalikan.",
    source: "SAK EMKM · Bab 13 Liabilitas dan Ekuitas",
    bab: 13,
  },
  {
    title: "Periksa piutang sebelum menambah utang",
    body: "Kas seret sering bukan karena rugi, melainkan piutang menumpuk. Tagih piutang jatuh tempo sebelum memutuskan berutang.",
    source: "SAK EMKM · Bab 8 Aset dan Liabilitas Keuangan",
    bab: 8,
  },
  {
    title: "Tutup bulan dengan kas yang cocok",
    body: "Periode yang ditutup dengan saldo kas yang sudah direkonsiliasi memberi titik awal yang bersih untuk bulan berikutnya.",
    source: "SAK EMKM · Bab 7 Kebijakan Akuntansi",
    bab: 7,
  },
];

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000);
}

/** Insight deterministik per tanggal — tanggal sama selalu hasil sama. */
export function dailyInsight(date: Date = new Date()): DailyInsight {
  return INSIGHTS[dayOfYear(date) % INSIGHTS.length];
}
