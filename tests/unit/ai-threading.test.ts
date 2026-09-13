import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveDraftAccounts } from "@/core/ai/map-accounts";
import { buildDraftPrompt } from "@/server/ai/prompt";

/**
 * Task B6 — threading journal-chat, jendela 12, prompt leaf, resolver postable.
 * Murni unit: provider Gemini di-mock di level SDK (tanpa API key/network asli),
 * action diuji via mock modul (tanpa DB).
 */

// --- Mock provider Gemini (pola tests/integration/advisor.test.ts) ---
const { createSpy } = vi.hoisted(() => ({ createSpy: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    interactions = { create: createSpy };
  },
}));

// --- Mock untuk action journal-ai: thread tersimpan + penyimpanan id interaksi ---
// Catatan: modul journal-chat ASLI dipakai agar alur action → journalChat →
// provider teruji ujung-ke-ujung; spy argumen dibaca di level provider.
const { saveInteractionSpy } = vi.hoisted(() => ({
  saveInteractionSpy: vi.fn(),
}));
vi.mock("@/server/auth/guard", () => ({
  requireContext: vi.fn(async () => ({
    userId: "uji-b6",
    userEmail: "uji@akunio.id",
    emailVerified: true,
    orgId: "org_b6",
    role: "OWNER" as const,
  })),
}));
vi.mock("@/server/db/repos/chat.repo", () => ({
  checkAssistantQuota: vi.fn(async () => ({ allowed: true })),
  getThread: vi.fn(async () => ({ geminiInteractionId: "int_tersimpan_1" })),
}));
vi.mock("@/server/ai/interaction-memory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/ai/interaction-memory")>();
  return { ...actual, saveThreadInteractionId: saveInteractionSpy };
});
vi.mock("@/server/db", () => ({
  db: { select: () => ({ from: () => ({ where: async () => [] }) }) },
}));
vi.mock("@/server/storage/storage", () => ({
  putDocument: vi.fn(),
  MAX_DOCUMENT_BYTES: 5 * 1024 * 1024,
  ALLOWED_MIMES: ["image/png", "application/pdf"],
}));

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "test-key";

type CreateArg = {
  previous_interaction_id?: string;
  input?: unknown;
};

function lastCreateArg(): CreateArg | undefined {
  const calls = createSpy.mock.calls as Array<[CreateArg]>;
  return calls[calls.length - 1]?.[0];
}

// Fixture COA ter-onboarding tipe DAGANG: 4100 punya anak 4110 → GROUP,
// 4110/1110/5900 leaf siap posting.
const ONBOARDED_ACCOUNTS = [
  { id: "p4000", code: "4000", name: "PENDAPATAN", parentCode: null },
  { id: "p4100", code: "4100", name: "Pendapatan Usaha", parentCode: "4000" },
  { id: "c4110", code: "4110", name: "Penjualan Barang", parentCode: "4100" },
  { id: "k1110", code: "1110", name: "Kas", parentCode: "1100" },
  { id: "b5900", code: "5900", name: "Beban Lain-lain", parentCode: "5000" },
];

