import { Money } from "@/core/money/money";
import type { AiPrefs } from "@/lib/ai-prefs";
import { MUTATING_TOOLS, SAFE_TOOLS } from "@/server/ai/nara-tools";

export function maxMinorFromArgs(toolName: string, args: Record<string, unknown>): bigint | null {
  try {
    if (toolName === "post_journal" || toolName === "create_journal_draft") {
      const lines = Array.isArray(args.lines) ? (args.lines as Array<Record<string, unknown>>) : [];
      let total = 0n;
      for (const l of lines) {
        const raw = l.debit ?? l.debitText;
        if (typeof raw === "string" && raw.trim() !== "" && raw.trim() !== "0") {
          total += Money.parseIdr(raw).minor;
        }
      }
      return total;
    }
    return null;
  } catch {
    return null;
  }
}

export function shouldRequireApproval(
  toolName: string,
  args: Record<string, unknown>,
  prefs: AiPrefs,
  opts: { hitlPolicy: "smart" | "strict" | "autonomous"; allowAllForSession: boolean },
): boolean {
  if (prefs.approvalThresholdMinor) {
    try {
      const limit = BigInt(prefs.approvalThresholdMinor);
      const amount = maxMinorFromArgs(toolName, args);
      if (amount === null || amount > limit) return true;
    } catch { return true; }
  }
  if (SAFE_TOOLS.has(toolName)) return false;
  if (!MUTATING_TOOLS.has(toolName)) return true;
  if (opts.hitlPolicy === "autonomous") return false;
  return !opts.allowAllForSession;
}
