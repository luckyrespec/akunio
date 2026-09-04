import { redirect } from "next/navigation";
import { getActiveContext } from "@/server/auth/session";

// Auth-gated: must render dynamically (session lives in cookies).
export const dynamic = "force-dynamic";

export default async function Home() {
  const ctx = await getActiveContext();
  redirect(ctx ? "/dasbor" : "/masuk");
}
