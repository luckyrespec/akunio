import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listThreads } from "@/server/db/repos/chat.repo";
import { organizations } from "@/server/db/schema/org";
import { eq } from "drizzle-orm";
import { withOrg } from "@/server/db/repos/with-org";
import { listMemories } from "@/server/db/repos/assistant-memory.repo";
import { parseAiPrefs } from "@/lib/ai-prefs";
import type { MemoryItemDTO } from "@/server/actions/settings.actions";
import AsistenClient from "./asisten-client";

export default async function AsistenPage() {
  const ctx = await requireContext();
  const threads = await listThreads(db, ctx.orgId);
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  const settings = (org?.settings ?? {}) as {
    aiHitlPolicy?: "smart" | "strict" | "autonomous";
    aiMemoryEnabled?: boolean;
  };
  const memories: MemoryItemDTO[] = await withOrg(ctx.orgId, (tx) => listMemories(tx, ctx.orgId)).then(
    (rows) =>
      rows.map((m) => ({
        id: m.id,
        kind: m.kind,
        content: m.content,
        source: m.source,
        updatedAt: m.updatedAt.toISOString(),
      })),
    () => [],
  );

  return (
    <AsistenClient
      initialThreads={threads}
      initialHitlPolicy={settings.aiHitlPolicy ?? "smart"}
      memoryEnabled={settings.aiMemoryEnabled !== false}
      initialMemories={memories}
      initialPrefs={parseAiPrefs(org?.settings)}
      canEdit={ctx.role !== "VIEWER"}
    />
  );
}
