import { NextRequest, NextResponse } from "next/server";
import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { executeNaraTool } from "@/server/ai/nara-tools";
import { friendlyToolLabel } from "@/components/ai-elements/tool-labels";
import { buildConfirmationText } from "@/server/ai/confirmation-text";
import { addMessage, getThread } from "@/server/db/repos/chat.repo";
import {
  getFunctionCalls,
  getFunctionResponses,
  REQUEST_CONFIRMATION_FUNCTION_CALL_NAME,
} from "@google/adk";
import type { Content } from "@google/genai";
import {
  buildRoutedAdkAgent,
  getAdkRunner,
  hasAdkRunner,
} from "@/server/ai/agents/adk-runner";
import { organizations } from "@/server/db/schema/org";
import { eq } from "drizzle-orm";
import { parseAiPrefs } from "@/lib/ai-prefs";

/** Teks konfirmasi Bahasa Indonesia per-tool → confirmation-text.ts (dipakai confirm + stream fallback). */
function extractSuggestions(data: unknown): string[] {
  const execData = data as { suggestions?: unknown } | undefined;
  return Array.isArray(execData?.suggestions)
    ? (execData.suggestions as unknown[]).filter((s): s is string => typeof s === "string").slice(0, 4)
    : [];
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireContext();
    const body = await req.json().catch(() => ({}));
    const {
      threadId,
      callId,
      toolName,
      args,
      approved,
      allowAllForSession,
      invocationId,
    } = body as {
      threadId?: string;
      callId: string;
      toolName: string;
      args: Record<string, unknown>;
      approved: boolean;
      allowAllForSession?: boolean;
      /** Id functionCall adk_request_confirmation (SSE) — syarat resume runner. */
      invocationId?: string;
    };

    if (!threadId || !toolName) {
      return NextResponse.json({ error: "threadId dan toolName wajib diisi." }, { status: 400 });
    }

    const thread = await withOrg(ctx.orgId, (tx) => getThread(tx, ctx.orgId, threadId));
    if (!thread) {
      return NextResponse.json({ error: "Percakapan tidak ditemukan." }, { status: 404 });
    }

    if (!approved) {
      // User rejected the action
      await withOrg(ctx.orgId, (tx) =>
        addMessage(tx, threadId, "assistant", `Baik, ${friendlyToolLabel(toolName)} dibatalkan atas permintaan Anda. Tidak ada perubahan di pembukuan — silakan beri tahu jika ada hal lain yang perlu dibantu.`, {
          toolInvocations: [{ callId, toolName, status: "rejected", args }],
        }),
      );
      return NextResponse.json({ ok: true, status: "rejected" });
    }

    // Jalur ADK resume: teruskan persetujuan sebagai FunctionResponse
    // adk_request_confirmation ke runner yang mem-pause invokasi tersebut.
    // Syarat: invocationId dikirim client + sesi ADK masih ada di proses ini
    // + event konfirmasi cocok. Gagal → fallback eksekusi langsung di bawah.
    if (typeof invocationId === "string" && invocationId && hasAdkRunner(ctx.orgId, threadId)) {
      try {
        const [orgRow] = await withOrg(ctx.orgId, (tx) =>
          tx.select().from(organizations).where(eq(organizations.id, ctx.orgId)),
        );
        const orgSettings = (orgRow?.settings ?? {}) as {
          aiHitlPolicy?: "smart" | "strict" | "autonomous";
        };
        const prefs = parseAiPrefs(orgRow?.settings);
        const agent = buildRoutedAdkAgent({
          orgId: ctx.orgId,
          actorEmail: ctx.userEmail,
          route: "coordinator",
          instruction:
            "Lanjutkan percakapan akuntansi berbahasa Indonesia sebagai Akunio. " +
            "Selesaikan tindakan yang baru disetujui pengguna, lalu ringkas hasilnya " +
            "dalam satu-dua kalimat Bahasa Indonesia yang hangat.",
          model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",
          gate: {
            prefs,
            hitlPolicy: orgSettings.aiHitlPolicy ?? "smart",
            allowAllForSession: Boolean(allowAllForSession),
          },
        });
        const runner = await getAdkRunner({
          orgId: ctx.orgId,
          userId: ctx.userEmail,
          threadId,
          agent,
        });
        const session = await runner.sessionService.getSession({
          appName: ctx.orgId,
          userId: ctx.userEmail,
          sessionId: threadId,
        });
        const pendingFound = (session?.events ?? []).some((ev) =>
          getFunctionCalls(ev).some(
            (c) => c.id === invocationId && c.name === REQUEST_CONFIRMATION_FUNCTION_CALL_NAME,
          ),
        );
        if (pendingFound) {
          const resumeMsg: Content = {
            role: "user",
            parts: [
              {
                functionResponse: {
                  id: invocationId,
                  name: REQUEST_CONFIRMATION_FUNCTION_CALL_NAME,
                  response: { confirmed: true },
                },
              },
            ],
          };
          let resumeText = "";
          let resumeData: unknown = null;
          let sawToolResponse = false;
          let resumeError: string | null = null;
          for await (const event of runner.runAsync({
            userId: ctx.userEmail,
            sessionId: threadId,
            newMessage: resumeMsg,
          })) {
            for (const part of event.content?.parts ?? []) {
              if (typeof part.text === "string" && part.text && part.thought !== true) {
                resumeText += part.text;
              }
            }
            for (const fr of getFunctionResponses(event)) {
              if (fr.name === REQUEST_CONFIRMATION_FUNCTION_CALL_NAME) continue;
              sawToolResponse = true;
              const payload = (fr.response ?? {}) as Record<string, unknown>;
              if (payload.status === "SUCCESS") {
                resumeData = ("data" in payload ? payload.data : null) ?? null;
              } else if (payload.status === "REJECTED") {
                resumeError = "REJECTED_BY_USER";
              } else if (payload.status !== "AWAITING_CONFIRMATION") {
                resumeError =
                  typeof payload.message === "string" && payload.message
                    ? payload.message
                    : `Tool ${fr.name ?? toolName} gagal.`;
              }
            }
          }
          if (sawToolResponse && !resumeError) {
            const confirmationText = resumeText.trim()
              ? resumeText.trim()
              : buildConfirmationText(toolName, resumeData);
            const suggestions = extractSuggestions(resumeData);
            const fullConfirmationText =
              suggestions.length > 0
                ? `${confirmationText} Ketuk salah satu saran di bawah untuk langkah berikutnya.`
                : confirmationText;
            const savedMsg = await withOrg(ctx.orgId, (tx) =>
              addMessage(tx, threadId, "assistant", fullConfirmationText, {
                toolInvocations: [
                  { callId, toolName, status: "approved", args, result: resumeData },
                ],
              }),
            );
            return NextResponse.json({
              ok: true,
              status: "approved",
              allowAllForSession: Boolean(allowAllForSession),
              message: savedMsg,
              data: resumeData,
              suggestions,
            });
          }
          if (sawToolResponse && resumeError && resumeError !== "REJECTED_BY_USER") {
            return NextResponse.json({ ok: false, error: resumeError }, { status: 400 });
          }
          // Tanpa respons tool (atau ditolak) → jatuh ke fallback/kartu lama.
          if (resumeError === "REJECTED_BY_USER") {
            await withOrg(ctx.orgId, (tx) =>
              addMessage(tx, threadId, "assistant", `Baik, ${friendlyToolLabel(toolName)} dibatalkan atas permintaan Anda. Tidak ada perubahan di pembukuan — silakan beri tahu jika ada hal lain yang perlu dibantu.`, {
                toolInvocations: [{ callId, toolName, status: "rejected", args }],
              }),
            );
            return NextResponse.json({ ok: true, status: "rejected" });
          }
        } else {
          console.warn("resume ADK dilewati: event konfirmasi tak ditemukan, fallback langsung");
        }
      } catch (e) {
        console.warn("resume ADK gagal, fallback eksekusi langsung", e instanceof Error ? e.message : e);
      }
    }

    // Kompatibilitas kartu lama (tanpa invocationId) / fallback resume:
    // eksekusi langsung seperti sebelum migrasi ADK.
    const execution = await executeNaraTool(ctx.orgId, ctx.userEmail, toolName, args);
    if (!execution.success) {
      await withOrg(ctx.orgId, (tx) =>
        addMessage(tx, threadId, "assistant", `Maaf, ${friendlyToolLabel(toolName)} gagal: ${execution.error}`, {
          toolInvocations: [{ callId, toolName, status: "failed", args, error: execution.error }],
        }),
      );
      return NextResponse.json({ ok: false, error: execution.error }, { status: 400 });
    }

    // Success response synthesis
    let confirmationText = buildConfirmationText(toolName, execution.data);

    // Saran tindak lanjut dari hasil tool (mis. "Posting ke Jurnal" setelah
    // faktur dibuat): ditempel ke teks tersimpan + diteruskan ke klien.
    const suggestions = extractSuggestions(execution.data);
    if (suggestions.length > 0) {
      confirmationText += " Ketuk salah satu saran di bawah untuk langkah berikutnya.";
    }

    const savedMsg = await withOrg(ctx.orgId, (tx) =>
      addMessage(tx, threadId, "assistant", confirmationText, {
        toolInvocations: [
          {
            callId,
            toolName,
            status: "approved",
            args,
            result: execution.data,
          },
        ],
      }),
    );

    return NextResponse.json({
      ok: true,
      status: "approved",
      allowAllForSession: Boolean(allowAllForSession),
      message: savedMsg,
      data: execution.data,
      suggestions,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal memproses konfirmasi.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
