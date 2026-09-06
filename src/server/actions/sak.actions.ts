"use server";

import { requireContext } from "@/server/auth/guard";
import {
  getSakChapterByBab,
  type SakChapter,
} from "@/server/db/repos/sak-docs.repo";

export async function getSakChapterForSheetAction(
  bab: number
): Promise<{ ok: true; data: SakChapter | null } | { ok: false; error: string }> {
  try {
    await requireContext();
    if (!Number.isInteger(bab) || bab < 1 || bab > 18) {
      return { ok: false as const, error: "Nomor bab tidak valid." };
    }
    const chapter = await getSakChapterByBab(bab);
    return { ok: true as const, data: chapter };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Gagal memuat bab.",
    };
  }
}
