import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Lock,
  Scale,
  Sparkles,
  BarChart3,
  Receipt,
  ShieldCheck,
  Zap,
  Building2,
  HelpCircle,
  FileSpreadsheet,
  Layers,
  ChevronRight,
} from "lucide-react";
import { ScrollReveal } from "@/components/landing/v4/reveal";
import { VideoPlayer } from "@/components/landing/v4/video-player";
import { InteractiveSimulator } from "@/components/landing/v4/interactive-simulator";

export const metadata: Metadata = {
  title: "Akunio — Tidak Perlu Jago Akuntansi, Biarkan AI yang Mencatat",
  description:
    "Akunio mengubah foto nota dan chat santai menjadi jurnal berpasangan seimbang (Debit = Kredit) serta laporan keuangan siap pakai untuk UKM. Fokus kembangkan usaha Anda.",
};

const NAV_LINKS = [
  { href: "#video-demo", label: "Video Demo" },
  { href: "#simulator", label: "Coba Simulator" },
  { href: "#fitur", label: "Fitur Utama" },
  { href: "#laporan", label: "Laporan Siap Pakai" },
  { href: "#perbandingan", label: "Bandingkan" },
  { href: "#faq", label: "FAQ" },
] as const;

const TRUST_METRICS = [
  {
    icon: Scale,
    label: "Debit = Kredit Mutlak",
    desc: "100% tervalidasi seimbang sebelum masuk buku besar.",
  },
  {
    icon: Building2,
    label: "Standar SAK EMKM IAI",
    desc: "Bagan akun resmi yang diakui bank & pelaporan SPT.",
  },
  {
    icon: BarChart3,
    label: "Laporan Real-Time",
    desc: "Laba Rugi, Neraca, & Arus Kas otomatis tanpa rumus.",
  },
  {
    icon: ShieldCheck,
    label: "Multi-Tenant RLS",
    desc: "Data keuangan terisolasi dan terenkripsi aman per entitas.",
  },
] as const;

const PAIN_POINTS = [
  {
    number: "01",
    title: "Nota & kuitansi menumpuk di laci kasir",
    body: "Struk belanja bensin, nota ATK, dan kuitansi makan siang karyawan tercecer berhari-hari. Saat mau direkap, angkanya sudah pudar dan tidak terbaca.",
    solution: "Cukup foto dari HP atau ketik satu kalimat santai di chat Akunio. Ekstraksi otomatis dalam 3 detik.",
  },
  {
    number: "02",
    title: "Spreadsheet diam-diam membiarkan buku selisih",
    body: "Satu rumus Excel yang tidak sengaja terhapus membuat baris Debit dan Kredit tidak imbang. Anda baru panik saat tutup buku akhir tahun.",
    solution: "Buku besar anti-selisih. Sistem Akunio otomatis menolak dan memblokir jurnal yang timpang.",
  },
  {
    number: "03",
    title: "Takut salah pilih akun & pusing istilah debit-kredit",
    body: "Apakah sewa kios 6 bulan masuk beban atau aset lancar? Ketakutan salah mencatat membuat pembukuan terus ditunda-tunda.",
    solution: "Tidak perlu jago akuntansi. AI Akunio mencocokkan bagan akun SAK EMKM secara presisi untuk Anda.",
  },
] as const;

