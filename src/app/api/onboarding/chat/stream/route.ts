import { NextRequest, NextResponse } from "next/server";
import { requireVerifiedSession } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { buildPolishPrompt, submitOnboardingMessage } from "@/server/onboarding/engine";

// SSE ala /api/nara/chat/stream: {type:"text",delta} mengalir per token,
// lalu {type:"done", reply, chips, step, coaPreview, finished, steps}.
// Yang di-stream adalah paraphrase polish() — mesin step (validasi, chips,
// COA) tetap deterministik di server dan tidak pernah datang dari LLM.
export async function POST(req: NextRequest) {
  let orgId: string;
  try {
    orgId = (await requireVerifiedSession()).orgId;
  } catch {
    return NextResponse.json({ error: "Sesi tidak valid. Silakan masuk ulang." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const message = String(body?.message ?? "");

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const result = await withOrg(orgId, (tx) =>
          submitOnboardingMessage(tx, orgId, message, {
          streamPolish: async (template) => {
            // Mock / tanpa kunci: satu chunk instan (perilaku lama, tetap jujur).
            if (process.env.AI_MOCK === "1" || !process.env.GEMINI_API_KEY) {
              send({ type: "text", delta: template });
              return template;
            }
            const { GoogleGenAI } = await import("@google/genai");
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const s = await ai.interactions.create({
              model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",
              input: [
                {
                  type: "user_input",
                  content: [{ type: "text", text: buildPolishPrompt(template) }],
                } as never,
              ],
              stream: true,
              store: false,
            });
            let out = "";
            for await (const event of s as AsyncIterable<{
              event_type: string;
              delta?: { type: string; text?: string };
            }>) {
              if (
                event.event_type === "step.delta" &&
                event.delta?.type === "text" &&
                event.delta.text
              ) {
                out += event.delta.text;
                send({ type: "text", delta: event.delta.text });
              }
            }
            const final = out.trim() || template;
            // Stream kosong (gangguan): kirim template utuh agar tidak kedip.
            if (!out.trim()) send({ type: "text", delta: template });
            return final;
          },
        }));
        send({
          type: "done",
          reply: result.reply,
          chips: result.chips,
          step: result.step,
          coaPreview: result.coaPreview ?? null,
          finished: !!result.finished,
          steps: result.steps ?? [],
        });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Gagal memproses pesan." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Cegah proxy (nginx/Vercel) menahan chunk SSE sampai stream selesai —
      // tanpa ini token menumpuk lalu keluar bergerombol (terasa patah).
      "X-Accel-Buffering": "no",
    },
  });
}
