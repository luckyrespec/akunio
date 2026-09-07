import Link from "next/link";
import { AkunioLogoLockupV3 } from "@/components/brand/akunio-logo-v3";

export function FooterV3() {
  return (
    <footer className="border-t border-rule bg-paper py-12 text-ink">
      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border-b border-rule pb-8">
          <AkunioLogoLockupV3 />
          <p className="text-xs text-ink-soft max-w-md leading-relaxed">
            Akunio adalah platform pembukuan cerdas untuk UMKM Indonesia. Menghadirkan pembukuan berstandar resmi yang otomatis, tanpa selisih, dan siap untuk pengajuan bank, kemitraan investor, serta pelaporan pajak.
          </p>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <Link href="/masuk" className="text-ink-soft hover:text-ink transition-colors">
              Masuk
            </Link>
            <Link href="/daftar" className="text-terra hover:underline">
              Daftar Akun Baru
            </Link>
          </div>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-ink-soft">
          <p>
            &copy; {new Date().getFullYear()} Akunio. Hak Cipta Dilindungi Undang-Undang. SAK EMKM Terakreditasi.
          </p>
          <p className="font-mono text-[11px]">
            Debit = Kredit, Selalu.
          </p>
        </div>
      </div>
    </footer>
  );
}
