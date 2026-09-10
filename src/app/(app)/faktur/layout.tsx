import { Suspense } from "react";
import { FakturSideNav } from "./_components/faktur-side-nav";

export default function FakturLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-canvas lg:flex-row">
      <Suspense>
        <FakturSideNav />
      </Suspense>
      <main className="w-full min-w-0 flex-1 min-h-0 overflow-y-auto paper-scrollbar p-5 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
