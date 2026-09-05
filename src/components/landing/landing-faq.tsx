"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  {
    q: "Saya tidak bisa akuntansi. Bisa pakai?",
    a: "Bisa. Bagan akun standar SAK EMKM sudah disiapkan otomatis saat onboarding, dan AI mengusulkan pemetaan tiap transaksi ke akun yang paling cocok beserta alasannya. Tugas Anda hanya mereview draf lalu menyetujui — persis seperti mengecek struk belanja.",
  },
  {
    q: "Kalau salah catat bagaimana?",
    a: "Jurnal yang sudah diposting terkunci permanen agar laporan bisa dipercaya. Koreksi dilakukan lewat jurnal pembalik yang tertaut ke jurnal asalnya — jejaknya jelas, tidak ada angka yang diam-diam berubah.",
  },
  {
    q: "Apakah data usaha saya aman dan tidak tercampur?",
    a: "Aman. Setiap usaha punya ruang datanya sendiri yang terkunci di level database — data cabang A tidak akan pernah bocor ke cabang B. Setiap mutasi penting juga dicatat dalam rantai audit yang tidak bisa disisipi.",
  },
  {
    q: "Nota saya sudah menumpuk berminggu-minggu. Mulai dari mana?",
    a: "Mulai dari hari ini: foto nota baru atau ketik transaksi harian. Tumpukan lama bisa dicicil lewat unggahan dokumen dan chat AI satu per satu — tidak perlu lembur semalam suntuk.",
  },
  {
    q: "Saya punya lebih dari satu usaha. Bisa dipisah?",
    a: "Bisa. Setiap usaha punya organisasi, bagan akun, dan periode bukunya sendiri-sendiri. Pindah antar usaha tinggal ganti konteks, tanpa akun baru.",
  },
  {
    q: "Laporannya bisa dibawa ke bank atau konsultan pajak?",
    a: "Bisa. Neraca, laba rugi, perubahan ekuitas, dan arus kas disusun mengikuti standar sehingga layak dibawa ke bank untuk pengajuan modal atau ke konsultan untuk pendampingan pajak.",
  },
  {
    q: "Berapa biayanya, dan berapa lama sampai bisa dipakai?",
    a: "Gratis untuk memulai — cukup daftar dengan email, tanpa kartu kredit. Bagan akun standar dan 12 periode buku disiapkan otomatis saat onboarding, jadi transaksi pertama bisa Anda catat dalam hitungan menit.",
  },
];

export function LandingFaq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-rule rounded-xl border border-rule bg-paper">
      {ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              aria-controls={`faq-panel-${i}`}
              id={`faq-button-${i}`}
              className="focus-ring flex w-full items-center justify-between gap-4 rounded-lg px-5 py-4 text-left"
            >
              <span className="text-sm font-semibold text-ink">{item.q}</span>
              <ChevronDown
                className={cn("size-4 shrink-0 text-ink-soft transition-transform duration-200", isOpen && "rotate-180")}
              />
            </button>
            <div className={cn("grid transition-all duration-200", isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
              <div
                id={`faq-panel-${i}`}
                role="region"
                aria-labelledby={`faq-button-${i}`}
                aria-hidden={!isOpen}
                inert={!isOpen}
                className="overflow-hidden"
              >
                <p className="px-5 pb-5 text-sm leading-relaxed text-ink-soft">{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