const CORE_PILLARS = [
  {
    icon: Sparkles,
    badge: "Chat AI Cerdas",
    title: "Bicara Bahasa Manusia, Bukan Bahasa Akuntan",
    body: "Cukup ketik “baru saja beli kertas A4 2 rim dan tinta di Toko Berkah 350.000 tunai” atau unggah foto nota. Akunio langsung membaca vendor, tanggal, PPN, dan menyusun draf jurnal berpasangan seimbang.",
    highlights: ["Mendukung foto kuitansi & faktur PDF", "Deteksi vendor & pajak otomatis", "Bagan akun SAK EMKM otomatis"],
  },
  {
    icon: Lock,
    badge: "Buku Besar Imutabel",
    title: "Auto-Posting Seimbang yang Membela Dirinya",
    body: "AI mengusulkan draf, namun Anda yang memegang kendali penuh. Setelah Anda klik setujui, sistem memverifikasi Debit = Kredit dan mengunci entri secara permanen dengan nomor JE-YYYY-NNNN. Tidak ada angka yang bisa diedit diam-diam.",
    highlights: ["Validasi Debit = Kredit mutlak", "Koreksi hanya lewat jurnal pembalik", "Jejak audit permanen & teratur"],
  },
  {
    icon: BarChart3,
    badge: "Laporan Seketika",
    title: "Laporan Keuangan Siap Pakai Tanpa Rekap Manual",
    body: "Laba Rugi, Posisi Keuangan (Neraca), dan Arus Kas langsung tersaji seketika setiap ada transaksi baru. Siap dicetak untuk pengajuan modal usaha ke perbankan atau lampiran SPT Tahunan.",
    highlights: ["Laba Rugi komprehensif bulanan & tahunan", "Neraca terstruktur rapi", "Export PDF & Excel siap bank"],
  },
] as const;

const STEPS = [
  {
    step: "Langkah 1",
    title: "Kirim Nota atau Chat Santai",
    desc: "Foto nota dari kamera ponsel, unggah file faktur PDF, atau cukup kirim pesan singkat ke chat Akunio.",
  },
  {
    step: "Langkah 2",
    title: "AI Susun Draf Jurnal Seimbang",
    desc: "Akunio mengekstrak angka dan memetakan kode akun Debit & Kredit. Anda tinggal meninjau dengan satu pandangan mata.",
  },
  {
    step: "Langkah 3",
    title: "Klik Setujui & Laporan Beres",
    desc: "Buku besar terkunci permanen, dan seluruh laporan keuangan Anda langsung terbarui saat itu juga.",
  },
] as const;

const COMPARISON_ROWS = [
  {
    kriteria: "Kecepatan Catat",
    spreadsheet: "Manual ketik kolom per kolom (3-5 menit/nota)",
    kuno: "Pilih puluhan dropdown akun yang membingungkan",
    akunio: "Cukup foto struk atau chat 1 kalimat (5 detik)",
  },
  {
    kriteria: "Jaminan Keseimbangan",
    spreadsheet: "Rawan selisih jika rumus SUM salah",
    kuno: "Bisa dipaksa simpan meski belum seimbang",
    akunio: "Otomatis & mutlak: Debit = Kredit wajib sama",
  },
  {
    kriteria: "Keahlian Diperlukan",
    spreadsheet: "Harus paham rumus Excel & akuntansi dasar",
    kuno: "Wajib paham debit/kredit dan bagan akun",
    akunio: "Bahasa Indonesia santai, tanpa perlu paham debit-kredit",
  },
  {
    kriteria: "Laporan Keuangan",
    spreadsheet: "Harus buat tabel pivot & rumus laba rugi sendiri",
    kuno: "Laporan kaku dan sering lambat di-render",
    akunio: "Laba Rugi, Neraca, & Arus Kas otomatis real-time",
  },
  {
    kriteria: "Keamanan Jejak Audit",
    spreadsheet: "Angka bisa diubah tanpa jejak riwayat",
    kuno: "Riwayat edit sering kali tidak lengkap",
    akunio: "Imutabel: posted terkunci, koreksi via jurnal pembalik",
  },
] as const;

