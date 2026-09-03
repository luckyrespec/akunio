import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { getDailyBriefingData } from "@/server/reports/briefing";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const briefing = await getDailyBriefingData(session.orgId);
    return NextResponse.json({ success: true, briefing });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
