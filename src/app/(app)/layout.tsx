import { requireOnboardedContext } from "@/server/auth/guard";
import { AppShell } from "@/components/app-shell";

// Auth-gated shell: must render dynamically (session lives in cookies).
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireOnboardedContext();
  return <AppShell>{children}</AppShell>;
}
