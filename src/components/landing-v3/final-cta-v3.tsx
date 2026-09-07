import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FinalCtaV3() {
  return (
    <section aria-label="Ajakan Penutup" className="py-20 bg-canvas">
      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-ink px-6 py-16 text-center text-paper sm:px-12 sm:py-24 shadow-sm">

          {/* Warm terra glow — satu-satunya aksen di atas tinta */}
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-32 left-1/2 h-80 w-[700px] -translate-x-1/2 rounded-full bg-terra opacity-25 blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-4xl space-y-6">
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-paper leading-tight text-balance">
              Besok Pagi, Pembukuan Sudah Rapi.
            </h2>

            <p className="mx-auto max-w-2xl text-sm sm:text-base text-paper/80 leading-relaxed font-normal">
              Daftar, masukkan nama usaha, foto nota pertama — beres dalam 2 menit.
            </p>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                asChild
                size="lg"
                className="w-full sm:w-auto bg-terra hover:bg-terra/90 text-white font-bold h-14 px-9 text-base shadow-sm"
              >
                <Link href="/daftar" className="flex items-center justify-center gap-2.5">
                  <span>Mulai Pembukuan Anda Sekarang</span>
                  <ArrowRight className="size-5" />
                </Link>
              </Button>

              <Button
                asChild
                variant="outline"
                size="lg"
                className="w-full sm:w-auto border-paper/30 bg-transparent text-paper hover:bg-paper/10 h-14 px-8 text-base font-bold"
              >
                <Link href="/masuk">Saya Sudah Punya Akun</Link>
              </Button>
            </div>

            <div className="pt-6 border-t border-paper/15 flex flex-wrap items-center justify-center gap-y-2.5 gap-x-8 text-xs font-medium text-paper/70">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-terra" /> Gratis memulai selamanya
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-terra" /> Tanpa kartu kredit
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-terra" /> Standar resmi SAK EMKM IAI
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-terra" /> Catatan aman &amp; terlindungi permanen
              </span>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
