"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function FaqV3() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const FAQS = [
    {
      q: "Saya sama sekali tidak paham akuntansi dan debit-kredit, apakah saya bisa pakai Akunio?",
      a: "Sangat bisa. Anda tidak perlu pusing memikirkan teori debit dan kredit. Cukup foto kuitansi atau ketik transaksi seperti mengirim pesan WhatsApp (contoh: 'Beli tepung dan telur 450rb tunai'). Akunio yang akan memetakan ke bagan akun yang tepat secara otomatis. Anda cukup memeriksa dan menyetujui.",
    },
    {
      q: "Apakah laporan Akunio benar-benar diakui bank saat pengajuan KUR atau pinjaman modal?",
      a: "Ya. Akunio menyusun laporan keuangan mengikuti standar resmi SAK EMKM (Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah) yang ditetapkan Ikatan Akuntan Indonesia. Analis kredit bank BUMN maupun swasta memerlukan Neraca dan Laba Rugi yang seimbang dan memiliki jejak audit, persis seperti dokumen cetak yang dihasilkan Akunio.",
    },
    {
      q: "Bagaimana jika saya salah input atau salah memfoto nota?",
      a: "Anda memegang kendali penuh. Setiap transaksi yang dianalisis AI akan disajikan sebagai 'Draf' terlebih dahulu agar bisa Anda koreksi sebelum diposting. Jika sudah diposting dan ada perubahan di kemudian hari, Akunio menggunakan sistem Jurnal Pembalik (reversal) standar akuntansi sehingga koreksi tercatat transparan tanpa merusak integritas buku besar.",
    },
    {
      q: "Apakah data keuangan toko dan omzet saya aman dan rahasia?",
      a: "Sangat aman. Akunio menggunakan enkripsi standar industri perbankan dan arsitektur data terisolasi. Tidak ada pihak luar yang dapat melihat nota, omzet, laba kotor, maupun data rahasia supplier Anda.",
    },
    {
      q: "Berapa lama waktu yang dibutuhkan untuk mulai mencatat transaksi pertama?",
      a: "Kurang dari 2 menit. Cukup daftar akun, masukkan nama dan sektor usaha Anda (misal: Toko Ritel, Kafe, Bengkel, atau Konveksi), dan sistem otomatis mengaktifkan bagan akun standar yang cocok untuk bisnis Anda. Anda bisa langsung memfoto nota pertama detik itu juga.",
    },
  ];

  return (
    <section id="faq" className="py-20 bg-paper border-b border-rule">
      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="max-w-3xl">
          <h2 className="font-display mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-ink leading-tight text-balance">
            Masih Ragu? Wajar.
          </h2>
          <p className="mt-2 text-sm text-ink-soft leading-relaxed max-w-2xl">
            Yang paling sering ditanyakan sebelum mulai.
          </p>
        </div>

        {/* Accordion FAQ */}
        <div className="mt-10 max-w-4xl divide-y divide-rule border-y border-rule">
          {FAQS.map((faq, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div key={faq.q} className="py-5">
                <button
                  type="button"
                  onClick={() => setOpenIdx(isOpen ? null : idx)}
                  className="flex w-full items-center justify-between text-left gap-4 group"
                >
                  <span className="font-display text-lg sm:text-xl font-bold text-ink group-hover:text-terra transition-colors">
                    {faq.q}
                  </span>
                  <span className={`grid size-8 shrink-0 place-items-center rounded-lg border border-rule bg-canvas transition-transform duration-200 ${
                    isOpen ? "rotate-180 bg-paper" : ""
                  }`}>
                    <ChevronDown className="size-4 text-ink-soft" />
                  </span>
                </button>

                {isOpen && (
                  <div className="mt-3 pr-12 text-sm text-ink-soft leading-relaxed animate-in fade-in-50 duration-150">
                    <p>{faq.a}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
