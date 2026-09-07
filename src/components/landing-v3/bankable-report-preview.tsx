"use client";

import { useState } from "react";
import { ShieldCheck, Download, Printer, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BankableReportPreview() {
  const [activeTab, setActiveTab] = useState<"laba-rugi" | "neraca" | "arus-kas">("neraca");

  return (
    <section id="laporan-bank" className="py-20 bg-paper border-b border-rule">
      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="max-w-3xl">
          <h2 className="font-display mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-ink leading-tight text-balance">
            Laporan yang Disukai Analis Bank
          </h2>
          <p className="mt-2 text-sm text-ink-soft leading-relaxed max-w-2xl">
            Dokumen SAK EMKM tersusun otomatis dari setiap transaksi.
          </p>
        </div>

        {/* Tab Selection Bar */}
        <div className="mt-10 flex items-center justify-between border-b-2 border-rule pb-4 flex-wrap gap-4">
          <div className="inline-flex rounded-xl border border-rule bg-canvas p-1">
            <button
              type="button"
              onClick={() => setActiveTab("neraca")}
              className={`rounded-lg px-4 py-2.5 text-xs font-bold transition-all ${
                activeTab === "neraca"
                  ? "bg-paper text-ink shadow-xs border border-rule/80"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              Laporan Posisi Keuangan (Neraca)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("laba-rugi")}
              className={`rounded-lg px-4 py-2.5 text-xs font-bold transition-all ${
                activeTab === "laba-rugi"
                  ? "bg-paper text-ink shadow-xs border border-rule/80"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              Laporan Laba Rugi
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("arus-kas")}
              className={`rounded-lg px-4 py-2.5 text-xs font-bold transition-all ${
                activeTab === "arus-kas"
                  ? "bg-paper text-ink shadow-xs border border-rule/80"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              Laporan Arus Kas
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="text-xs text-ink font-semibold gap-1.5 border-rule bg-paper hover:bg-canvas">
              <Printer className="size-3.5" />
              <span>Format Siap Cetak A4</span>
            </Button>
            <Button variant="outline" size="sm" className="text-xs text-ink font-semibold gap-1.5 border-rule bg-paper hover:bg-canvas">
              <Download className="size-3.5" />
              <span>Ekspor PDF Resmi</span>
            </Button>
          </div>
        </div>

        {/* Report Document Layout */}
        <div className="mt-8 grid gap-8 lg:grid-cols-12 items-start">
          
          {/* Main Paper Document Frame */}
          <div className="lg:col-span-8 rounded-2xl border-2 border-rule bg-paper p-6 sm:p-10 shadow-sm relative overflow-hidden">
            
            {/* Ink stamp watermark */}
            <div
              aria-hidden
              className="absolute top-6 right-6 hidden sm:flex flex-col items-center justify-center border-2 border-dashed border-terra/60 text-terra px-3.5 py-1.5 rounded-lg select-none pointer-events-none z-10 -rotate-6 opacity-85"
            >
              <span className="font-mono text-[10px] font-black tracking-widest uppercase">TERVERIFIKASI</span>
              <span className="font-black text-xs uppercase tracking-tight">SAK EMKM IAI</span>
              <span className="font-mono text-[9px] text-terra/80">AKUNIO LEDGER</span>
            </div>

            {/* Document Header */}
            <div className="text-center pb-6 border-b-2 border-ink/80 relative">
              <p className="font-mono text-xs font-bold text-ink-soft uppercase tracking-widest">
                PT RASA NUSANTARA SEJAHTERA (ROASTERY &amp; CAFE)
              </p>
              <h3 className="font-display mt-1 text-2xl sm:text-3xl font-black text-ink tracking-tight">
                {activeTab === "neraca" && "Laporan Posisi Keuangan (Neraca)"}
                {activeTab === "laba-rugi" && "Laporan Laba Rugi Komprehensif"}
                {activeTab === "arus-kas" && "Laporan Arus Kas Operasional"}
              </h3>
              <p className="mt-1 text-xs text-ink-soft font-mono">
                Periode Berakhir per 31 Desember 2026 · Dinyatakan dalam Rupiah (IDR)
              </p>
            </div>

            {/* Document Body Tables */}
            <div key={activeTab}>
            {activeTab === "neraca" && (
              <div className="mt-6 space-y-7 text-sm">
                <div>
                  <div className="flex justify-between items-center border-b-2 border-ink pb-1.5">
                    <h4 className="font-black text-xs uppercase tracking-wider text-ink">
                      ASET (AKTIVA)
                    </h4>
                    <span className="font-mono text-[11px] font-bold text-ink-soft uppercase">KODE AKUN · NOMINAL</span>
                  </div>
                  <div className="mt-2 divide-y divide-rule/60">
                    <div className="flex justify-between py-2 items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-ink-soft bg-canvas px-1.5 py-0.5 rounded border border-rule">1111</span>
                        <span className="text-ink font-medium">Kas &amp; Setara Kas (Bank BCA &amp; Kas Toko)</span>
                      </div>
                      <span className="font-mono font-bold tnum text-ink">Rp 48.250.000</span>
                    </div>
                    <div className="flex justify-between py-2 items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-ink-soft bg-canvas px-1.5 py-0.5 rounded border border-rule">1121</span>
                        <span className="text-ink font-medium">Piutang Usaha (Konsinyasi Kafe Mitra)</span>
                      </div>
                      <span className="font-mono font-bold tnum text-ink">Rp 16.400.000</span>
                    </div>
                    <div className="flex justify-between py-2 items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-ink-soft bg-canvas px-1.5 py-0.5 rounded border border-rule">1131</span>
                        <span className="text-ink font-medium">Persediaan Biji Kopi Arabika &amp; Kemasan</span>
                      </div>
                      <span className="font-mono font-bold tnum text-ink">Rp 24.800.000</span>
                    </div>
                    <div className="flex justify-between py-2 items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-ink-soft bg-canvas px-1.5 py-0.5 rounded border border-rule">1210</span>
                        <span className="text-ink font-medium">Aset Tetap (Mesin Roasting 5kg &amp; Espresso)</span>
                      </div>
                      <span className="font-mono font-bold tnum text-ink">Rp 75.000.000</span>
                    </div>
                    <div className="flex justify-between py-2.5 font-bold bg-canvas/60 px-3 rounded-lg border-b-2 border-ink mt-1">
                      <span className="font-black text-ink">TOTAL ASET</span>
                      <span className="font-mono tnum text-debit text-base font-black">Rp 164.450.000</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center border-b-2 border-ink pb-1.5">
                    <h4 className="font-black text-xs uppercase tracking-wider text-ink">
                      LIABILITAS &amp; EKUITAS (PASIVA)
                    </h4>
                    <span className="font-mono text-[11px] font-bold text-ink-soft uppercase">KODE AKUN · NOMINAL</span>
                  </div>
                  <div className="mt-2 divide-y divide-rule/60">
                    <div className="flex justify-between py-2 items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-ink-soft bg-canvas px-1.5 py-0.5 rounded border border-rule">2111</span>
                        <span className="text-ink font-medium">Utang Usaha (Suplier Green Beans)</span>
                      </div>
                      <span className="font-mono font-bold tnum text-ink">Rp 12.000.000</span>
                    </div>
                    <div className="flex justify-between py-2 items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-ink-soft bg-canvas px-1.5 py-0.5 rounded border border-rule">3111</span>
                        <span className="text-ink font-medium">Modal Disetor Pemilik</span>
                      </div>
                      <span className="font-mono font-bold tnum text-ink">Rp 100.000.000</span>
                    </div>
                    <div className="flex justify-between py-2 items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-ink-soft bg-canvas px-1.5 py-0.5 rounded border border-rule">3211</span>
                        <span className="text-ink font-medium">Saldo Laba Ditahan</span>
                      </div>
                      <span className="font-mono font-bold tnum text-ink">Rp 52.450.000</span>
                    </div>
                    <div className="flex justify-between py-2.5 font-bold bg-canvas/60 px-3 rounded-lg border-b-4 border-double border-ink mt-1">
                      <span className="font-black text-ink">TOTAL LIABILITAS &amp; EKUITAS</span>
                      <span className="font-mono tnum text-debit text-base font-black">Rp 164.450.000</span>
                    </div>
                  </div>
                </div>

                {/* Audit Integrity Lock Banner */}
                <div className="rounded-xl bg-debit/10 border-2 border-debit/30 p-3.5 text-xs flex flex-col sm:flex-row items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-debit shrink-0" />
                    <span className="font-bold text-debit">KESEIMBANGAN MUTLAK NERACA:</span>
                  </div>
                  <span className="font-mono font-bold text-debit">ASET = LIABILITAS + EKUITAS (SELISIH RP 0)</span>
                </div>
              </div>
            )}

            {activeTab === "laba-rugi" && (
              <div className="mt-6 space-y-5 text-sm">
                <div>
                  <div className="flex justify-between items-center border-b-2 border-ink pb-1.5">
                    <h4 className="font-black text-xs uppercase tracking-wider text-ink">
                      PENDAPATAN USAHA
                    </h4>
                    <span className="font-mono text-[11px] font-bold text-ink-soft uppercase">KODE AKUN · NOMINAL</span>
                  </div>
                  <div className="mt-2 divide-y divide-rule/60">
                    <div className="flex justify-between py-2 items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-ink-soft bg-canvas px-1.5 py-0.5 rounded border border-rule">4101</span>
                        <span className="text-ink font-medium">Penjualan Minuman Kopi &amp; Makanan</span>
                      </div>
                      <span className="font-mono font-bold tnum text-ink">Rp 84.500.000</span>
                    </div>
                    <div className="flex justify-between py-2 items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-ink-soft bg-canvas px-1.5 py-0.5 rounded border border-rule">4102</span>
                        <span className="text-ink font-medium">Penjualan Biji Kopi Sangrai (Wholesale)</span>
                      </div>
                      <span className="font-mono font-bold tnum text-ink">Rp 42.000.000</span>
                    </div>
                    <div className="flex justify-between py-2 font-bold bg-canvas/60 px-3 rounded-lg border-b-2 border-ink mt-1">
                      <span className="font-black text-ink">TOTAL PENDAPATAN BERSIH</span>
                      <span className="font-mono tnum text-ink font-black">Rp 126.500.000</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center border-b-2 border-ink pb-1.5">
                    <h4 className="font-black text-xs uppercase tracking-wider text-ink">
                      BEBAN POKOK PENJUALAN (HPP)
                    </h4>
                    <span className="font-mono text-[11px] font-bold text-ink-soft uppercase">KODE AKUN · NOMINAL</span>
                  </div>
                  <div className="mt-2 divide-y divide-rule/60">
                    <div className="flex justify-between py-2 items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-ink-soft bg-canvas px-1.5 py-0.5 rounded border border-rule">5101</span>
                        <span className="text-ink font-medium">Bahan Baku Biji Kopi, Susu, Sirup Segar</span>
                      </div>
                      <span className="font-mono font-bold tnum text-ink">Rp 48.200.000</span>
                    </div>
                    <div className="flex justify-between py-2 font-bold bg-canvas/60 px-3 rounded-lg border-b-2 border-ink mt-1">
                      <span className="font-black text-ink">LABA KOTOR (GROSS PROFIT)</span>
                      <span className="font-mono tnum text-ink font-black">Rp 78.300.000</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center border-b-2 border-ink pb-1.5">
                    <h4 className="font-black text-xs uppercase tracking-wider text-ink">
                      BEBAN OPERASIONAL TOKO
                    </h4>
                    <span className="font-mono text-[11px] font-bold text-ink-soft uppercase">KODE AKUN · NOMINAL</span>
                  </div>
                  <div className="mt-2 divide-y divide-rule/60">
                    <div className="flex justify-between py-2 items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-ink-soft bg-canvas px-1.5 py-0.5 rounded border border-rule">6101</span>
                        <span className="text-ink font-medium">Gaji Karyawan &amp; Barista (3 Orang)</span>
                      </div>
                      <span className="font-mono font-bold tnum text-ink">Rp 12.500.000</span>
                    </div>
                    <div className="flex justify-between py-2 items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-ink-soft bg-canvas px-1.5 py-0.5 rounded border border-rule">6102</span>
                        <span className="text-ink font-medium">Sewa Ruko &amp; Biaya Listrik/Air</span>
                      </div>
                      <span className="font-mono font-bold tnum text-ink">Rp 8.000.000</span>
                    </div>
                    <div className="flex justify-between py-3 font-bold bg-debit/15 text-debit px-3 rounded-lg border-b-4 border-double border-debit mt-2 text-base">
                      <span className="font-black">LABA BERSIH TAHUN BERJALAN</span>
                      <span className="font-mono tnum font-black text-lg">Rp 57.800.000</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "arus-kas" && (
              <div className="mt-6 space-y-5 text-sm">
                <div>
                  <div className="flex justify-between items-center border-b-2 border-ink pb-1.5">
                    <h4 className="font-black text-xs uppercase tracking-wider text-ink">
                      ARUS KAS OPERASIONAL
                    </h4>
                    <span className="font-mono text-[11px] font-bold text-ink-soft uppercase">KODE AKUN · NOMINAL</span>
                  </div>
                  <div className="mt-2 divide-y divide-rule/60">
                    <div className="flex justify-between py-2 items-center">
                      <span className="text-ink font-medium">Penerimaan Kas dari Pelanggan Harian</span>
                      <span className="font-mono font-bold tnum text-debit">+Rp 124.200.000</span>
                    </div>
                    <div className="flex justify-between py-2 items-center">
                      <span className="text-ink font-medium">Pembayaran Kas ke Pemasok &amp; Operasional</span>
                      <span className="font-mono font-bold tnum text-credit">-Rp 68.700.000</span>
                    </div>
                    <div className="flex justify-between py-2 font-bold bg-canvas/60 px-3 rounded-lg border-b-2 border-ink mt-1">
                      <span className="font-black text-ink">ARUS KAS BERSIH DARI OPERASI</span>
                      <span className="font-mono tnum text-debit font-black">+Rp 55.500.000</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between py-3 font-bold bg-canvas/80 px-3 rounded-lg border-b-4 border-double border-ink text-base">
                  <span className="font-black text-ink">SALDO KAS AKHIR TAHUN</span>
                  <span className="font-mono tnum text-ink font-black text-lg">Rp 48.250.000</span>
                </div>
              </div>
            )}
              </div>
            {/* Document Signature & Official SAK EMKM Audit Trail */}
            <div className="mt-8 pt-6 border-t border-rule flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6 text-xs text-ink-soft">
              <div className="space-y-1 font-mono text-[11px]">
                <p className="font-bold text-ink">KREDENSIAL DOKUMEN RESMI:</p>
                <p>Nomor Dokumen: FIN-EMKM-2026-0892</p>
                <p>Standar Akuntansi: SAK EMKM IAI (Baku &amp; Resmi)</p>
                <p className="text-[10px] text-debit font-bold">Kesiapan: Lengkap untuk Bank, Mitra Investor &amp; Pelaporan Pajak</p>
              </div>

              <div className="text-right border-t border-dashed border-rule pt-3 sm:border-t-0 sm:pt-0">
                <p className="text-[11px] font-semibold text-ink-soft">Penanggung Jawab Keuangan</p>
                <div className="h-10 flex items-center justify-end">
                  <span className="font-serif italic text-sm text-ink/70 font-semibold">[Tanda Tangan Pemilik Usaha]</span>
                </div>
                <p className="font-bold text-ink text-xs">Direktur Utama / Pemilik Usaha</p>
              </div>
            </div>

          </div>

          {/* Side Verification Card: Kesiapan Usaha Naik Kelas */}
          <div className="lg:col-span-4 rounded-2xl border-2 border-rule bg-canvas/60 p-6 sm:p-7 space-y-6 shadow-xs">
            <div className="flex items-center gap-2 text-debit font-black text-xs uppercase tracking-wider">
              <ShieldCheck className="size-4.5" />
              <span>Bukti Kesiapan Usaha Naik Kelas</span>
            </div>

            <h4 className="font-display text-2xl font-bold text-ink leading-tight">
              Mengapa Laporan Baku Membuka Pintu Modal &amp; Pertumbuhan?
            </h4>

            <p className="text-xs text-ink-soft leading-relaxed">
              Saat mengajukan Kredit Usaha Rakyat (KUR), mengundang rekan bagi hasil, atau menghitung pajak tahunan, pembukuan standar memberikan kepastian bahwa bisnis Anda sehat dan terpercaya.
            </p>

            <ul className="space-y-3.5 text-xs text-ink">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="size-4.5 text-debit shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-ink">Debit = Kredit Terkunci Mutlak:</strong>
                  <span className="text-ink-soft">Menghilangkan keraguan angka rekayasa atau manipulasi manual di Excel.</span>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="size-4.5 text-debit shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-ink">Jejak Catatan Permanen &amp; Anti-Rekayasa:</strong>
                  <span className="text-ink-soft">Setiap transaksi tercatat permanen di buku besar dan tidak dapat diubah atau dihapus sepihak tanpa jejak audit.</span>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="size-4.5 text-debit shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-ink">Rasio Keuangan Jelas &amp; Transparan:</strong>
                  <span className="text-ink-soft">Analis kredit cepat menyetujui pinjaman modal, investor yakin menanamkan modal, dan rekap pajak tuntas tanpa denda.</span>
                </div>
              </li>
            </ul>

            <div className="pt-4 border-t border-rule">
              <div className="rounded-xl border-2 border-terra/30 bg-paper p-4 text-center">
                <p className="font-bold text-xs text-terra uppercase tracking-wider">Siap Mencoba Pembukuan Standar?</p>
                <p className="text-xs text-ink-soft mt-1">Daftar sekarang gratis tanpa perlu kartu kredit.</p>
                <Button asChild size="sm" className="mt-3.5 w-full bg-terra hover:brightness-110 text-white font-extrabold h-10 shadow-sm">
                  <a href="/daftar">Mulai Buat Laporan Bankable</a>
                </Button>
              </div>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
