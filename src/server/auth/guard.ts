import { redirect } from "next/navigation";
import { getActiveContext, type AppContext, type Role } from "./session";

export async function requireContext(allowed?: Role[]): Promise<AppContext> {
  const ctx = await getActiveContext();
  if (!ctx) redirect("/masuk");
  if (allowed && !allowed.includes(ctx.role)) {
    throw new Error("FORBIDDEN_AKSES");
  }
  return ctx;
}
