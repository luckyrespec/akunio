"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowRight,
  CheckCircle2,
  Lock,
  FileSpreadsheet,
  ScanLine,
  Sparkles,
  ShieldCheck,
  Scale,
  ChevronDown,
  Receipt,
  Bot,
  RefreshCw,
} from "lucide-react";

interface DemoEntry {
  id: string;
  source: "Foto Nota" | "Faktur PDF" | "Prompt Chat AI";
  title: string;
  vendor: string;
  date: string;
  lines: { code: string; account: string; debit: number; credit: number }[];
  status: "DRAFT" | "POSTED";
  voucherNo?: string;
  auditHash?: string;
}

const INITIAL_DEMO_ENTRIES: DemoEntry[] = [
  {
    id: "1",
    source: "Foto Nota",
    title: "Beli Kertas NCR & Toner Printer",
    vendor: "PT Sumber Kertas Abadi",
    date: "06 Sep 2026",
    lines: [
      { code: "5-1020", account: "Beban Perlengkapan Kantor", debit: 850000, credit: 0 },
      { code: "1-1180", account: "PPN Masukan (11%)", debit: 93500, credit: 0 },
      { code: "1-1001", account: "Kas Operasional", debit: 0, credit: 943500 },
    ],
    status: "POSTED",
    voucherNo: "JE-2026-0841",
    auditHash: "8f4b...3c12",
  },
  {
    id: "2",
    source: "Faktur PDF",
    title: "Penjualan Grosir Kemasan Eco",
    vendor: "Kopi Kenangan Senja",
    date: "06 Sep 2026",
    lines: [
      { code: "1-1120", account: "Piutang Usaha", debit: 5550000, credit: 0 },
      { code: "4-1000", account: "Pendapatan Penjualan", debit: 0, credit: 5000000 },
      { code: "2-1150", account: "PPN Keluaran", debit: 0, credit: 550000 },
    ],
    status: "POSTED",
    voucherNo: "JE-2026-0842",
    auditHash: "e10a...99bb",
  },
  {
    id: "3",
    source: "Prompt Chat AI",
    title: "Sewa Gudang Transit Triwulan IV",
    vendor: "Pergudangan Marunda",
    date: "06 Sep 2026",
    lines: [
      { code: "1-1250", account: "Sewa Dibayar di Muka", debit: 12000000, credit: 0 },
      { code: "1-1002", account: "Bank BCA Operasional", debit: 0, credit: 12000000 },
    ],
    status: "DRAFT",
  },
];

const FAQS = [
  {
    q: "Bagaimana cara kerja AI Akunio membaca nota fisik dan PDF faktur?",
    a: "Anda cukup mengunggah foto nota dari kamera ponsel atau file PDF faktur vendor. AI mengekstrak data kunci: nama rekanan, tanggal transaksi, komponen subtotal, diskon, PPN, dan mencocokkan akun pengeluaran sesuai bagan akun standar SAK EMKM organisasi Anda. AI menyusun draf seimbang untuk disetujui.",
  },
  {
    q: "Mengapa jurnal yang sudah di-posting tidak bisa diedit atau dihapus?",
    a: "Sesuai standar audit dan kepatuhan SAK EMKM / IFRS for SMEs, pembukuan yang sah tidak boleh menghapus jejak transaksi. Di Akunio, posting memicu trigger kunci database imutabel. Apabila ada revisi, sistem menerbitkan jurnal pembalik resmi (reversal) bertaut ID asli sehingga rekam jejak keuangan Anda bersih dan kredibel di mata auditor maupun bankir.",
  },
  {
    q: "Apakah format bagan akun (COA) sudah sesuai dengan regulasi Indonesia?",
    a: "Tepat. Akunio mengadopsi standar bagan akun SAK EMKM (Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah) dan IFRS for SMEs secara bawaan. Laporan Neraca, Laba Rugi, Perubahan Ekuitas, dan Arus Kas otomatis tersaji secara real-time tanpa perlu rumus spreadsheet manual.",
  },
  {
    q: "Apakah data transaksi perusahaan kami aman dan terisolasi?",
    a: "Setiap organisasi memiliki batasan isolasi data tenant ketat menggunakan Row-Level Security (RLS) PostgreSQL pada tingkat database. Data pembukuan satu tenant tidak akan pernah bercampur atau dapat diakses oleh tenant lain.",
  },
];

