export default function BukuPembantuLoading() {
  return (
    <div className="space-y-4" aria-label="Memuat buku pembantu">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-canvas" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl border border-rule bg-paper" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-xl border border-rule bg-paper" />
    </div>
  );
}
