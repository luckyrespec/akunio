// Single source of truth for Gemini model selection.
//
// Product policy:
// - everything runs on GEMINI_MODEL (gemini-3.5-flash-lite)
// - the deep/thinking preset runs on GEMINI_THINKING_MODEL (gemini-3.8-flash)
// - embeddings run on GEMINI_EMBED_MODEL (gemini-embedding-001, 768 dims)
//
// Never hardcode a model id at call sites — use these helpers so a model
// swap is one env change, not a multi-file hunt. Never legacy 2.5-*/2.0-*/1.5-*.
export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
}

export function chatModel(): string {
  return getGeminiModel();
}

export function thinkingModel(): string {
  return process.env.GEMINI_THINKING_MODEL ?? "gemini-3.8-flash";
}

export function embedModel(): string {
  return process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001";
}

export function modelForPreset(preset?: string): string {
  return preset === "deep" ? thinkingModel() : chatModel();
}
