import { appendAudit } from "@/server/db/repos/audit.repo";
import type { Queryable } from "@/server/db/repos/queryable";

export async function appendControlAudit(
  q: Queryable,
  input: { orgId: string; action: string; subjectType: string; subjectId: string; data: unknown },
): Promise<void> {
  await appendAudit(q, { ...input, actor: "adk-control" });
}
