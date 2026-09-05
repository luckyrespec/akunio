import { Suspense } from "react";
import { FakturSideNav } from "./_components/faktur-side-nav";

export default function FakturLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-[calc(100vh-3.5rem)] w-full flex-col bg-canvas lg:flex-row">
      <Suspense>
        <FakturSideNav />
      </Suspense>
      <main className="w-full min-w-0 flex-1 p-5 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
