import { FunctionTool } from "@google/adk";
import { z } from "zod";
import { DEFAULT_AI_PREFS, type AiPrefs } from "@/lib/ai-prefs";
import { TOOL_REGISTRY } from "@/server/ai/nara-tools";
import { shouldRequireApproval } from "@/server/ai/controls/approval";

/** Gate HITL + preferensi yang membungkus satu FunctionTool org-scoped. */
export interface AdkToolGate {
  prefs: AiPrefs;
  hitlPolicy: "smart" | "strict" | "autonomous";
  allowAllForSession: boolean;
}

export type AdkPrefsProvider = () => AdkToolGate;

const DEFAULT_PROVIDER: AdkPrefsProvider = () => ({
  prefs: DEFAULT_AI_PREFS,
  hitlPolicy: "smart",
  allowAllForSession: false,
});

export type AdkToolResult =
  | { status: "SUCCESS"; data: unknown }
  | { status: "AWAITING_CONFIRMATION"; message: string }
  | { status: "REJECTED"; message: string }
  | { status: "ERROR"; message: string };

/** BigInt → string rekursif (salinan lokal dari deBigInt nara-tools — modul itu private). */
function sanitizeBigInt(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(sanitizeBigInt);
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeBigInt(v);
    }
    return out;
  }
  return value;
}

function summarizeArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args).slice(0, 500);
  } catch {
    return "(argumen tidak dapat ditampilkan)";
  }
}

/**
 * Bungkus satu entri TOOL_REGISTRY menjadi ADK FunctionTool yang org-scoped.
 *
 * Handler existing SUDAH memanggil withOrg(orgId, …) di dalamnya
 * (mis. journal.tools.ts: search_journals/post_journal) — JANGAN double-wrap
 * di sini, cukup panggil handler langsung.
 */
export function buildFunctionTool(
  orgId: string,
  actorEmail: string,
  toolName: string,
  prefsProvider: AdkPrefsProvider = DEFAULT_PROVIDER,
) {
  const entry = TOOL_REGISTRY[toolName];
  if (!entry) {
    throw new Error(`Tool ${toolName} tidak dikenali di TOOL_REGISTRY.`);
  }
  return new FunctionTool({
    name: entry.def.name,
    description: entry.def.description,
    // jembatan sementara — skema JSON existing; TODO fase-2: skema zod eksplisit per tool
    parameters: z.object({}).catchall(z.unknown()),
    execute: async (args, toolContext): Promise<AdkToolResult> => {
      const argRecord: Record<string, unknown> = { ...args };
      const gate = prefsProvider();
      const needsApproval = shouldRequireApproval(toolName, argRecord, gate.prefs, {
        hitlPolicy: gate.hitlPolicy,
        allowAllForSession: gate.allowAllForSession,
      });
      if (needsApproval) {
        const confirmation = toolContext?.toolConfirmation;
        if (!confirmation) {
          toolContext?.requestConfirmation({
            hint: `Tool ${toolName} memerlukan persetujuan: ${summarizeArgs(argRecord)}`,
            payload: argRecord,
          });
          return {
            status: "AWAITING_CONFIRMATION",
            message: `Menunggu persetujuan manusia untuk ${toolName}.`,
          };
        }
        if (confirmation.confirmed === false) {
          return {
            status: "REJECTED",
            message: `Aksi ${toolName} ditolak pengguna; tidak dieksekusi.`,
          };
        }
      }
      try {
        const out = await entry.handler(orgId, actorEmail, argRecord);
        if (!out.success) {
          return { status: "ERROR", message: out.error ?? `Tool ${toolName} gagal.` };
        }
        return { status: "SUCCESS", data: sanitizeBigInt(out.data) };
      } catch (e) {
        return {
          status: "ERROR",
          message: e instanceof Error ? e.message : `Tool ${toolName} gagal.`,
        };
      }
    },
  });
}
