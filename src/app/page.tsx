import { redirect } from "next/navigation";
import { getActiveContext } from "@/server/auth/session";

export default async function Home() {
  const ctx = await getActiveContext();
  redirect(ctx ? "/dasbor" : "/masuk");
}
