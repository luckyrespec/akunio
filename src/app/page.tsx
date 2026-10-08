import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActiveContext } from "@/server/auth/session";
import { LandingPageV4 } from "@/components/landing/v4/landing-page-v4";

// Auth-gated: must render dynamically (session lives in cookies).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Akunio — Tidak Perlu Jago Akuntansi, Biarkan AI yang Mencatat",
  description:
    "Akunio mengubah foto nota dan chat santai menjadi jurnal berpasangan seimbang (Debit = Kredit) serta laporan keuangan siap pakai untuk UKM. Fokus kembangkan usaha Anda.",
  metadataBase: new URL("https://www.aiapp.today"),
  alternates: { canonical: "/" },
  openGraph: {
    title: "Akunio — Tidak Perlu Jago Akuntansi, Biarkan AI yang Mencatat",
    description:
      "Akunio mengubah foto nota dan chat santai menjadi jurnal berpasangan seimbang (Debit = Kredit) serta laporan keuangan siap pakai untuk UKM. Fokus kembangkan usaha Anda.",
    url: "/",
    locale: "id_ID",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default async function Home() {
  const ctx = await getActiveContext();
  if (ctx) redirect("/dashboard");
  return <LandingPageV4 />;
}
