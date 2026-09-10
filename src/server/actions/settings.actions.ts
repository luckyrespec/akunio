"use server";

import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { organizations } from "@/server/db/schema/org";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { withOrg } from "@/server/db/repos/with-org";
import { type AiPrefs } from "@/lib/ai-prefs";
import { Money } from "@/core/money/money";
import {
  deleteMemory,
  listMemories,
  saveMemory,
  type AssistantMemory,
  type MemoryKind,
} from "@/server/db/repos/assistant-memory.repo";

export async function updateHitlPolicyAction(policy: "smart" | "strict" | "autonomous") {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
    const settings = ((org?.settings as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
    settings.aiHitlPolicy = policy;

    await db
      .update(organizations)
      .set({ settings })
      .where(eq(organizations.id, ctx.orgId));

    try {
      revalidatePath("/pengaturan");
      revalidatePath("/asisten");
    } catch {}
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal memperbarui kebijakan AI.";
    return { ok: false, error: msg };
  }
}

export interface MemoryItemDTO {
  id: string;
  kind: MemoryKind;
  content: string;
  source: "user" | "auto";
  updatedAt: string;
}

function toDTO(m: AssistantMemory): MemoryItemDTO {
  return {
    id: m.id,
    kind: m.kind,
    content: m.content,
    source: m.source,
    updatedAt: m.updatedAt.toISOString(),
  };
}

export async function updateMemoryEnabledAction(enabled: boolean) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
    const settings = ((org?.settings as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
    settings.aiMemoryEnabled = enabled;

    await db
      .update(organizations)
      .set({ settings })
      .where(eq(organizations.id, ctx.orgId));

    try {
      revalidatePath("/pengaturan");
    } catch {}
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal memperbarui ingatan AI.";
    return { ok: false, error: msg };
  }
}

export async function listMemoriesAction(): Promise<{ ok: true; memories: MemoryItemDTO[] } | { ok: false; error: string }> {
  try {
    const ctx = await requireContext();
    const mems = await withOrg(ctx.orgId, (tx) => listMemories(tx, ctx.orgId));
    return { ok: true, memories: mems.map(toDTO) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal memuat ingatan.";
    return { ok: false, error: msg };
  }
}

const MEMORY_KINDS: MemoryKind[] = ["PROFILE", "PREFERENCE", "FACT"];

export async function saveMemoryAction(input: { kind: MemoryKind; content: string }) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    if (!MEMORY_KINDS.includes(input.kind)) throw new Error("Jenis ingatan tidak valid.");
    const row = await withOrg(ctx.orgId, (tx) =>
      saveMemory(tx, ctx.orgId, { kind: input.kind, content: input.content, source: "user" }),
    );
    try {
      revalidatePath("/pengaturan");
    } catch {}
    return { ok: true, memory: toDTO(row) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal menyimpan ingatan.";
    return { ok: false, error: msg };
  }
}

export async function deleteMemoryAction(id: string) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const ok = await withOrg(ctx.orgId, (tx) => deleteMemory(tx, ctx.orgId, id));
    if (!ok) throw new Error("Ingatan tidak ditemukan.");
    try {
      revalidatePath("/pengaturan");
    } catch {}
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal menghapus ingatan.";
    return { ok: false, error: msg };
  }
}

export async function updateAiPrefsAction(patch: Partial<AiPrefs> & { approvalThresholdText?: string | null }) {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
    const settings = ((org?.settings as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;

    if (patch.defaultPreset === "fast" || patch.defaultPreset === "deep") {
      settings.aiDefaultPreset = patch.defaultPreset;
    }
    if (patch.answerLength === "ringkas" || patch.answerLength === "lengkap") {
      settings.aiAnswerLength = patch.answerLength;
    }
    if (typeof patch.followupEnabled === "boolean") settings.aiFollowupEnabled = patch.followupEnabled;
    if (typeof patch.postDirectly === "boolean") settings.aiPostDirectly = patch.postDirectly;
    if (typeof patch.citationsEnabled === "boolean") settings.aiCitationsEnabled = patch.citationsEnabled;
    if (typeof patch.autoTitleEnabled === "boolean") settings.aiAutoTitleEnabled = patch.autoTitleEnabled;
    if (patch.approvalThresholdText !== undefined) {
      const t = (patch.approvalThresholdText ?? "").trim();
      settings.aiApprovalThresholdMinor = t ? Money.parseIdr(t).minor.toString() : null;
    }

    await db
      .update(organizations)
      .set({ settings })
      .where(eq(organizations.id, ctx.orgId));

    try {
      revalidatePath("/pengaturan");
      revalidatePath("/asisten");
    } catch {}
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal memperbarui preferensi AI.";
    return { ok: false, error: msg };
  }
}