const TESTIMONIALS = [
  {
    quote:
      "Dulu tiap akhir bulan saya begadang sampai subuh cuma buat nyari selisih 200 ribu di Excel. Di Akunio, saya tinggal foto struk belanja bahan baku kopi tiap pagi. Laporan laba rugi langsung kelihatan jelas!",
    name: "Rian Hidayat",
    role: "Pemilik Kopi Kala Senja",
    entity: "Kedai Kopi & F&B (Bandung)",
  },
  {
    quote:
      "Saya desainer grafis, bukan akuntan. Dulu kalau kirim invoice selalu bingung catat PPN-nya gimana. Dengan Akunio, saya chat 'klien bayar termin 1 invoice 15 juta' dan jurnalnya langsung rapi sesuai standar.",
    name: "Dian Sastrowardoyo",
    role: "Founder Studio Visual Karsa",
    entity: "Agensi Kreatif (Jakarta)",
  },
  {
    quote:
      "Waktu mau ajuin KUR ke bank, pihak bank minta laporan keuangan standar SAK EMKM. Akunio tinggal klik export PDF, langsung diterima pihak bank tanpa revisi sama sekali.",
    name: "Bambang Sudibyo",
    role: "Direktur Operasional",
    entity: "Distributor Retail Berkah (Surabaya)",
  },
] as const;

const FAQS = [
  {
    q: "Apakah saya harus paham akuntansi atau istilah debit-kredit?",
    a: "Sama sekali tidak. Akunio dirancang khusus untuk pemilik usaha, bukan akuntan profesional. Anda cukup mengetikkan transaksi seperti mengobrol biasa (misalnya: 'beli bensin 50rb') atau mengunggah foto nota. AI Akunio yang akan menyusun draf akun debit dan kreditnya untuk Anda.",
  },
  {
    q: "Bagaimana jika AI salah mencocokkan akun atau nominal?",
    a: "Hasil ekstraksi AI berbentuk 'Draf Jurnal', bukan langsung diposting. Anda selalu memiliki kesempatan untuk meninjau nominal dan akunnya terlebih dahulu. Jika ada yang ingin disesuaikan, Anda bisa mengeditnya dengan satu klik sebelum menyetujuinya masuk ke buku besar.",
  },
  {
    q: "Apakah laporan keuangan Akunio diakui oleh bank dan dinas pajak?",
    a: "Ya. Akunio mengadopsi standar SAK EMKM (Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah) yang ditetapkan oleh Ikatan Akuntan Indonesia (IAI). Format Laba Rugi dan Neraca yang dihasilkan memenuhi standar resmi untuk pengajuan kredit bank dan pelaporan SPT Tahunan.",
  },
  {
    q: "Bagaimana cara kerja auto-posting berpasangan?",
    a: "Sistem Akunio menggunakan prinsip double-entry accounting. Setiap kali transaksi dicatat, jumlah total di sisi Debit harus sama persis dengan sisi Kredit. Sistem memiliki sistem pertahanan yang menolak pencatatan jika terjadi selisih, menjamin pembukuan Anda selalu seimbang.",
  },
  {
    q: "Apakah data transaksi dan keuangan bisnis saya aman?",
    a: "Sangat aman. Database kami menerapkan Row-Level Security (RLS) di mana data setiap organisasi terisolasi total dan hanya bisa diakses oleh entitas Anda. Selain itu, entri yang sudah diposting terkunci secara imutabel dengan jejak audit yang tidak bisa dimanipulasi.",
  },
  {
    q: "Format dokumen apa saja yang bisa dibaca oleh Akunio?",
    a: "Akunio mendukung foto nota langsung dari kamera ponsel (JPG, PNG, WebP), dokumen faktur PDF, hingga file spreadsheet (CSV, XLSX) dengan ukuran hingga 5MB per berkas.",
  },
] as const;

