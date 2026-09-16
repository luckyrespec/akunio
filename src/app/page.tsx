import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActiveContext } from "@/server/auth/session";
import { LandingPage } from "@/components/landing/landing-page";

// Auth-gated: must render dynamically (session lives in cookies).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Akunio | Pembukuan Double-Entry untuk UKM",
  description:
    "Foto nota atau ketik pengeluaran — Akunio menyusun draf jurnal yang seimbang. Debit selalu sama dengan kredit, laporan standar siap kapan pun dibutuhkan.",
  openGraph: {
    title: "Akunio: Pembukuan Beres Sebelum Sempat Menumpuk",
    description:
      "Foto nota jadi draf jurnal seimbang. Jurnal terkunci anti-utak-atik, laporan standar siap untuk bank dan pajak.",
    type: "website",
    locale: "id_ID",
  },
};

export default async function Home() {
  const ctx = await getActiveContext();
  if (ctx) redirect("/dashboard");
  return <LandingPage />;
}
