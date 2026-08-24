import { requireContext } from "@/server/auth/guard";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireContext();
  return <AppShell>{children}</AppShell>;
}
