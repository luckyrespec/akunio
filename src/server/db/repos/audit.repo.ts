import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { auditLog } from "../schema/audit";
import type { Queryable } from "./queryable";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

interface ChainInput {
  prevHash: string | null;
  orgId: string;
  actor: string;
  action: string;
  subjectType: string;
  subjectId: string;
  data: unknown;
}

export function computeHash(i: ChainInput): string {
  const h = createHash("sha256");
  h.update(`${i.prevHash ?? ""}|${i.orgId}|${i.actor}|${i.action}|${i.subjectType}|${i.subjectId}|${stableStringify(i.data ?? null)}`);
  return h.digest("hex");
}

export interface AuditInput {
  orgId: string; actor: string; action: string;
  subjectType: string; subjectId: string; data?: unknown;
}

export async function appendAudit(q: Queryable, input: AuditInput): Promise<void> {
  await q.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.orgId}))`);
  const tips = await q.execute<{ hash: string }>(sql`
    SELECT a.hash FROM audit_log AS a
    WHERE a.org_id = ${input.orgId}
      AND NOT EXISTS (
        SELECT 1 FROM audit_log AS s
        WHERE s.org_id = ${input.orgId} AND s.prev_hash = a.hash
      )
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT 1
  `);
  const prevHash = tips.rows[0]?.hash ?? null;
  await q.insert(auditLog).values({
    orgId: input.orgId,
    actor: input.actor,
    action: input.action,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    data: (input.data ?? null) as never,
    prevHash,
    hash: computeHash({ ...input, data: input.data ?? null, prevHash }),
  });
}

interface AuditChainRow {
  actor: string;
  action: string;
  subject_type: string;
  subject_id: string;
  data: unknown;
  prevHash: string | null;
  hash: string;
}

// verifyChain runs with an unrestricted connection (admin) because it must read
// across the whole chain regardless of current_org scoping. Sequence is derived
// from prev_hash links, not created_at: records appended within one transaction
// share the same transaction_timestamp().
export async function verifyChain(
  poolLike: { query: (sqlText: string, values?: unknown[]) => Promise<{ rows: AuditChainRow[] }> },
  orgId: string,
): Promise<{ valid: boolean; brokenAtSeq: number | null }> {
  const r = await poolLike.query(
    `SELECT actor, action, subject_type, subject_id, data, prev_hash AS "prevHash", hash
     FROM audit_log WHERE org_id = $1`, [orgId],
  );
  const rows = r.rows;
  if (rows.length === 0) return { valid: true, brokenAtSeq: null };

  const byPrev = new Map<string | null, AuditChainRow[]>();
  for (const row of rows) {
    const key = row.prevHash ?? null;
    byPrev.set(key, [...(byPrev.get(key) ?? []), row]);
  }

  const genesis = byPrev.get(null) ?? [];
  if (genesis.length !== 1) return { valid: false, brokenAtSeq: 1 };

  let prev: string | null = null;
  let current: AuditChainRow | undefined = genesis[0];
  let seq = 0;
  const visited = new Set<AuditChainRow>();
  while (current) {
    if (visited.has(current)) return { valid: false, brokenAtSeq: seq + 1 };
    visited.add(current);
    seq += 1;
    const expected = computeHash({
      prevHash: prev, orgId, actor: current.actor, action: current.action,
      subjectType: current.subject_type, subjectId: current.subject_id, data: current.data,
    });
    if (expected !== current.hash) {
      return { valid: false, brokenAtSeq: seq };
    }
    const children: AuditChainRow[] = byPrev.get(current.hash) ?? [];
    if (children.length > 1) return { valid: false, brokenAtSeq: seq + 1 };
    prev = current.hash;
    current = children[0];
  }
  if (visited.size !== rows.length) return { valid: false, brokenAtSeq: seq + 1 };
  return { valid: true, brokenAtSeq: null };
}
