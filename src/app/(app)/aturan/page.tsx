import { requireContext } from "@/server/auth/guard";
import { getAllSakChapters } from "@/server/db/repos/sak-docs.repo";
import { AturanClient } from "./aturan-client";

export const metadata = {
  title: "Standar SAK EMKM 2024 — Akunio",
  description: "Buku panduan dan dokumentasi resmi Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah (SAK EMKM) edisi 2024.",
};

export default async function AturanPage({
  searchParams,
}: {
  searchParams?: Promise<{ bab?: string }>;
}) {
  await requireContext();
  const chapters = await getAllSakChapters();
  const params = searchParams ? await searchParams : {};
  const initialBab = params.bab ? parseInt(params.bab, 10) : 1;

  return <AturanClient chapters={chapters} initialBab={initialBab} />;
}
