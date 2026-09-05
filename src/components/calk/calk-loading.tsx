import * as React from "react";
import { Sparkles, FileText, CheckCircle2, ShieldCheck } from "lucide-react";

export function CalkLoadingState({
  title = "Akunio sedang menganalisis transaksi & menyusun CALK SAK EMKM...",
}: {
  title?: string;
}) {
  return (
    <div className="w-full space-y-6 animate-in fade-in duration-300">
      {/* 1. Header Back & Judul */}
      <div className="space-y-3 pb-4 border-b border-rule/70">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-ink-soft">
          <span className="size-1.5 rounded-full bg-terra" />
          <span>Laporan Keuangan Resmi SAK EMKM</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink">
            Catatan Atas Laporan Keuangan (CALK)
          </h1>
          <span className="text-xs font-medium text-ink-soft">
            Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah
          </span>
        </div>
      </div>

      {/* 2. Tata Letak 2 Kolom */}
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Kolom Kiri: Kartu Lembar Dokumen dengan Loader Akunio Terbuka & Jelas */}
        <div className="w-full lg:flex-1 min-w-0">
          <div className="rounded-2xl sm:rounded-3xl border-2 border-rule/90 bg-paper p-6 sm:p-10 md:p-12 shadow-sm relative overflow-hidden">
            {/* Ambient accent strip di tepi atas */}
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-terra/60 via-amber-600/40 to-terra/70 animate-pulse" />

            {/* Kotak Status Akunio di Atas Dokumen — Sangat Jelas & Elegan */}
            <div className="rounded-2xl border border-terra/30 bg-canvas/60 p-6 sm:p-8 text-center space-y-5">
              {/* Logo / Badge Akunio */}
              <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-paper border border-terra/40 shadow-xs text-terra mx-auto">
                <Sparkles className="size-7 animate-pulse" />
              </div>

              <div className="space-y-2 max-w-lg mx-auto">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-terra/10 border border-terra/25 text-[11px] font-bold uppercase tracking-wider text-terra">
                  <span className="size-1.5 rounded-full bg-terra animate-ping" />
                  <span>Mesin Audit Akunio Aktif</span>
                </div>
                <h2 className="font-display text-lg sm:text-xl font-bold text-ink">
                  {title}
                </h2>
                <p className="text-xs sm:text-sm text-ink-soft leading-relaxed">
                  Akunio mengevaluasi seluruh transaksi buku besar, rekonsiliasi kas, posisi aset tetap, serta kewajiban perpajakan PP 55/2022 agar narasinya memenuhi Bab 6 &amp; Bab 15 SAK EMKM.
                </p>
              </div>

              {/* Tiga Pilar Analisis Akunio */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-left">
                <div className="p-3.5 rounded-xl border border-rule/80 bg-paper space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-ink">
                    <CheckCircle2 className="size-3.5 text-debit shrink-0" />
                    <span>Bab 1–3 Dasar SAK</span>
                  </div>
                  <p className="text-[11px] text-ink-soft leading-snug">
                    Akunio merumuskan profil usaha, kelangsungan usaha, dan basis akrual biaya historis.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-rule/80 bg-paper space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-ink">
                    <CheckCircle2 className="size-3.5 text-debit shrink-0" />
                    <span>Bab 4 Rincian Akun</span>
                  </div>
                  <p className="text-[11px] text-ink-soft leading-snug">
                    Akunio mengurai posisi kas &amp; bank, nilai buku aset tetap, serta kewajiban lancar.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-rule/80 bg-paper space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-ink">
                    <ShieldCheck className="size-3.5 text-terra shrink-0" />
                    <span>Bab 15 Pajak PP 55</span>
                  </div>
                  <p className="text-[11px] text-ink-soft leading-snug">
                    Akunio memverifikasi fasilitas omzet Rp 500 jt, beban 0,5%, dan nomor bukti setor NTPN.
                  </p>
                </div>
              </div>

              {/* Progress bar halus Akunio */}
              <div className="pt-2 max-w-xs mx-auto space-y-2">
                <div className="h-1.5 w-full bg-rule/70 rounded-full overflow-hidden">
                  <div className="h-full bg-terra rounded-full w-2/3 animate-[pulse_1.5s_ease-in-out_infinite]" />
                </div>
                <p className="text-[11px] font-medium text-ink-soft/90">
                  Menyusun draf resmi siap unduh (.DOCX)
                </p>
              </div>
            </div>

            {/* Preview Kerangka Lembar Dokumen yang Rapi di Bawah */}
            <div className="mt-8 pt-8 border-t-2 border-rule/70 space-y-6 opacity-40 select-none pointer-events-none">
              <div className="border-b-4 border-double border-ink/40 pb-4 text-center space-y-1">
                <div className="h-4 w-40 mx-auto bg-rule/80 rounded" />
                <div className="h-6 w-64 mx-auto bg-rule rounded" />
                <div className="h-3.5 w-48 mx-auto bg-rule/70 rounded" />
              </div>
              <div className="space-y-3">
                <div className="h-4 w-48 bg-rule/80 rounded" />
                <div className="h-12 w-full bg-canvas/50 rounded-xl" />
                <div className="h-4 w-52 bg-rule/80 rounded" />
                <div className="h-16 w-full bg-canvas/50 rounded-xl" />
              </div>
            </div>
          </div>
        </div>

        {/* Kolom Kanan: Sidebar Aksi dengan Placeholder Elegan */}
        <div className="w-full lg:w-80 shrink-0 space-y-5">
          <div className="rounded-2xl border-2 border-rule bg-paper p-5 shadow-xs space-y-4">
            <div className="space-y-1">
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-ink">
                Aksi &amp; Dokumen CALK
              </h3>
              <p className="text-xs text-ink-soft">
                Tersedia sesaat lagi setelah Akunio selesai
              </p>
            </div>

            <div className="space-y-2.5 pt-2">
              <div className="w-full h-10 px-4 rounded-xl bg-blue-600/50 text-white flex items-center justify-center gap-2 text-xs font-bold select-none cursor-wait">
                <FileText className="size-4 text-white" />
                <span>Unduh Dokumen (.DOCX)</span>
              </div>
              <div className="w-full h-9 px-4 rounded-xl border border-rule bg-canvas/60 text-ink-soft flex items-center justify-center gap-2 text-xs font-semibold select-none cursor-wait">
                <Sparkles className="size-3.5 text-terra" />
                <span>Perbarui Narasi Akunio</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}