/** Preferensi AI per organisasi (tersimpan di organizations.settings, tanpa migrasi). */

export interface AiPrefs {
  /** Model awal sesi baru. */
  defaultPreset: "fast" | "deep";
  /** Panjang jawaban. */
  answerLength: "ringkas" | "lengkap";
  /** Chip saran + daftar langkah lanjutan. */
  followupEnabled: boolean;
  /** Minta persetujuan bila nominal aksi melebihi ini (satuan minor, string). null = mati. */
  approvalThresholdMinor: string | null;
  /** true = "catat" langsung posting; false = selalu draft dulu. */
  postDirectly: boolean;
  /** Chip sitasi SAK/jurnal/dll. */
  citationsEnabled: boolean;
  /** Penamaan sesi otomatis oleh Gemini. */
  autoTitleEnabled: boolean;
}

export const DEFAULT_AI_PREFS: AiPrefs = {
  defaultPreset: "fast",
  answerLength: "ringkas",
  followupEnabled: true,
  approvalThresholdMinor: null,
  postDirectly: true,
  citationsEnabled: true,
  autoTitleEnabled: true,
};

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

export function parseAiPrefs(raw: unknown): AiPrefs {
  const s = (raw ?? {}) as Record<string, unknown>;
  const preset = s.aiDefaultPreset === "deep" ? "deep" : "fast";
  const length = s.aiAnswerLength === "lengkap" ? "lengkap" : "ringkas";
  const threshold =
    typeof s.aiApprovalThresholdMinor === "string" && /^\d+$/.test(s.aiApprovalThresholdMinor)
      ? s.aiApprovalThresholdMinor
      : null;
  return {
    defaultPreset: preset,
    answerLength: length,
    followupEnabled: asBool(s.aiFollowupEnabled, true),
    approvalThresholdMinor: threshold,
    postDirectly: asBool(s.aiPostDirectly, true),
    citationsEnabled: asBool(s.aiCitationsEnabled, true),
    autoTitleEnabled: asBool(s.aiAutoTitleEnabled, true),
  };
}
