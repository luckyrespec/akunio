import { and, eq } from "drizzle-orm";
import { aiFindings, aiProposals } from "../schema/doctor";
import type { Queryable } from "./queryable";
export async function createFinding(q: Queryable, orgId: string, draft: { type: string; severity: "HIGH"|"MEDIUM"|"LOW"; evidence: Record<string, unknown> }) {
  const [row] = await q.insert(aiFindings).values({ orgId, type: draft.type, severity: draft.severity, evidence: draft.evidence as never }).returning();
  return row;
}
export async function listFindings(q: Queryable, orgId: string, status?: string) {
  if (status) return q.select().from(aiFindings).where(and(eq(aiFindings.orgId, orgId), eq(aiFindings.status, status as never)));
  return q.select().from(aiFindings).where(eq(aiFindings.orgId, orgId));
}
export async function getFinding(q: Queryable, orgId: string, id: string) {
  const [row] = await q.select().from(aiFindings).where(and(eq(aiFindings.orgId, orgId), eq(aiFindings.id, id))).limit(1);
  return row ?? null;
}
export async function resolveFinding(q: Queryable, orgId: string, id: string) {
  const [row] = await q.update(aiFindings).set({ status: "resolved" }).where(and(eq(aiFindings.orgId, orgId), eq(aiFindings.id, id))).returning();
  if (!row) throw new Error("FINDING_NOT_FOUND");
  return row;
}
export async function dismissFinding(q: Queryable, orgId: string, id: string) {
  const [row] = await q.update(aiFindings).set({ status: "dismissed" }).where(and(eq(aiFindings.orgId, orgId), eq(aiFindings.id, id))).returning();
  if (!row) throw new Error("FINDING_NOT_FOUND");
  return row;
}
export async function createProposal(q: Queryable, orgId: string, findingId: string, draft: unknown, ifrsCitation?: string) {
  const [row] = await q.insert(aiProposals).values({ orgId, findingId, draft: draft as never, ifrsCitation }).returning();
  return row;
}
