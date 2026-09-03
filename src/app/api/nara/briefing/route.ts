import { NextRequest, NextResponse } from "next/server";
import { requireContext } from "@/server/auth/guard";
import { getDailyBriefingData } from "@/server/reports/briefing";

export async function GET(_req: NextRequest) {
  try {
    const ctx = await requireContext();
    const briefing = await getDailyBriefingData(ctx.orgId);
    return NextResponse.json({ success: true, briefing });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
