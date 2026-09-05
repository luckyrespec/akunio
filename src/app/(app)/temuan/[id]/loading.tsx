import { Skeleton } from "@/components/ui/skeleton";

export default function TemuanDetailLoading() {
  return (
    <section className="space-y-6" aria-busy="true" aria-label="Memuat detail temuan">
      <Skeleton className="h-4 w-44" />
      <div className="border-b border-rule/60 pb-5 mb-6 space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-56 w-full rounded-2xl" />
        </div>
      </div>
    </section>
  );
}
