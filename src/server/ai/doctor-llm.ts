import { GoogleGenAI } from "@google/genai";
export async function reviewFinding(finding: { type: string; evidence: Record<string, unknown> }, samples: unknown[]) {
  if (process.env.AI_MOCK === "1") return { suggestion: "Koreksi: periksa klasifikasi akun", ifrsCitation: "IFRS SME 17.2", proposalDraft: { memo: "koreksi", lines: [] } };
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const interaction = await ai.interactions.create({ model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite", input: `Review finding ${finding.type}`, store: false });
  return { suggestion: interaction.output_text ?? "", ifrsCitation: "IFRS SME 10.3" };
}