function formatIdr(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function LandingPageV5() {
  const [entries, setEntries] = useState<DemoEntry[]>(INITIAL_DEMO_ENTRIES);
  const [activeTab, setActiveTab] = useState<string>("3");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const currentEntry = entries.find((e) => e.id === activeTab) || entries[0];
  const totalDebit = currentEntry.lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = currentEntry.lines.reduce((sum, l) => sum + l.credit, 0);
  const isBalanced = totalDebit === totalCredit && totalDebit > 0;

  const handlePostCurrent = () => {
    if (!isBalanced) return;
    setEntries((prev) =>
      prev.map((e) =>
        e.id === currentEntry.id
          ? {
              ...e,
              status: "POSTED",
              voucherNo: `JE-2026-${Math.floor(1000 + Math.random() * 9000)}`,
              auditHash: `${Math.random().toString(36).substring(2, 6)}...${Math.random().toString(36).substring(2, 6)}`,
            }
          : e
      )
    );
  };

  return (
    <div className="min-h-screen bg-[#f5f1e9] text-[#232a33] font-sans antialiased selection:bg-[#a8562f]/20 selection:text-[#a8562f]">
      {/* Top Ledger Strip */}
      <div className="bg-[#232a33] text-[#ede4d7] text-xs px-4 py-1.5 border-b border-[#3d3529] font-mono flex items-center justify-between overflow-x-auto">
        <div className="flex items-center gap-4 shrink-0">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-[#3e7c5a] animate-pulse" />
            LEDGER KREDIBEL: IMUTABILITAS AKTIF
          </span>
          <span className="text-[#a89a88] hidden sm:inline">|</span>
          <span className="text-[#a89a88] hidden sm:inline">STANDAR SAK EMKM / IFRS FOR SMES</span>
        </div>
        <div className="flex items-center gap-4 text-[11px] uppercase tracking-wider text-[#a89a88] shrink-0">
          <span>DEBIT = KREDIT DIJAMIN SEIMBANG</span>
          <span className="text-[#ede4d7] font-semibold">TUTUP BUKU TANPA SELISIH</span>
        </div>
      </div>

      {/* Navigation Header */}
      <header className="sticky top-0 z-40 bg-[#fbfaf6]/90 backdrop-blur-md border-b border-[#e7e1d4]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/v5" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-[#232a33] flex items-center justify-center text-[#fbfaf6] font-display font-bold text-lg shadow-xs group-hover:bg-[#a8562f] transition-colors duration-200">
                A
              </div>
              <span className="font-display text-xl font-bold tracking-tight text-[#232a33]">
                Akunio
              </span>
            </Link>
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#64696f]">
              <a href="#cara-kerja" className="hover:text-[#232a33] transition-colors">
                Cara Kerja AI
              </a>
              <a href="#simulator" className="hover:text-[#232a33] transition-colors">
                Simulator Jurnal
              </a>
              <a href="#standar" className="hover:text-[#232a33] transition-colors">
                Standar SAK EMKM
              </a>
              <a href="#keamanan" className="hover:text-[#232a33] transition-colors">
                Audit Trail Imutabel
              </a>
              <a href="#faq" className="hover:text-[#232a33] transition-colors">
                Tanya Jawab
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/masuk"
              className="text-sm font-medium px-3.5 py-1.5 rounded-lg text-[#232a33] hover:bg-[#e7e1d4]/50 transition-colors"
            >
              Masuk
            </Link>
            <Link
              href="/daftar"
              className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-[#232a33] text-[#fbfaf6] hover:bg-[#232a33]/90 active:scale-[0.99] transition-all shadow-xs focus:outline-none focus:ring-2 focus:ring-[#a8562f]"
            >
              Coba Gratis
              <ArrowRight className="w-4 h-4 text-[#a8562f]" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-12 pb-20 md:pt-20 md:pb-28 overflow-hidden">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-12 gap-12 items-center">
            {/* Left Column: Editorial Value Proposition */}
            <div className="lg:col-span-7 space-y-6">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.36 }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#fbfaf6] border border-[#e7e1d4] text-[11px] font-medium tracking-wider uppercase text-[#64696f] shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#a8562f]" />
                <span>AI Accounting SaaS untuk UKM Indonesia</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.05 }}
                className="font-display text-4xl sm:text-5xl lg:text-6xl font-normal leading-[1.12] tracking-tight text-[#232a33]"
              >
                Foto nota fisik langsung jadi{" "}
                <span className="italic font-serif text-[#a8562f] underline decoration-[#e7e1d4] underline-offset-8">
                  jurnal seimbang
                </span>
                . Buku besar terkunci anti-rekayasa.
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="text-base sm:text-lg text-[#64696f] max-w-2xl leading-relaxed"
              >
                Tinggalkan tumpukan kuitansi akhir bulan dan rumus spreadsheet yang rentan selisih.
                Akunio membaca nota, mengekstrak pajak & vendor, lalu meracik draf double-entry
                sesuai SAK EMKM. Manusia memvalidasi, sistem mengunci permanen.
              </motion.p>

              {/* Conversion CTAs */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 }}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2"
              >
                <Link
                  href="/daftar"
                  className="h-12 px-6 rounded-xl bg-[#232a33] text-[#fbfaf6] font-medium text-base flex items-center justify-center gap-3 hover:bg-[#232a33]/90 active:scale-[0.98] transition-all shadow-md focus:ring-2 focus:ring-[#a8562f]"
                >
                  Mulai Pembukuan Rapi
                  <ArrowRight className="w-5 h-5 text-[#a8562f]" />
                </Link>

                <a
                  href="#simulator"
                  className="h-12 px-5 rounded-xl bg-[#fbfaf6] border border-[#e7e1d4] text-[#232a33] font-medium text-sm flex items-center justify-center gap-2 hover:bg-[#f5f1e9] transition-colors shadow-xs"
                >
                  <Receipt className="w-4 h-4 text-[#a8562f]" />
                  Coba Simulator Jurnal AI
                </a>
              </motion.div>

              {/* Trust Metric Signals */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.25 }}
                className="pt-6 border-t border-[#e7e1d4] grid grid-cols-3 gap-4"
              >
                <div>
                  <div className="font-mono text-xl sm:text-2xl font-bold text-[#232a33]">100%</div>
                  <div className="text-xs text-[#64696f] mt-0.5">Strict Double-Entry (Debit = Kredit)</div>
                </div>
                <div>
                  <div className="font-mono text-xl sm:text-2xl font-bold text-[#3e7c5a]">IMUTABEL</div>
                  <div className="text-xs text-[#64696f] mt-0.5">Audit Trail Kunci Database</div>
                </div>
                <div>
                  <div className="font-mono text-xl sm:text-2xl font-bold text-[#a8562f]">SAK EMKM</div>
                  <div className="text-xs text-[#64696f] mt-0.5">Standar Akuntansi Resmi UKM</div>
                </div>
              </motion.div>
            </div>

            {/* Right Column: Physical Ledger Metaphor Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.45, delay: 0.1 }}
              className="lg:col-span-5"
            >
              <div className="bg-[#fbfaf6] rounded-2xl border border-[#e7e1d4] p-6 shadow-xs relative overflow-hidden">
                {/* Paper texture and subtle stamp header */}
                <div className="flex items-center justify-between border-b border-[#e7e1d4] pb-4 mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#3e7c5a]" />
                    <span className="font-mono text-xs font-semibold tracking-wider text-[#232a33]">
                      MEMORANDUM PEMBUKUAN
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-[#64696f]">STATUS: REALTIME</span>
                </div>

                {/* Simulated live journal entry card */}
                <div className="space-y-4">
                  <div className="bg-[#f5f1e9] p-3.5 rounded-xl border border-[#e7e1d4] flex items-center justify-between">
                    <div>
                      <div className="text-xs text-[#64696f] font-mono">DOKUMEN MASUK</div>
                      <div className="text-sm font-medium text-[#232a33] flex items-center gap-1.5 mt-0.5">
                        <ScanLine className="w-4 h-4 text-[#a8562f]" />
                        Kuitansi_Percetakan_0926.jpg
                      </div>
                    </div>
                    <div className="px-2.5 py-1 rounded bg-[#3e7c5a]/10 text-[#3e7c5a] text-[11px] font-mono font-medium">
                      AI TERVERIFIKASI
                    </div>
                  </div>

                  {/* Account Allocation breakdown */}
                  <div className="border border-[#e7e1d4] rounded-xl overflow-hidden text-xs">
                    <div className="bg-[#f5f1e9] px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-[#64696f] grid grid-cols-12 gap-2 border-b border-[#e7e1d4]">
                      <div className="col-span-6">Bagan Akun (SAK EMKM)</div>
                      <div className="col-span-3 text-right">Debit</div>
                      <div className="col-span-3 text-right">Kredit</div>
                    </div>
                    <div className="divide-y divide-[#e7e1d4]/60 font-mono">
                      <div className="px-3 py-2 grid grid-cols-12 gap-2 items-center bg-[#fbfaf6]">
                        <div className="col-span-6 truncate font-sans text-xs">
                          <span className="font-mono text-[#64696f] mr-1">5-1020</span> Beban Percetakan
                        </div>
                        <div className="col-span-3 text-right font-medium text-[#3e7c5a]">
                          Rp 1.500.000
                        </div>
                        <div className="col-span-3 text-right text-[#64696f]">-</div>
                      </div>
                      <div className="px-3 py-2 grid grid-cols-12 gap-2 items-center bg-[#fbfaf6]">
                        <div className="col-span-6 truncate font-sans text-xs">
                          <span className="font-mono text-[#64696f] mr-1">1-1180</span> PPN Masukan
                        </div>
                        <div className="col-span-3 text-right font-medium text-[#3e7c5a]">
                          Rp 165.000
                        </div>
                        <div className="col-span-3 text-right text-[#64696f]">-</div>
                      </div>
                      <div className="px-3 py-2 grid grid-cols-12 gap-2 items-center bg-[#fbfaf6]">
                        <div className="col-span-6 truncate font-sans text-xs">
                          <span className="font-mono text-[#64696f] mr-1">1-1002</span> Bank BCA
                        </div>
                        <div className="col-span-3 text-right text-[#64696f]">-</div>
                        <div className="col-span-3 text-right font-medium text-[#232a33]">
                          Rp 1.665.000
                        </div>
                      </div>
                    </div>
                    {/* Double underline balance indicator */}
                    <div className="bg-[#f5f1e9] px-3 py-2.5 font-mono text-xs flex justify-between items-center border-t-2 border-double border-[#232a33]">
                      <span className="font-semibold uppercase text-[11px] text-[#232a33]">
                        TOTAL SEIMBANG:
                      </span>
                      <div className="flex gap-4">
                        <span className="text-[#3e7c5a] font-bold">D: Rp 1.665.000</span>
                        <span className="text-[#232a33] font-bold">K: Rp 1.665.000</span>
                      </div>
                    </div>
                  </div>

                  {/* Audit Lock Banner */}
                  <div className="p-3 bg-[#fbfaf6] border border-[#e7e1d4] rounded-xl flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-[#a8562f]" />
                      <span className="text-[#64696f]">Kunci Imutabilitas:</span>
                    </div>
                    <span className="font-mono font-medium text-[#232a33]">JE-2026-0840 (FINAL)</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-[#e7e1d4] flex items-center justify-between text-[11px] text-[#64696f]">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#3e7c5a]" />
                    Prinsip 1: Seimbang dulu, posting kemudian
                  </span>
                  <span className="font-mono">POSTED #0840</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Product Principle Strip */}
      <section className="bg-[#fbfaf6] border-y border-[#e7e1d4] py-8">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-6">
            <h2 className="text-[11px] uppercase tracking-widest font-mono text-[#64696f]">
              5 PRINSIP DASAR PEMBUKUAN AKUNIO
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[
              { no: "01", title: "Seimbang Dulu", desc: "Total Debit harus selalu sama dengan Kredit sebelum diizinkan posting." },
              { no: "02", title: "Posted Berarti Final", desc: "Jurnal terkunci mutlak. Koreksi hanya melalui jurnal pembalik resmi." },
              { no: "03", title: "AI Mengusulkan", desc: "AI menyusun draf seimbang dari nota, keputusan akhir tetap di tangan manusia." },
              { no: "04", title: "Standar Tanpa Beban", desc: "Kepatuhan SAK EMKM dan IFRS for SMEs otomatis tanpa keahlian rumit." },
              { no: "05", title: "Tertelusur ke Bukti", desc: "Setiap baris angka dapat dilacak langsung ke file struk dan riwayat auditnya." },
            ].map((p, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-[#f5f1e9]/60 border border-[#e7e1d4] hover:bg-[#f5f1e9] transition-colors"
              >
                <div className="font-mono text-xs font-bold text-[#a8562f] mb-1">{p.no}</div>
                <div className="font-sans font-semibold text-sm text-[#232a33] mb-1">{p.title}</div>
                <div className="text-xs text-[#64696f] leading-relaxed">{p.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works: Capture to Balance to Lock */}
      <section id="cara-kerja" className="py-20 md:py-28">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center space-y-4 mb-16">
            <span className="text-xs font-mono font-medium tracking-wider uppercase text-[#a8562f] px-3 py-1 bg-[#a8562f]/10 rounded-full">
              ALUR KERJA PREVISI & TANPA DRAMA
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#232a33]">
              Dari Nota Kusut Menjadi Laporan Keuangan Sah
            </h2>
            <p className="text-[#64696f] text-base leading-relaxed">
              Tiga langkah terstruktur yang menjamin laporan buku besar Anda selalu rapi, siap audit,
              dan tidak pernah mengalami selisih misterius.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="bg-[#fbfaf6] p-8 rounded-2xl border border-[#e7e1d4] shadow-xs relative flex flex-col justify-between">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-[#f5f1e9] border border-[#e7e1d4] flex items-center justify-center text-[#232a33]">
                  <ScanLine className="w-6 h-6 text-[#a8562f]" />
                </div>
                <div className="font-mono text-xs text-[#a8562f] uppercase tracking-wider">
                  LANGKAH 01
                </div>
                <h3 className="font-display text-xl font-bold text-[#232a33]">
                  Tangkapan Multi-Modal AI
                </h3>
                <p className="text-sm text-[#64696f] leading-relaxed">
                  Unggah foto nota fisik, kuitansi kasir, faktur PDF dari vendor, atau ketik via
                  asisten chat kasir: <em>"Beli bensin motor operasional 50rb pakai kas kecil"</em>.
                  AI mengekstrak tanggal, nomor nota, pajak, dan entitas terkait.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#e7e1d4] text-xs font-mono text-[#64696f] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#3e7c5a]" />
                Maks. 5MB (Gambar, PDF, XLSX, CSV)
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-[#fbfaf6] p-8 rounded-2xl border border-[#e7e1d4] shadow-xs relative flex flex-col justify-between">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-[#f5f1e9] border border-[#e7e1d4] flex items-center justify-center text-[#3e7c5a]">
                  <Scale className="w-6 h-6 text-[#3e7c5a]" />
                </div>
                <div className="font-mono text-xs text-[#3e7c5a] uppercase tracking-wider">
                  LANGKAH 02
                </div>
                <h3 className="font-display text-xl font-bold text-[#232a33]">
                  Validasi Keseimbangan & Bagan Akun
                </h3>
                <p className="text-sm text-[#64696f] leading-relaxed">
                  AI memetakan posisi Debit dan Kredit secara otomatis ke dalam bagan akun SAK EMKM.
                  Draf jurnal hanya boleh disetujui jika formula akuntansi terpenuhi:{" "}
                  <strong className="text-[#232a33]">Debit mutlak sama dengan Kredit</strong>.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#e7e1d4] text-xs font-mono text-[#64696f] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#3e7c5a]" />
                Manusia mereview & memvalidasi
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-[#fbfaf6] p-8 rounded-2xl border border-[#e7e1d4] shadow-xs relative flex flex-col justify-between">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-[#f5f1e9] border border-[#e7e1d4] flex items-center justify-center text-[#232a33]">
                  <Lock className="w-6 h-6 text-[#232a33]" />
                </div>
                <div className="font-mono text-xs text-[#232a33] uppercase tracking-wider">
                  LANGKAH 03
                </div>
                <h3 className="font-display text-xl font-bold text-[#232a33]">
                  Posting Imutabel & Laporan Real-Time
                </h3>
                <p className="text-sm text-[#64696f] leading-relaxed">
                  Sekali klik tombol Posting, jurnal berstatus <code>POSTED</code> dan dikunci oleh
                  trigger database. Laba Rugi, Neraca, dan Arus Kas langsung terbarui detik itu juga
                  dengan penomoran berurutan tahunan.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#e7e1d4] text-xs font-mono text-[#64696f] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#3e7c5a]" />
                Koreksi resmi lewat Jurnal Pembalik
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Simulator Component: The Live Ledger Experience */}
      <section id="simulator" className="py-16 md:py-24 bg-[#fbfaf6] border-y border-[#e7e1d4]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
            <div>
              <span className="text-xs font-mono font-medium tracking-wider uppercase text-[#a8562f] px-2.5 py-1 bg-[#a8562f]/10 rounded">
                SIMULATOR LANGSUNG
              </span>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#232a33] mt-2">
                Uji Interaksi Pembuatan & Kunci Jurnal Akunio
              </h2>
              <p className="text-sm text-[#64696f] mt-1">
                Pilih sumber dokumen di bawah untuk melihat bagaimana AI menyusun draf seimbang dan
                mengunci ke buku besar.
              </p>
            </div>

            {/* Tab Selector */}
            <div className="flex items-center gap-2 bg-[#f5f1e9] p-1.5 rounded-xl border border-[#e7e1d4]">
              {entries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => setActiveTab(entry.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeTab === entry.id
                      ? "bg-[#232a33] text-[#fbfaf6] shadow-xs"
                      : "text-[#64696f] hover:text-[#232a33]"
                  }`}
                >
                  {entry.source}
                </button>
              ))}
            </div>
          </div>

          {/* Active Entry Canvas */}
          <div className="bg-[#f5f1e9] rounded-2xl border border-[#e7e1d4] p-6 lg:p-8 shadow-xs">
            <div className="grid lg:grid-cols-12 gap-8">
              {/* Document Overview Panel */}
              <div className="lg:col-span-4 space-y-4">
                <div className="bg-[#fbfaf6] p-5 rounded-xl border border-[#e7e1d4] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[#64696f]">
                      METADATA SUMBER
                    </span>
                    <span
                      className={`text-[11px] font-mono px-2 py-0.5 rounded font-semibold ${
                        currentEntry.status === "POSTED"
                          ? "bg-[#3e7c5a]/10 text-[#3e7c5a]"
                          : "bg-[#a8562f]/10 text-[#a8562f]"
                      }`}
                    >
                      {currentEntry.status}
                    </span>
                  </div>

                  <div>
                    <h4 className="font-bold text-base text-[#232a33]">{currentEntry.title}</h4>
                    <p className="text-xs text-[#64696f] mt-0.5">Rekanan: {currentEntry.vendor}</p>
                  </div>

                  <div className="pt-3 border-t border-[#e7e1d4] flex items-center justify-between text-xs text-[#64696f] font-mono">
                    <span>Tanggal: {currentEntry.date}</span>
                    <span>Tipe: {currentEntry.source}</span>
                  </div>

                  {currentEntry.voucherNo && (
                    <div className="pt-2 border-t border-[#e7e1d4] text-xs font-mono flex items-center justify-between text-[#232a33]">
                      <span>No. Voucher:</span>
                      <strong className="text-[#a8562f]">{currentEntry.voucherNo}</strong>
                    </div>
                  )}

                  {currentEntry.auditHash && (
                    <div className="text-[11px] font-mono text-[#64696f] flex items-center justify-between">
                      <span>Hash Kunci:</span>
                      <span>{currentEntry.auditHash}</span>
                    </div>
                  )}
                </div>

                {/* Status action advice */}
                <div className="p-4 rounded-xl bg-[#fbfaf6] border border-[#e7e1d4] text-xs text-[#64696f] space-y-2">
                  <div className="font-semibold text-[#232a33] flex items-center gap-1.5">
                    {currentEntry.status === "POSTED" ? (
                      <>
                        <Lock className="w-4 h-4 text-[#3e7c5a]" />
                        Transaksi Telah Dikunci Imutabel
                      </>
                    ) : (
                      <>
                        <Bot className="w-4 h-4 text-[#a8562f]" />
                        Draf Siap Diverifikasi Manusia
                      </>
                    )}
                  </div>
                  <p className="leading-relaxed">
                    {currentEntry.status === "POSTED"
                      ? "Jurnal ini sudah masuk ke buku besar. Baris tidak dapat dihapus atau diubah secara manual. Apabila perlu penyesuaian, gunakan jurnal pembalik."
                      : "AI telah menyeimbangkan nominal debit dan kredit. Anda dapat memeriksa akun sebelum mengunci transaksi ke buku besar."}
                  </p>

                  {currentEntry.status === "DRAFT" && (
                    <button
                      onClick={handlePostCurrent}
                      className="w-full mt-2 h-9 rounded-lg bg-[#232a33] text-[#fbfaf6] font-medium text-xs flex items-center justify-center gap-2 hover:bg-[#232a33]/90 active:scale-[0.98] transition-all"
                    >
                      <Lock className="w-3.5 h-3.5 text-[#a8562f]" />
                      Posting & Kunci Sekarang
                    </button>
                  )}
                </div>
              </div>

              {/* Journal Table Panel */}
              <div className="lg:col-span-8">
                <div className="bg-[#fbfaf6] rounded-xl border border-[#e7e1d4] overflow-hidden shadow-xs">
                  <div className="p-4 border-b border-[#e7e1d4] flex items-center justify-between bg-[#fbfaf6]">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-[#a8562f]" />
                      <span className="font-mono text-xs font-bold text-[#232a33] uppercase">
                        LEMBAR JURNAL DOUBLE-ENTRY
                      </span>
                    </div>
                    <div className="text-xs font-mono text-[#64696f]">
                      ATURAN: SEIMBANG SEBELUM POSTING
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-[#f5f1e9] text-[#64696f] uppercase text-[10px] tracking-wider border-b border-[#e7e1d4]">
                        <tr>
                          <th className="px-4 py-2.5">Kode & Nama Akun</th>
                          <th className="px-4 py-2.5 text-right">Debit</th>
                          <th className="px-4 py-2.5 text-right">Kredit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e7e1d4]">
                        {currentEntry.lines.map((line, idx) => (
                          <tr key={idx} className="hover:bg-[#f5f1e9]/50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-semibold text-[#232a33]">
                                <span className="text-[#a8562f] mr-1.5">{line.code}</span>
                                <span className="font-sans">{line.account}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-[#3e7c5a]">
                              {line.debit > 0 ? formatIdr(line.debit) : "-"}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-[#232a33]">
                              {line.credit > 0 ? formatIdr(line.credit) : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {/* Total Footer */}
                      <tfoot className="bg-[#f5f1e9] border-t-2 border-double border-[#232a33] font-bold">
                        <tr>
                          <td className="px-4 py-3 text-[#232a33] uppercase text-[11px]">
                            TOTAL SALDO (BALANCE CHECK):
                          </td>
                          <td className="px-4 py-3 text-right text-[#3e7c5a]">
                            {formatIdr(totalDebit)}
                          </td>
                          <td className="px-4 py-3 text-right text-[#232a33]">
                            {formatIdr(totalCredit)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="p-3 bg-[#f5f1e9] border-t border-[#e7e1d4] flex items-center justify-between text-[11px] font-mono">
                    <span className="flex items-center gap-1.5 text-[#3e7c5a] font-semibold">
                      <CheckCircle2 className="w-4 h-4 text-[#3e7c5a]" />
                      STATUS: SEIMBANG (DEBIT = KREDIT)
                    </span>
                    <span className="text-[#64696f]">TOLERANSI SELISIH: Rp 0,00</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Real Reports & SAK EMKM Standard */}
      <section id="standar" className="py-20 md:py-28">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-5 space-y-6">
              <span className="text-xs font-mono font-medium tracking-wider uppercase text-[#3e7c5a] px-3 py-1 bg-[#3e7c5a]/10 rounded-full">
                STANDAR AKUNTANSI KEUANGAN
              </span>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#232a33] leading-tight">
                Laporan Keuangan Standar Tanpa Beban Manual
              </h2>
              <p className="text-base text-[#64696f] leading-relaxed">
                Di Akunio, laporan bukan hasil ketik ulang staf keuangan. Setiap angka terhubung
                langsung ke jurnal yang telah diposting. Tutup buku bulanan selesai dalam hitungan
                menit, bukan berhari-hari.
              </p>

              <div className="space-y-3.5">
                {[
                  {
                    title: "Laporan Laba Rugi Komprehensif",
                    desc: "Pendapatan, beban pokok penjualan, dan beban operasional terurai otomatis.",
                  },
                  {
                    title: "Laporan Posisi Keuangan (Neraca)",
                    desc: "Aset lancar & tetap seimbang sempurna terhadap liabilitas dan ekuitas pemilik.",
                  },
                  {
                    title: "Laporan Arus Kas (Metode Tidak Langsung)",
                    desc: "Arus kas dari aktivitas operasional, investasi, dan pendanaan tanpa rekonsiliasi rumit.",
                  },
                  {
                    title: "Laporan Perubahan Ekuitas & Buku Besar",
                    desc: "Jejak mutasi akun per periode dengan navigasi riwayat voucher lengkap.",
                  },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#3e7c5a]/10 text-[#3e7c5a] flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-[#232a33]">{item.title}</h4>
                      <p className="text-xs text-[#64696f]">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <Link
                  href="/daftar"
                  className="inline-flex items-center gap-2 text-sm font-medium text-[#a8562f] hover:underline"
                >
                  Lihat contoh laporan standar SAK EMKM Akunio
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            {/* Interactive Report Preview Deck */}
            <div className="lg:col-span-7">
              <div className="bg-[#fbfaf6] rounded-2xl border border-[#e7e1d4] p-6 shadow-xs">
                <div className="border-b border-[#e7e1d4] pb-4 mb-4 flex items-center justify-between">
                  <div>
                    <div className="font-display font-bold text-lg text-[#232a33]">
                      PT Kopi Senja Nusantara
                    </div>
                    <div className="text-xs font-mono text-[#64696f]">
                      LAPORAN LABA RUGI (SAK EMKM) • PERIODE BERJALAN
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-[#232a33] text-[#fbfaf6] font-mono text-[11px]">
                    REAL-TIME
                  </span>
                </div>

                {/* Minimalist ledger sheet rows */}
                <div className="space-y-4 font-mono text-xs">
                  <div>
                    <div className="text-[11px] font-bold text-[#64696f] uppercase tracking-wider mb-2">
                      I. PENDAPATAN
                    </div>
                    <div className="space-y-1.5 pl-2 border-l border-[#e7e1d4]">
                      <div className="flex justify-between">
                        <span className="text-[#232a33] font-sans">Pendapatan Penjualan Produk</span>
                        <span className="font-medium text-[#232a33]">Rp 148.500.000</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#232a33] font-sans">Pendapatan Jasa & Catering</span>
                        <span className="font-medium text-[#232a33]">Rp 22.400.000</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-[#e7e1d4] font-bold">
                        <span className="text-[#232a33]">TOTAL PENDAPATAN OPERASIONAL</span>
                        <span className="text-[#3e7c5a]">Rp 170.900.000</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-bold text-[#64696f] uppercase tracking-wider mb-2">
                      II. BEBAN POKOK & OPERASIONAL
                    </div>
                    <div className="space-y-1.5 pl-2 border-l border-[#e7e1d4]">
                      <div className="flex justify-between">
                        <span className="text-[#232a33] font-sans">Beban Bahan Baku & Kemasan</span>
                        <span className="text-[#64696f]">Rp 58.200.000</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#232a33] font-sans">Gaji & Upah Karyawan</span>
                        <span className="text-[#64696f]">Rp 34.000.000</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#232a33] font-sans">Sewa Tempat & Utilitas</span>
                        <span className="text-[#64696f]">Rp 14.500.000</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-[#e7e1d4] font-bold">
                        <span className="text-[#232a33]">TOTAL BEBAN OPERASIONAL</span>
                        <span className="text-[#232a33]">Rp 106.700.000</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-[#f5f1e9] rounded-xl border-t-2 border-double border-[#232a33] flex justify-between items-center font-bold text-sm">
                    <span className="font-sans text-[#232a33]">LABA BERSIH TAHUN BERJALAN:</span>
                    <span className="text-[#3e7c5a]">Rp 64.200.000</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#e7e1d4] flex items-center justify-between text-[11px] text-[#64696f]">
                  <span>Sumber Data: 142 Voucher Terposting</span>
                  <span className="font-mono">KESEIMBANGAN: PAS</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Immutability & Audit Trail Section */}
      <section id="keamanan" className="py-20 md:py-28 bg-[#fbfaf6] border-y border-[#e7e1d4]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center space-y-4 mb-16">
            <span className="text-xs font-mono font-medium tracking-wider uppercase text-[#a8562f] px-3 py-1 bg-[#a8562f]/10 rounded-full">
              KEPERCAYAAN & AUDIT TRAIL
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#232a33]">
              Buku Besar yang Tidak Bisa Direkayasa Sepihak
            </h2>
            <p className="text-[#64696f] text-base leading-relaxed">
              Kredibilitas laporan keuangan Anda terlindungi di hadapan calon investor, bank, maupun
              otoritas pajak.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-[#f5f1e9] p-6 rounded-2xl border border-[#e7e1d4] space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#fbfaf6] border border-[#e7e1d4] flex items-center justify-center text-[#232a33]">
                <Lock className="w-5 h-5 text-[#a8562f]" />
              </div>
              <h3 className="font-bold text-base text-[#232a33]">Kunci Imutabilitas Database</h3>
              <p className="text-xs text-[#64696f] leading-relaxed">
                Trigger database melarang mutasi <code>UPDATE</code> atau <code>DELETE</code> pada baris
                jurnal yang berstatus <code>POSTED</code>. Tidak ada celah manipulasi angka di belakang layar.
              </p>
            </div>

            <div className="bg-[#f5f1e9] p-6 rounded-2xl border border-[#e7e1d4] space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#fbfaf6] border border-[#e7e1d4] flex items-center justify-center text-[#3e7c5a]">
                <RefreshCw className="w-5 h-5 text-[#3e7c5a]" />
              </div>
              <h3 className="font-bold text-base text-[#232a33]">Jurnal Pembalik Tertaut (Reversal)</h3>
              <p className="text-xs text-[#64696f] leading-relaxed">
                Salah input? Akunio membuat jurnal pembalik eksplisit yang tertaut ke ID asli melalui{" "}
                <code>reversal_of_id</code>. Sejarah pembukuan tetap transparan dan bersih bagi auditor.
              </p>
            </div>

            <div className="bg-[#f5f1e9] p-6 rounded-2xl border border-[#e7e1d4] space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#fbfaf6] border border-[#e7e1d4] flex items-center justify-center text-[#232a33]">
                <ShieldCheck className="w-5 h-5 text-[#232a33]" />
              </div>
              <h3 className="font-bold text-base text-[#232a33]">Isolasi Tenant Tingkat RLS</h3>
              <p className="text-xs text-[#64696f] leading-relaxed">
                Pemisahan data organisasi menggunakan Row-Level Security (RLS) pada lapisan Postgres.
                Bagan akun, transaksi, dan bukti dokumen Anda terisolasi secara matematis per{" "}
                <code>org_id</code>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison: Spreadsheet vs Akunio */}
      <section className="py-20 md:py-28">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="font-display text-3xl font-bold text-[#232a33]">
              Mengapa UKM Hijrah dari Spreadsheet ke Akunio?
            </h2>
            <p className="text-sm text-[#64696f] mt-2">
              Perbandingan langsung antara metode manual rentan galat vs otomatisasi ledger seimbang.
            </p>
          </div>

          <div className="bg-[#fbfaf6] rounded-2xl border border-[#e7e1d4] overflow-hidden shadow-xs">
            <div className="grid grid-cols-12 bg-[#f5f1e9] border-b border-[#e7e1d4] p-4 text-xs font-mono uppercase tracking-wider text-[#64696f]">
              <div className="col-span-4 font-semibold text-[#232a33]">Aspek Pembukuan</div>
              <div className="col-span-4 text-[#9c5a38]">Spreadsheet Manual / Buku Kasir</div>
              <div className="col-span-4 text-[#3e7c5a] font-bold">Akunio SaaS</div>
            </div>

            <div className="divide-y divide-[#e7e1d4] text-xs">
              {[
                {
                  aspek: "Input Nota & Kuitansi",
                  lama: "Ketik manual angka satu per satu; rentan salah ketik angka 0.",
                  akunio: "Cukup foto nota atau upload PDF; AI mengekstrak nominal & akun.",
                },
                {
                  aspek: "Keseimbangan (Debit = Kredit)",
                  lama: "Sering selisih di akhir bulan; butuh berhari-hari mencari akun yang timpang.",
                  akunio: "Draf divalidasi otomatis. Sistem menolak posting jika belum 100% seimbang.",
                },
                {
                  aspek: "Integritas & Keamanan Data",
                  lama: "Rumus bisa tertimpa tidak sengaja, angka masa lalu mudah diubah tanpa jejak.",
                  akunio: "Database dikunci imutabel setelah posting. Koreksi wajib via jurnal pembalik.",
                },
                {
                  aspek: "Penyusunan Laporan Keuangan",
                  lama: "Harus merangkai rumus Neraca & Laba Rugi manual; risiko salah referensi cell.",
                  akunio: "Neraca, Laba Rugi, & Arus Kas tersedia real-time sesuai standar SAK EMKM.",
                },
                {
                  aspek: "Kesiapan Audit & Pajak",
                  lama: "Bukti nota tercecer di map fisik; panik saat diperiksa auditor.",
                  akunio: "Tiap baris angka langsung terhubung ke foto bukti transaksi tersimpan rapi.",
                },
              ].map((row, i) => (
                <div key={i} className="grid grid-cols-12 p-4 items-center hover:bg-[#f5f1e9]/40 transition-colors">
                  <div className="col-span-4 font-semibold text-[#232a33] pr-4">{row.aspek}</div>
                  <div className="col-span-4 text-[#64696f] pr-4">{row.lama}</div>
                  <div className="col-span-4 font-medium text-[#232a33] flex items-start gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[#3e7c5a] shrink-0 mt-0.5" />
                    <span>{row.akunio}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Accordion */}
      <section id="faq" className="py-20 md:py-24 bg-[#fbfaf6] border-t border-[#e7e1d4]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center space-y-3 mb-12">
            <span className="text-xs font-mono font-medium tracking-wider uppercase text-[#a8562f] px-2.5 py-1 bg-[#a8562f]/10 rounded">
              TANYA JAWAB UMUM
            </span>
            <h2 className="font-display text-3xl font-bold text-[#232a33]">
              Pertanyaan Seputar Akunio
            </h2>
            <p className="text-sm text-[#64696f]">
              Semua yang perlu Anda ketahui tentang kepatuhan akuntansi dan alur kerja AI kami.
            </p>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-[#e7e1d4] bg-[#f5f1e9]/50 overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full px-5 py-4 text-left flex items-center justify-between text-sm font-semibold text-[#232a33] hover:bg-[#f5f1e9] transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-[#64696f] transition-transform duration-200 ${
                      openFaq === idx ? "rotate-180 text-[#a8562f]" : ""
                    }`}
                  />
                </button>
                <AnimatePresence>
                  {openFaq === idx && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="px-5 pb-5 text-xs sm:text-sm text-[#64696f] leading-relaxed border-t border-[#e7e1d4]/60 pt-3">
                        {faq.a}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final High-Conversion Action Banner */}
      <section className="py-20 md:py-28 bg-[#232a33] text-[#fbfaf6] relative overflow-hidden">
        <div className="max-w-[1000px] mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#3d3529] border border-[#a89a88]/30 text-xs font-mono text-[#ede4d7]">
            <Lock className="w-3.5 h-3.5 text-[#a8562f]" />
            BUKU BESAR IMUTABEL • SAH & TERTELUSUR
          </div>

          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight">
            Rapikan Pembukuan Usaha Anda Hari Ini.
            <br />
            <span className="italic font-serif text-[#a8562f]">Tanpa Rumus Selisih, Tanpa Drama.</span>
          </h2>

          <p className="text-sm sm:text-base text-[#a89a88] max-w-2xl mx-auto leading-relaxed">
            Daftar sekarang untuk organisasi Anda. Mulai dari unggah satu nota fisik hingga laporan
            keuangan berstandar SAK EMKM yang siap diserahkan ke bank atau auditor.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <Link
              href="/daftar"
              className="h-12 px-8 rounded-xl bg-[#a8562f] text-white font-medium text-base flex items-center justify-center gap-2 hover:bg-[#a8562f]/90 active:scale-[0.98] transition-all shadow-lg focus:ring-2 focus:ring-white"
            >
              Mulai Daftar Gratis
              <ArrowRight className="w-5 h-5 text-white" />
            </Link>
            <Link
              href="/masuk"
              className="h-12 px-6 rounded-xl bg-[#3d3529] border border-[#a89a88]/40 text-[#ede4d7] font-medium text-sm flex items-center justify-center hover:bg-[#3d3529]/80 transition-colors"
            >
              Sudah Punya Akun? Masuk
            </Link>
          </div>

          <div className="pt-8 border-t border-[#3d3529] flex flex-wrap items-center justify-center gap-6 text-xs text-[#a89a88] font-mono">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#3e7c5a]" />
              Tidak Perlu Kartu Kredit
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#3e7c5a]" />
              Setup Organisasi SAK EMKM Instan
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#3e7c5a]" />
              Dukungan Format Nota & Faktur Pajak
            </span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#fbfaf6] border-t border-[#e7e1d4] py-12 text-xs text-[#64696f]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-[#232a33] text-[#fbfaf6] font-display font-bold text-xs flex items-center justify-center">
              A
            </div>
            <span className="font-bold text-sm text-[#232a33]">Akunio</span>
            <span className="text-[#a89a88]">|</span>
            <span>Pembukuan double-entry rapi untuk UKM Indonesia.</span>
          </div>

          <div className="flex items-center gap-6 font-mono text-[11px]">
            <Link href="/masuk" className="hover:text-[#232a33]">
              Masuk
            </Link>
            <Link href="/daftar" className="hover:text-[#232a33]">
              Daftar
            </Link>
            <a href="#simulator" className="hover:text-[#232a33]">
              Simulator
            </a>
            <span className="text-[#a89a88]">© 2026 Akunio. SAK EMKM Compliance.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
