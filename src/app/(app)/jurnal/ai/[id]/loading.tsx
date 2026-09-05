import { Skeleton } from "@/components/ui/skeleton";

export default function ReviewDraftLoading() {
  return (
    <section className="space-y-6" aria-busy="true" aria-label="Memuat draf jurnal">
      <Skeleton className="h-4 w-28" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-4">
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl sm:col-span-2" />
          </div>
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      </div>
    </section>
  );
}