function CtaButton({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-terra px-6 text-sm font-semibold text-canvas transition-all hover:bg-terra/90 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra/60 active:scale-[0.98] ${className}`}
    >
      {children}
    </Link>
  );
}

function SectionHead({
  eyebrow,
  title,
  lead,
  center = false,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  center?: boolean;
}) {
  return (
    <div className={`max-w-3xl ${center ? "mx-auto text-center" : ""}`}>
      {eyebrow ? (
        <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-terra">
          {eyebrow}
        </span>
      ) : null}
      <h2
        className={`font-display text-3xl font-semibold leading-tight tracking-[-0.02em] text-balance text-ink sm:text-4xl lg:text-5xl ${
          eyebrow ? "mt-2" : ""
        }`}
      >
        {title}
      </h2>
      {lead ? (
        <p className="mt-4 text-balance text-base leading-relaxed text-ink-soft sm:text-lg">
          {lead}
        </p>
      ) : null}
    </div>
  );
}

export default function LandingV4Page() {
  return (
    <main className="min-h-screen bg-canvas text-ink selection:bg-terra/20 selection:text-ink">
      {/* Topbar Header */}
      <header className="sticky top-0 z-50 border-b border-rule bg-canvas/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/v4" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/akunio-logo-mark.svg" alt="Logo Akunio" className="size-8" />
            <span className="font-display text-xl font-bold tracking-tight text-ink">Akunio</span>
          </Link>

          <nav aria-label="Navigasi Utama" className="hidden items-center gap-7 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-ink-soft transition-colors hover:text-ink"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/masuk"
              className="hidden text-sm font-medium text-ink-soft transition-colors hover:text-ink sm:inline-block"
            >
              Masuk
            </Link>
            <Link
              href="/daftar"
              className="inline-flex h-9 items-center rounded-xl bg-ink px-4 text-xs font-semibold text-paper transition-all hover:bg-ink/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra"
            >
              Mulai Gratis
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section — Formula: 6-12 words outcome headline, risk reduction, high CTA */}
      <section className="relative mx-auto w-full max-w-6xl px-4 pt-14 pb-16 sm:px-6 sm:pt-20 lg:px-8 lg:pb-24">
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-terra/30 bg-terra/5 px-3 py-1 text-xs font-medium text-terra">
            <Sparkles className="size-3.5" />
            <span>AI Accounting SaaS untuk UKM & Wirausaha Indonesia</span>
          </div>

          <h1 className="mt-5 font-display text-4xl font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-5xl lg:text-6xl">
            Tidak Perlu Jago Akuntansi.
            <br />
            <span className="text-terra">Biarkan Akunio Mencatat</span>, Anda Fokus Mengembangkan Usaha.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-ink-soft sm:text-lg">
            Ketik pesan santai atau foto nota apa saja. Asisten AI Akunio otomatis menyusun draf
            jurnal berpasangan yang seimbang (Debit = Kredit) dan memperbarui laporan keuangan Anda secara instan.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
            <CtaButton href="/daftar">
              Mulai Catat Gratis Sekarang
              <ArrowRight aria-hidden className="size-4" />
            </CtaButton>
            <a
              href="#video-demo"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-rule bg-paper px-5 text-sm font-medium text-ink shadow-xs transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra"
            >
              Tonton Demo (44 Detik)
            </a>
          </div>

          <p className="mt-3.5 text-xs text-ink-soft">
            ✓ Gratis 14 hari · Tanpa kartu kredit · Siap pakai dalam 60 detik · Standar SAK EMKM IAI
          </p>
        </div>

        {/* Video Centerpiece with Interactive Chapters */}
        <div id="video-demo" className="mt-12 scroll-mt-24">
          <ScrollReveal y={20}>
            <VideoPlayer />
          </ScrollReveal>
        </div>
      </section>

      {/* Trust & Proof Bar */}
      <section aria-label="Jaminan Kepercayaan" className="border-y border-rule bg-paper">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
          {TRUST_METRICS.map((metric) => (
            <div key={metric.label} className="flex items-start gap-3.5">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-canvas text-terra">
                <metric.icon className="size-5" />
              </div>
              <div>
                <h3 className="font-display text-sm font-semibold text-ink">{metric.label}</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{metric.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive Simulator Section */}
      <section id="simulator" className="scroll-mt-20 mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <ScrollReveal>
          <SectionHead
            center
            eyebrow="Uji Coba Langsung"
            title="Lihat Bagaimana Akunio Bekerja untuk Usaha Anda"
            lead="Pilih skenario di bawah untuk merasakan bagaimana kalimat santai diubah menjadi jurnal berpasangan seimbang dan laporan keuangan instan."
          />
        </ScrollReveal>

        <div className="mt-10">
          <ScrollReveal delay={0.1}>
            <InteractiveSimulator />
          </ScrollReveal>
        </div>
      </section>

      {/* Problem Section — Creating Empathy */}
      <section className="border-t border-rule bg-paper">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <ScrollReveal>
            <SectionHead
              eyebrow="Tantangan Nyata Pembukuan"
              title="Mengapa Spreadsheet & Pembukuan Manual Selalu Berujung Selisih?"
              lead="Tiga masalah klasik yang terus menghabiskan waktu pemilik usaha — dan mengapa spreadsheet tidak pernah bisa mencegahnya."
            />
          </ScrollReveal>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {PAIN_POINTS.map((pain, idx) => (
              <ScrollReveal key={pain.number} delay={idx * 0.08}>
                <div className="matte-card flex h-full flex-col justify-between rounded-2xl border border-rule bg-canvas/40 p-6">
                  <div>
                    <span className="tnum font-display text-3xl font-bold text-terra/40">
                      {pain.number}
                    </span>
                    <h3 className="mt-2 text-base font-semibold text-ink">{pain.title}</h3>
                    <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">{pain.body}</p>
                  </div>
                  <div className="mt-6 rounded-xl border border-debit/20 bg-debit/5 p-3 text-xs">
                    <span className="font-semibold text-debit">Solusi Akunio:</span>
                    <p className="mt-1 text-ink">{pain.solution}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* 3 Core Pillars / Features */}
      <section id="fitur" className="scroll-mt-20 border-t border-rule bg-canvas">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <ScrollReveal>
            <SectionHead
              center
              eyebrow="Keunggulan Utama"
              title="Tiga Hal yang Membuat Akunio Begitu Berbeda"
              lead="Bukan sekadar software kas masuk-keluar. Ini sistem akuntansi cerdas yang melindungi integritas buku besar Anda."
            />
          </ScrollReveal>

          <div className="mt-12 grid gap-8 lg:grid-cols-3">
            {CORE_PILLARS.map((pillar, i) => (
              <ScrollReveal key={pillar.title} delay={i * 0.1}>
                <div className="matte-card flex h-full flex-col justify-between rounded-2xl border border-rule bg-paper p-7 shadow-xs">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex size-11 items-center justify-center rounded-xl bg-canvas text-terra">
                        <pillar.icon className="size-5" />
                      </div>
                      <span className="rounded-full bg-terra/10 px-2.5 py-0.5 text-[10px] font-semibold text-terra">
                        {pillar.badge}
                      </span>
                    </div>

                    <h3 className="mt-5 font-display text-lg font-bold text-ink sm:text-xl">
                      {pillar.title}
                    </h3>

                    <p className="mt-3 text-sm leading-relaxed text-ink-soft">{pillar.body}</p>
                  </div>

                  <div className="mt-6 border-t border-rule/60 pt-4">
                    <ul className="space-y-2 text-xs text-ink">
                      {pillar.highlights.map((item) => (
                        <li key={item} className="flex items-center gap-2">
                          <CheckCircle2 className="size-3.5 shrink-0 text-debit" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works — 3 Simple Steps */}
      <section className="border-t border-rule bg-paper">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <ScrollReveal>
            <SectionHead
              eyebrow="Alur Kerja 3 Detik"
              title="Dari Tumpukan Nota ke Laporan Rapi dalam 3 Langkah"
              lead="Sederhana di depan, kokoh di belakang. Tanpa menu rumit, tanpa konfigurasi panjang."
            />
          </ScrollReveal>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, idx) => (
              <ScrollReveal key={s.step} delay={idx * 0.1}>
                <div className="relative rounded-2xl border border-rule bg-canvas/40 p-6">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-terra">
                    {s.step}
                  </span>
                  <h3 className="mt-2 font-display text-lg font-semibold text-ink">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>

          <div className="mt-10 flex justify-center">
            <CtaButton href="/daftar">
              Coba Sekarang dengan Nota Pertama Anda
              <ArrowRight className="size-4" />
            </CtaButton>
          </div>
        </div>
      </section>

      {/* Comparison Table: Cara Lama vs Akunio */}
      <section id="perbandingan" className="scroll-mt-20 border-t border-rule bg-canvas">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <ScrollReveal>
            <SectionHead
              center
              eyebrow="Perbandingan Jujur"
              title="Mengapa Berpindah ke Akunio?"
              lead="Bandingkan cara kerja spreadsheet dan software akuntansi lama dengan pendekatan cerdas Akunio."
            />
          </ScrollReveal>

          <div className="mt-12 overflow-hidden rounded-2xl border border-rule bg-paper shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead>
                  <tr className="border-b border-rule bg-canvas/80 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                    <th className="p-4 w-1/4">Parameter</th>
                    <th className="p-4 w-1/4">Spreadsheet / Excel</th>
                    <th className="p-4 w-1/4">Software Konvensional</th>
                    <th className="p-4 w-1/4 text-terra bg-terra/5">Akunio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule/70">
                  {COMPARISON_ROWS.map((row) => (
                    <tr key={row.kriteria} className="hover:bg-canvas/30 transition-colors">
                      <td className="p-4 font-semibold text-ink">{row.kriteria}</td>
                      <td className="p-4 text-xs leading-relaxed text-ink-soft">{row.spreadsheet}</td>
                      <td className="p-4 text-xs leading-relaxed text-ink-soft">{row.kuno}</td>
                      <td className="p-4 text-xs leading-relaxed font-medium text-ink bg-terra/5">
                        <span className="flex items-center gap-1.5 text-debit font-semibold">
                          <Check className="size-3.5 shrink-0" />
                          {row.akunio}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Laporan Siap Pakai Showcase */}
      <section id="laporan" className="scroll-mt-20 border-t border-rule bg-paper">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <ScrollReveal>
              <SectionHead
                eyebrow="Laporan Standar SAK EMKM"
                title="Laporan Keuangan Resmi yang Siap Diajukan ke Bank & Investor"
                lead="Tidak perlu lagi menyewa konsultan mahal hanya untuk membuat laporan laba rugi atau neraca standar. Setiap kali Anda memposting transaksi, laporan keuangan Anda langsung terbit."
              />

              <div className="mt-8 space-y-4 text-sm text-ink">
                <div className="flex items-start gap-3">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-debit/10 text-debit">
                    <Check className="size-3.5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-ink">Laporan Laba Rugi Komprehensif</h4>
                    <p className="text-xs text-ink-soft">
                      Menampilkan pendapatan bersih, harga pokok penjualan, dan beban operasional untuk melihat keuntungan riil.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-debit/10 text-debit">
                    <Check className="size-3.5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-ink">Laporan Posisi Keuangan (Neraca)</h4>
                    <p className="text-xs text-ink-soft">
                      Struktur aset lancar, aset tetap, liabilitas jangka pendek, dan ekuitas pemilik yang presisi dan seimbang.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-debit/10 text-debit">
                    <Check className="size-3.5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-ink">Laporan Arus Kas Metode Tidak Langsung</h4>
                    <p className="text-xs text-ink-soft">
                      Melacak perputaran kas dari aktivitas operasional, investasi, dan pendanaan tanpa kalkulasi manual.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <CtaButton href="/daftar">
                  Dapatkan Laporan Perdana Anda
                  <ArrowRight className="size-4" />
                </CtaButton>
              </div>
            </ScrollReveal>

            {/* Mock Report Card */}
            <ScrollReveal delay={0.15}>
              <div className="matte-card rounded-2xl border border-rule bg-canvas/40 p-5 shadow-sm sm:p-6">
                <div className="flex items-center justify-between border-b border-rule pb-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-terra">
                      LAPORAN LABA RUGI
                    </span>
                    <h4 className="font-display text-base font-bold text-ink">
                      PT Kopi Senja Abadi
                    </h4>
                    <p className="text-[11px] text-ink-soft">Periode: Oktober 2026 (IDR)</p>
                  </div>
                  <span className="rounded-full bg-debit/10 px-2.5 py-1 text-xs font-semibold text-debit">
                    Status: Seimbang
                  </span>
                </div>

                <div className="mt-4 space-y-2.5 text-xs sm:text-sm">
                  <div className="flex justify-between font-semibold text-ink">
                    <span>Pendapatan Usaha</span>
                    <span className="tnum">Rp 68.450.000</span>
                  </div>
                  <div className="flex justify-between text-ink-soft pl-3 text-xs">
                    <span>Beban Pokok Penjualan (HPP)</span>
                    <span className="tnum">(Rp 24.120.000)</span>
                  </div>
                  <div className="flex justify-between border-t border-dashed border-rule pt-2 font-medium text-ink">
                    <span>Laba Kotor</span>
                    <span className="tnum text-debit">Rp 44.330.000</span>
                  </div>
                  <div className="flex justify-between text-ink-soft pl-3 text-xs">
                    <span>Beban Operasional & Gaji</span>
                    <span className="tnum">(Rp 15.650.000)</span>
                  </div>
                  <div className="flex justify-between text-ink-soft pl-3 text-xs">
                    <span>Beban Sewa & Perlengkapan</span>
                    <span className="tnum">(Rp 4.200.000)</span>
                  </div>
                  <div className="rule-double flex justify-between pt-2.5 text-base font-bold text-ink">
                    <span>Laba Bersih Operasional</span>
                    <span className="tnum text-debit">Rp 24.480.000</span>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-rule bg-paper p-3 text-center text-xs text-ink-soft">
                  ✓ Terhubung otomatis ke Laporan Neraca & SPT Tahunan
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Real Customer Stories */}
      <section className="border-t border-rule bg-canvas">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <ScrollReveal>
            <SectionHead
              center
              eyebrow="Cerita Pengguna"
              title="Dipercaya Pemilik Bisnis yang Ingin Fokus Tumbuh"
              lead="Bukan sekadar angka, ini tentang ketenangan pikiran dan waktu yang bisa Anda pakai untuk membesarkan usaha."
            />
          </ScrollReveal>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((t, idx) => (
              <ScrollReveal key={t.name} delay={idx * 0.1}>
                <div className="matte-card flex h-full flex-col justify-between rounded-2xl border border-rule bg-paper p-6 shadow-xs">
                  <p className="text-sm leading-relaxed text-ink italic">“{t.quote}”</p>
                  <div className="mt-6 border-t border-rule/60 pt-4">
                    <h4 className="font-display text-sm font-semibold text-ink">{t.name}</h4>
                    <p className="text-xs text-ink-soft">{t.role}</p>
                    <p className="mt-1 text-[11px] font-medium text-terra">{t.entity}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="scroll-mt-20 border-t border-rule bg-paper">
        <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <ScrollReveal>
            <SectionHead
              center
              eyebrow="Pertanyaan Umum"
              title="Semua yang Perlu Anda Ketahui"
              lead="Jawaban jujur atas pertanyaan seputar kepatuhan akuntansi, keamanan data, dan cara kerja Akunio."
            />
          </ScrollReveal>

          <div className="mt-10 space-y-3.5">
            {FAQS.map((faq, i) => (
              <ScrollReveal key={faq.q} delay={i * 0.05}>
                <details className="matte-card group rounded-2xl border border-rule bg-canvas/30 transition-all hover:bg-canvas/60">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4.5 text-sm sm:text-base font-semibold text-ink [&::-webkit-details-marker]:hidden">
                    <span>{faq.q}</span>
                    <ChevronRight className="size-4 shrink-0 text-ink-soft transition-transform duration-200 group-open:rotate-90" />
                  </summary>
                  <div className="px-6 pb-5 text-sm leading-relaxed text-ink-soft border-t border-rule/40 pt-3">
                    {faq.a}
                  </div>
                </details>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Final High-CTA Banner — Double-Entry Ledger Stamp Aesthetic */}
      <section className="border-t border-rule bg-canvas px-4 py-20 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="mx-auto max-w-4xl rounded-3xl border border-rule bg-paper p-8 text-center shadow-lg sm:p-14">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-terra/30 bg-terra/10 px-3 py-1 text-xs font-semibold text-terra">
              <Zap className="size-3.5" />
              Mulai Sekarang · Gratis 14 Hari
            </span>

            <h2 className="mt-5 font-display text-3xl font-bold leading-tight tracking-[-0.02em] text-ink sm:text-4xl lg:text-5xl">
              Fokus Kembangkan Usaha Anda.
              <br />
              Urusan Pembukuan, Serahkan pada Akunio.
            </h2>

            <p className="mx-auto mt-4 max-w-xl text-base text-ink-soft">
              Foto satu nota hari ini, dan lihat bagaimana pembukuan Anda menjadi rapi, seimbang,
              dan siap pakai tanpa pusing rumus akuntansi.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
              <CtaButton href="/daftar">
                Buat Akun Gratis Sekarang
                <ArrowRight className="size-4" />
              </CtaButton>
              <Link
                href="/masuk"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-rule bg-canvas px-6 text-sm font-medium text-ink transition-colors hover:bg-ink/5"
              >
                Masuk ke Akun Anda
              </Link>
            </div>

            {/* Double-entry proof footer */}
            <div className="mx-auto mt-12 max-w-lg rounded-2xl border border-rule bg-canvas/60 p-4 text-xs">
              <div className="grid grid-cols-2 gap-4 text-left">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                    DEBIT (YANG ANDA DAPATKAN)
                  </span>
                  <p className="mt-1 font-semibold text-ink">Waktu & Fokus untuk Usaha</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                    KREDIT (YANG ANDA LEPAS)
                  </span>
                  <p className="mt-1 font-semibold text-ink">Stres Selisih & Rumus Excel</p>
                </div>
              </div>
              <div className="rule-double mt-3 flex justify-between pt-2.5 font-bold text-ink">
                <span>Status Akhir:</span>
                <span className="text-debit">100% Seimbang & Terkendali</span>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-rule bg-paper">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-6 px-4 py-12 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/akunio-logo-mark.svg" alt="Logo Akunio" className="size-7" />
            <div>
              <p className="font-display text-base font-bold text-ink">Akunio</p>
              <p className="text-xs text-ink-soft">
                Platform Akuntansi Cerdas Berstandar SAK EMKM untuk UKM Indonesia.
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                oleh <span className="font-semibold text-ink">Samara Digital Technology</span> ·{" "}
                <a
                  href="mailto:luckyanggara@aiapp.today"
                  className="font-medium text-terra hover:underline"
                >
                  luckyanggara@aiapp.today
                </a>
              </p>
            </div>
          </div>

          <nav aria-label="Footer" className="flex items-center gap-6 text-xs font-medium text-ink-soft">
            <a href="#video-demo" className="hover:text-ink">Video Demo</a>
            <a href="#simulator" className="hover:text-ink">Simulator</a>
            <a href="#fitur" className="hover:text-ink">Fitur</a>
            <a href="#faq" className="hover:text-ink">FAQ</a>
            <Link href="/daftar" className="text-terra hover:underline">Daftar Akun</Link>
          </nav>
        </div>

        <div className="mx-auto flex w-full max-w-6xl flex-col justify-between gap-2 border-t border-rule/50 px-4 py-6 text-xs text-ink-soft sm:flex-row sm:px-6 lg:px-8">
          <p>© 2026 Samara Digital Technology. Hak Cipta Dilindungi Undang-Undang.</p>
          <p>Mendukung standar akuntansi SAK EMKM IAI.</p>
        </div>
      </footer>
    </main>
  );
}
