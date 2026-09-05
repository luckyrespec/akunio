import Link from "next/link";
import { ArrowRight, Camera, FileCheck2, Lock, MessageSquareText, Scale } from "lucide-react";
import { AkunioLogoLockup } from "@/components/brand/akunio-logo";
import { LandingNav } from "./landing-nav";
import { LandingHero } from "./landing-hero";
import { LandingFaq } from "./landing-faq";
import { StickyCta } from "./sticky-cta";
import { LevelJourney, ProblemPileup, ProblemTamper, ProblemUnbalanced } from "./landing-art";

function Section({
  id,
  title,
  desc,
  children,
}: {
  id: string;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <h2 className="font-display max-w-[24ch] text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
          {title}
        </h2>
        <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-ink-soft sm:text-base">{desc}</p>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

function ProblemRow({
  art,
  title,
  body,
  flip = false,
}: {
  art: React.ReactNode;
  title: string;
  body: string;
  flip?: boolean;
}) {
  return (
    <div className="grid items-center gap-5 rounded-2xl border border-rule bg-paper p-5 shadow-xs sm:p-7 lg:grid-cols-2 lg:gap-10">
      <div className={flip ? "lg:order-2" : ""}>{art}</div>
      <div className={flip ? "lg:order-1" : ""}>
        <h3 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h3>
        <p className="mt-2.5 max-w-[52ch] text-sm leading-relaxed text-ink-soft">{body}</p>
      </div>
    </div>
  );
}

const SOLUTIONS = [
  {
    icon: Scale,
    title: "Seimbang dulu, baru posting",
    body: "Setiap draf diperiksa komputer sebelum bisa posting: total debit harus sama dengan total kredit. Selisih serupiah pun ditolak — kesalahan Januari tidak akan menghantui tutup tahun.",
    answers: "Menjawab: jurnal asal-asalan",
    demo: (
      <div className="rounded-xl border border-rule bg-paper p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-[11px] font-bold tracking-widest uppercase text-destructive">
            Ditolak
          </span>
          <span className="tnum text-xs font-medium text-ink-soft">Draf JE-2026-0144</span>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-semibold">Beban ATK</span>
            <span className="tnum">
              150.000 <span className="ml-1 text-xs font-bold text-debit">Debit</span>
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-semibold">Kas</span>
            <span className="tnum">
              100.000 <span className="ml-1 text-xs font-bold text-credit">Kredit</span>
            </span>
          </div>
        </div>
        <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
          Selisih Rp50.000 — tidak bisa posting.
        </p>
      </div>
    ),
  },
  {
    icon: MessageSquareText,
    title: "Cerita, AI yang mencatat",
    body: "Ketik “bensin 150rb” atau foto struk — Akunio mengekstrak vendor, tanggal, dan pajak, lalu mengusulkan pasangan akun yang benar. Draf seimbang muncul dalam hitungan detik, lengkap dengan alasannya.",
    answers: "Menjawab: nota menumpuk",
    demo: (
      <div className="space-y-2.5">
        <div className="flex justify-end">
          <p className="max-w-[85%] rounded-2xl rounded-br-md bg-terra px-4 py-2.5 text-sm text-white">
            Beli bensin 150rb, bayar tunai
          </p>
        </div>
        <div className="flex justify-start">
          <p className="max-w-[88%] rounded-2xl rounded-bl-md border border-rule bg-paper px-4 py-2.5 text-sm text-ink">
            Draf seimbang siap. Cek sebelum posting ya.
          </p>
        </div>
        <div className="rounded-xl border border-rule bg-paper p-4 shadow-xs">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="font-semibold">Beban Kendaraan</span>
            <span className="tnum">
              150.000 <span className="ml-1 text-xs font-bold text-debit">Debit</span>
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-4 text-sm">
            <span className="font-semibold">Kas</span>
            <span className="tnum">
              150.000 <span className="ml-1 text-xs font-bold text-credit">Kredit</span>
            </span>
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: Lock,
    title: "Terkunci, lalu siap ke bank",
    body: "Begitu diposting, jurnal dikunci trigger database dan dirantai hash audit. Tidak ada ubah diam-diam — dan dari jurnal yang sama tersusun 4 laporan standar, siap dibawa ke bank.",
    answers: "Menjawab: angka diubah + laporan telat",
    demo: (
      <div className="rounded-xl border border-rule bg-paper p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="rounded-md bg-debit/10 px-2 py-0.5 text-[11px] font-bold tracking-widest uppercase text-debit">
            Posted
          </span>
          <span className="tnum text-xs font-medium text-ink-soft">JE-2026-0143</span>
        </div>
        <p className="mt-3 font-mono text-xs break-all text-ink-soft">
          rantai 9f2c…a41b ← 77d0…c9e2 ← 3b18…f0a7
        </p>
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          Coba ubah satu angka — seluruh rantai di bawahnya rusak.
        </p>
        <div className="mt-3 space-y-1.5 border-t border-rule pt-3 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-ink-soft">Pendapatan</span>
            <span className="tnum font-semibold">Rp48.200.000</span>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-ink-soft">Beban</span>
            <span className="tnum font-semibold">Rp31.750.000</span>
          </div>
          <div className="rule-double flex items-baseline justify-between gap-4 pt-1 pb-0.5">
            <span className="font-bold">Laba bersih</span>
            <span className="tnum font-bold">Rp16.450.000</span>
          </div>
        </div>
      </div>
    ),
  },
];

const STEPS = [
  {
    n: "1",
    title: "Catat dengan cara Anda",
    body: "Foto nota, unggah PDF faktur, ketik di chat, atau isi jurnal manual. Bukti tersimpan rapi sebagai arsip dokumen.",
  },
  {
    n: "2",
    title: "Review draf, bukan mengetik",
    body: "AI menyusun pasangan debit-kredit beserta alasannya. Anda memeriksa dan menyetujui — manusia selalu memegang keputusan.",
  },
  {
    n: "3",
    title: "Posting terkunci, laporan hidup",
    body: "Satu klik posting mengunci jurnal dan menghidupkan seluruh laporan. Besok pagi, angka kemarin sudah final.",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <LandingNav />
      <main className="pb-24 md:pb-0">
        <LandingHero />

        <Section
          id="masalah"
          title="Tiga hal yang menahan usaha Anda naik kelas"
          desc="Bukan modal, bukan pasar — melainkan pembukuan yang tidak pernah beres. Akunio dibangun untuk membunuh ketiganya."
        >
          <div className="space-y-4">
            <ProblemRow
              art={<ProblemUnbalanced />}
              title="Jurnal asal-asalan, laporan ngawur"
              body="Salah menaruh debit dan kredit membuat saldo meleset — kesalahan Januari baru ketahuan saat tutup tahun. Akunio menolak memposting jurnal yang tidak seimbang, titik."
            />
            <ProblemRow
              flip
              art={<ProblemPileup />}
              title="Nota menumpuk, keputusan telat"
              body="Kuitansi mengantre berhari-hari sebelum dicatat. Sementara itu Anda menebak-nebak: bulan ini untung atau buntung? Foto dan chat memangkas antrean menjadi hitungan detik."
            />
            <ProblemRow
              art={<ProblemTamper />}
              title="Angka bisa diubah, kepercayaan runtuh"
              body="Spreadsheet bisa disunting tanpa jejak. Jurnal Akunio yang sudah diposting terkunci di database dan dirantai audit — bank dan mitra melihat angka yang bisa dipercaya."
            />
          </div>
        </Section>

        <Section
          id="solusi"
          title="Mesin pembukuan yang bekerja untuk Anda"
          desc="Tiga masalah di atas, tiga mekanisme di bawah — berpasangan dan berurutan."
        >
          <div className="relative mt-8 lg:mt-12">
            <svg
              aria-hidden
              viewBox="0 0 600 40"
              preserveAspectRatio="none"
              className="absolute -top-10 right-0 left-0 hidden h-10 w-full lg:block"
            >
              <path
                d="M8 34 Q 160 34 300 12 T 592 34"
                fill="none"
                stroke="#a8562f"
                strokeWidth={4}
                strokeLinecap="round"
                strokeDasharray="2 12"
                vectorEffect="non-scaling-stroke"
                opacity={0.8}
              />
            </svg>
            <div className="grid gap-4 lg:grid-cols-3">
              {SOLUTIONS.map((s, i) => (
                <article
                  key={s.title}
                  className={`relative flex flex-col overflow-hidden rounded-2xl border border-rule bg-paper p-5 shadow-xs sm:p-6 ${
                    i === 1 ? "lg:-translate-y-6" : ""
                  }`}
                >
                  <span aria-hidden className="font-display absolute -top-2 right-3 text-8xl leading-none font-semibold text-ink/[0.07] select-none">
                    {i + 1}
                  </span>
                  <span className="grid size-11 place-items-center rounded-xl bg-terra/10">
                    <s.icon className="size-5 text-terra" strokeWidth={2} />
                  </span>
                  <h3 className="mt-4 text-lg font-bold tracking-tight">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.body}</p>
                  <div className="mt-5 border-t border-rule pt-5">{s.demo}</div>
                  <p className="mt-4 text-xs font-semibold text-ink-soft">{s.answers}</p>
                </article>
            ))}
            </div>
          </div>
        </Section>

        <Section
          id="cara-kerja"
          title="Dari nota ke laporan dalam tiga langkah"
          desc="Alur yang sama untuk warung, bengkel, dan konsultan — hanya angkanya yang berbeda."
        >
          <ol className="grid gap-4 lg:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="relative overflow-hidden rounded-2xl border border-rule bg-paper p-5 shadow-xs sm:p-6">
                <span aria-hidden className="font-display absolute -top-3 right-3 text-8xl leading-none font-semibold text-ink/[0.07] select-none">
                  {s.n}
                </span>
                <h3 className="text-lg font-bold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Link
              href="/daftar"
              className="focus-ring group inline-flex h-12 items-center gap-2 rounded-lg bg-ink px-6 text-sm font-semibold text-paper shadow-xs transition-all hover:bg-ink/80 active:translate-y-px"
            >
              Mulai pembukuan Anda
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <p className="flex items-center gap-1.5 text-sm text-ink-soft">
              <Camera className="size-4" /> Mulai dari nota di dompet Anda hari ini.
            </p>
          </div>
        </Section>

        <Section
          id="naik-kelas"
          title="Usaha naik kelas dimulai dari angka yang jujur"
          desc="Pembukuan rapi bukan tujuan — ia tiketnya. Dengan laporan standar yang bisa dipercaya, pintu modal, kemitraan, dan keputusan besar terbuka."
        >
          <LevelJourney />
          <div className="mt-6 grid gap-3 rounded-2xl bg-ink p-5 text-paper sm:p-7 lg:grid-cols-3">
            {[
              { icon: Scale, text: "Angka final setiap pagi — putuskan harga dan stok dengan data kemarin, bukan firasat." },
              { icon: FileCheck2, text: "Laporan standar siap dibawa ke bank saat peluang modal datang." },
              { icon: Lock, text: "Jejak audit utuh — tidur nyenyak, tidak ada angka misterius." },
            ].map((b) => (
              <div key={b.text} className="flex items-start gap-3">
                <b.icon className="mt-0.5 size-5 shrink-0 text-terra" strokeWidth={2} />
                <p className="text-sm leading-relaxed font-medium text-paper">{b.text}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section
          id="faq"
          title="Masih ragu? Wajar."
          desc="Pertanyaan yang paling sering ditanyakan pemilik usaha sebelum merapikan pembukuannya."
        >
          <div className="max-w-3xl">
            <LandingFaq />
          </div>
        </Section>

        <section aria-label="Ajakan terakhir" className="mx-auto w-full max-w-[1600px] px-4 pb-16 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-ink px-6 py-12 text-center text-paper sm:px-12 sm:py-16">
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -top-24 left-1/2 h-64 w-[560px] -translate-x-1/2 rounded-full bg-terra opacity-25 blur-3xl" />
            </div>
            <h2 className="font-display relative mx-auto max-w-[22ch] text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
              Besok pagi, pembukuan Anda sudah beres.
            </h2>
            <p className="relative mx-auto mt-3 max-w-[52ch] text-sm leading-relaxed text-paper/75">
              Daftar, sebutkan nama usaha, dan catat transaksi pertama — bagan akun standar sudah disiapkan untuk Anda.
            </p>
            <div className="relative mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/daftar"
                className="focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-terra px-7 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-110 active:translate-y-px"
              >
                Mulai pembukuan Anda
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/masuk"
                className="focus-ring inline-flex h-12 items-center justify-center rounded-lg border border-paper/30 px-7 text-sm font-semibold text-paper transition-colors hover:bg-paper/10"
              >
                Saya sudah punya akun
              </Link>
            </div>
            <p className="relative mt-4 text-xs font-medium text-paper/60">
              Gratis memulai · Tanpa kartu kredit
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-rule bg-paper">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <AkunioLogoLockup markClassName="size-7" showTagline={false} />
          <p className="text-xs leading-relaxed text-ink-soft">
            Akunio — pembukuan double-entry untuk UKM. Debit = Kredit, selalu.
          </p>
          <div className="flex gap-5 text-sm font-medium">
            <Link href="/masuk" className="focus-ring rounded-md px-1 py-1 text-ink-soft transition-colors hover:text-ink">Masuk</Link>
            <Link href="/daftar" className="focus-ring rounded-md px-1 py-1 text-ink-soft transition-colors hover:text-ink">Daftar</Link>
          </div>
        </div>
      </footer>

      <StickyCta />
    </div>
  );
}
