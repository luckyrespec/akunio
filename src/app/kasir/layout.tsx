import type { ReactNode } from "react";
import { requireOnboardedContext } from "@/server/auth/guard";

// Kasir berjalan di layout full-screen sendiri (tanpa sidebar/topbar AppShell).
// Gate auth sama dengan (app): sesi + onboarding selesai; render dinamis per request.
export const dynamic = "force-dynamic";

export default async function KasirLayout({ children }: { children: ReactNode }) {
  await requireOnboardedContext();
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas text-ink">
      <a
        href="#kasir-utama"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-ink focus:px-3.5 focus:py-2 focus:text-xs focus:font-semibold focus:text-paper"
      >
        Lewati ke konten utama
      </a>
      {children}
    </div>
  );
}
