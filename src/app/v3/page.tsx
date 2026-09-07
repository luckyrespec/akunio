import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActiveContext } from "@/server/auth/session";
import { LandingPageV3 } from "@/components/landing-v3/landing-page-v3";

// Auth-gated: must render dynamically (session lives in cookies).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Akunio | Pembukuan Rapi Bikin Usaha Naik Kelas",
  description:
    "Ubah struk kusut jadi laporan keuangan standar SAK EMKM dalam hitungan detik. Siap kapan pun butuh ke bank, bermitra dengan investor, atau pelaporan pajak.",
  openGraph: {
    title: "Akunio: Pembukuan Tertib, Usaha Naik Kelas",
    description:
      "Foto nota jadi jurnal seimbang. Laporan Laba Rugi & Neraca resmi siap untuk bank, mitra investor, dan pajak.",
    type: "website",
    locale: "id_ID",
  },
};

export default async function LandingV3Preview() {
  const ctx = await getActiveContext();
  if (ctx) redirect("/dasbor");
  return <LandingPageV3 isLoggedIn={!!ctx} />;
}
