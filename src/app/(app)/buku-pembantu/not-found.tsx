import Link from "next/link";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BukuPembantuNotFound() {
  return (
    <div className="rounded-2xl border border-rule bg-paper p-8 text-center shadow-xs">
      <FileText className="size-8 mx-auto mb-2 text-ink-soft/40" />
      <p className="font-display text-base font-medium text-ink">Data tidak ditemukan</p>
      <p className="mt-1 text-xs text-ink-soft">
        Tautan mungkin kedaluwarsa atau datanya telah dihapus.
      </p>
      <Link href="/buku-pembantu" className="mt-4 inline-block">
        <Button size="sm" variant="outline" className="border-rule bg-paper text-xs">
          Kembali ke Buku Pembantu
        </Button>
      </Link>
    </div>
  );
}
