import { Badge } from "@/components/ui/badge";

export function AiStatusCard({
  state, quotaUsed, quotaLimit,
}: {
  state: "READY" | "OFFLINE" | "QUOTA";
  quotaUsed?: number;
  quotaLimit?: number;
}) {
  if (state === "QUOTA") {
    return (
      <div className="rounded-lg border border-rule bg-paper px-4 py-3 text-sm text-ink-soft">
        Kuota draft AI bulan ini habis ({quotaUsed}/{quotaLimit}). Entri manual tetap tersedia.
      </div>
    );
  }
  if (state === "OFFLINE") {
    return (
      <div className="rounded-lg border border-rule bg-paper px-4 py-3 text-sm text-ink-soft">
        Asisten sedang tidak tersedia — coba lagi sebentar.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-rule bg-paper px-4 py-3 text-sm text-ink-soft">
      <span>Asisten siap membantu menyusun draft jurnal.</span>
      <Badge variant="outline" className="ml-auto">
        {quotaUsed}/{quotaLimit} draft bulan ini
      </Badge>
    </div>
  );
}
