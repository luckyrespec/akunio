import type { AssistantMemory, MemoryKind } from "@/server/db/repos/assistant-memory.repo";

const TRIGGER = /(ingat(?:kan)?(?: ya)?|jangan lupa|catat sebagai preferensi)[,:\s]+(.{3,500})/i;

export function extractExplicitMemory(message: string): { kind: MemoryKind; content: string } | null {
  const m = message.match(TRIGGER);
  if (!m) return null;
  const content = m[2].trim().slice(0, 500);
  if (!content) return null;
  const kind: MemoryKind = /usaha|toko|bisnis|nama/i.test(content)
    ? "PROFILE"
    : /selalu|jangan|preferensi|suka/i.test(content)
      ? "PREFERENCE"
      : "FACT";
  return { kind, content };
}

export function formatMemoriesForPrompt(mems: AssistantMemory[]): string {
  const list = mems.slice(0, 20);
  if (list.length === 0) return "";
  const lines = list.map((m) => `- [${m.kind}] ${m.content}`);
  return `Ingatan tersimpan:\n(gunakan bila relevan; user bisa mengubahnya di Pengaturan)\n${lines.join("\n")}`;
}
