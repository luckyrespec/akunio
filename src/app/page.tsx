import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActiveContext } from "@/server/auth/session";
import { LandingPage } from "@/components/landing/landing-page";

// Auth-gated: must render dynamically (session lives in cookies).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Akunio — Foto Nota Jadi Jurnal Seimbang | Pembukuan UKM",
  description:
    "Pembukuan double-entry untuk UKM: foto nota jadi draf jurnal seimbang, posting terkunci anti-utak-atik, laporan standar siap real-time.",
  openGraph: {
    title: "Akunio — Pembukuan beres sebelum sempat menumpuk",
    description:
      "Foto nota jadi jurnal seimbang. Posting terkunci. Laporan standar siap kapan pun.",
    type: "website",
    locale: "id_ID",
  },
};

export default async function Home() {
  const ctx = await getActiveContext();
  if (ctx) redirect("/dasbor");
  return <LandingPage />;
}
