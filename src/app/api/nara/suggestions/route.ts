import { NextRequest, NextResponse } from "next/server";
import { requireContext } from "@/server/auth/guard";
import { generatePersonalSuggestions } from "@/server/ai/suggestions";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireContext();
    const url = new URL(req.url);
    const excludeParam = url.searchParams.get("exclude") ?? "";
    const pagePath = url.searchParams.get("pagePath") ?? "";
    const excludeLabels = excludeParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);

    const suggestions = await generatePersonalSuggestions(ctx.orgId, { excludeLabels, pagePath });

    return NextResponse.json({ suggestions }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal memuat saran";
    if (msg.includes("Kuota") || msg.includes("habis")) {
      return NextResponse.json({ error: msg }, { status: 429 });
    }
    // Fallback tetap kembalikan saran generik agar UI tidak error
    const { FALLBACK_SUGGESTIONS } = await import("@/server/ai/suggestions");
    return NextResponse.json({ suggestions: FALLBACK_SUGGESTIONS, fallback: true });
  }
}

// Alihkan POST ke GET untuk kompatibilitas
export async function POST(req: NextRequest) {
  return GET(req);
}
