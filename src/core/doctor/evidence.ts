export function resolveEvidenceAmounts(evidence: unknown): {
  amountMinor: bigint;
  entryIds: string[];
  codes: string[];
} {
  if (evidence === null || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new Error("EVIDENCE_TIDAK_VALID");
  }
  const rec = evidence as Record<string, unknown>;
  const rawAmount = rec.amountMinor ?? rec.amount ?? rec.totalMinor ?? rec.curTot;
  let amountMinor: bigint;
  try {
    if (typeof rawAmount === "string") {
      const trimmed = rawAmount.trim();
      if (!/^-?\d+$/.test(trimmed)) throw new Error("bad amount");
      amountMinor = BigInt(trimmed);
    } else if (typeof rawAmount === "bigint") {
      amountMinor = rawAmount;
    } else if (typeof rawAmount === "number" && Number.isInteger(rawAmount)) {
      amountMinor = BigInt(rawAmount);
    } else {
      throw new Error("bad amount");
    }
  } catch {
    throw new Error("EVIDENCE_TIDAK_VALID");
  }
  const entryIds: string[] = [];
  const entryId = rec.entryId;
  if (typeof entryId === "string" && entryId.length > 0) entryIds.push(entryId);
  const codes: string[] = [];
  const code = rec.code;
  if (typeof code === "string" && code.length > 0) codes.push(code);
  return { amountMinor, entryIds, codes };
}
