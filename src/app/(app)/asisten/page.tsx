import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listThreads } from "@/server/db/repos/chat.repo";
import AsistenClient from "./asisten-client";

export default async function AsistenPage() {
  const ctx = await requireContext();
  const threads = await listThreads(db, ctx.orgId);
  return <AsistenClient initialThreads={threads} />;
}