describe("B6 ai threading + resolver", () => {
  beforeEach(() => {
    createSpy.mockReset();
    createSpy.mockResolvedValue({
      id: "int_mock_1",
      steps: [],
      output_text: "Halo, ada yang bisa dibantu?",
    });
    saveInteractionSpy.mockReset();
  });

  it("action teruskan previousInteractionId yang tersimpan", async () => {
    createSpy.mockResolvedValue({ id: "int_baru_1", steps: [], output_text: "ok" });
    const { journalAiChatAction } = await import("@/server/actions/journal-ai.actions");
    const fd = new FormData();
    fd.set("message", "beli kertas 10.000 tunai");
    fd.set("threadId", "thr_b6");

    const res = await journalAiChatAction(fd);

    expect(res.ok).toBe(true);
    // Id tersimpan di thread mencapai provider via journalChat.
    expect(lastCreateArg()).toMatchObject({ previous_interaction_id: "int_tersimpan_1" });
    expect(saveInteractionSpy).toHaveBeenCalledWith("org_b6", "thr_b6", "int_baru_1");
    expect(res).toMatchObject({ interactionId: "int_baru_1" });
  });

  it("journalChat teruskan previousInteractionId ke interactions.create", async () => {
    const { journalChat } = await import("@/server/ai/journal-chat");
    await journalChat({
      message: "lanjutkan",
      accounts: [],
      todayISO: "2026-09-13",
      previousInteractionId: "int_7",
    });
    expect(lastCreateArg()).toMatchObject({ previous_interaction_id: "int_7" });

    createSpy.mockClear();
    await journalChat({ message: "halo", accounts: [], todayISO: "2026-09-13" });
    expect(lastCreateArg()).not.toHaveProperty("previous_interaction_id");
  });

  it("draft GROUP ditandai unresolved", () => {
    const res = resolveDraftAccounts({ lines: [{ accountCode: "4100" }] }, ONBOARDED_ACCOUNTS);
    expect(res.lines[0]?.unresolved).toBe(true);
    expect(res.lines[0]?.accountId).toBeNull();
    expect(res.warnings.join(" ")).toMatch(/induk|GROUP/i);

    // Kunci non-regresi: leaf tetap ter-resolve.
    const leaf = resolveDraftAccounts({ lines: [{ accountCode: "4110" }] }, ONBOARDED_ACCOUNTS);
    expect(leaf.lines[0]).toMatchObject({ unresolved: false, accountId: "c4110" });
  });

  it("prompt mencontohkan kode leaf", () => {
    const prompt = buildDraftPrompt({
      accounts: [
        { code: "4110", name: "Penjualan Barang", normal: "K" },
        { code: "5900", name: "Beban Lain-lain", normal: "D" },
        { code: "1110", name: "Kas", normal: "D" },
      ],
      todayISO: "2026-09-13",
      text: "beli perlengkapan kantor tunai Rp 500.000",
    });
    // Baris CONTOH/Output wajib memakai kode leaf siap posting, bukan induk.
    const contoh = prompt.split("\n").find((l) => l.startsWith("Output:"));
    expect(contoh).toContain("5900");
    expect(contoh).not.toMatch(/5100|4100/);
    expect(prompt).not.toContain("5100");
  });

  it("jendela riwayat 12 pesan", async () => {
    const { journalChat } = await import("@/server/ai/journal-chat");
    const history = Array.from({ length: 15 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: i === 0 ? "PESAN_LAMA_UNIK_B6" : `pesan ${i}`,
    }));
    history[14] = { role: "user", content: "PESAN_BARU_UNIK_B6" };
    await journalChat({
      message: "ok catatkan ya",
      accounts: [],
      todayISO: "2026-09-13",
      history,
    });
    const sent = JSON.stringify(lastCreateArg()?.input ?? "");
    expect(sent).not.toContain("PESAN_LAMA_UNIK_B6");
    expect(sent).toContain("PESAN_BARU_UNIK_B6");
  });

  it("previous_interaction_id basi diulang tanpa chaining", async () => {
    createSpy.mockRejectedValueOnce(new Error("previous_interaction not found (expired)"));
    createSpy.mockResolvedValue({ id: "int_segar", steps: [], output_text: "siap" });
    const { journalChat } = await import("@/server/ai/journal-chat");
    const res = await journalChat({
      message: "lanjutkan",
      accounts: [],
      todayISO: "2026-09-13",
      previousInteractionId: "int_kedaluwarsa",
    });
    expect(res.answer).toBe("siap");
    expect(res.interactionId).toBe("int_segar");
    expect(createSpy).toHaveBeenCalledTimes(2);
    expect(lastCreateArg()).not.toHaveProperty("previous_interaction_id");
  });

  it("helper model tunggal getGeminiModel", async () => {
    const models = await import("@/server/ai/models");
    expect(typeof models.getGeminiModel).toBe("function");
    const prev = process.env.GEMINI_MODEL;
    process.env.GEMINI_MODEL = "gemini-uji-b6";
    expect(models.getGeminiModel()).toBe("gemini-uji-b6");
    if (prev === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = prev;
    expect(models.getGeminiModel()).toBe("gemini-3.5-flash-lite");
  });
});
