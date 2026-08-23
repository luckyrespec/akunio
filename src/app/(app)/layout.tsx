import { requireContext } from "@/server/auth/guard";
import { SidebarNav } from "@/components/sidebar-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireContext();
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl">
      <SidebarNav />
      <main className="flex-1 border-l border-rule bg-paper px-10 py-8">{children}</main>
    </div>
  );
}
