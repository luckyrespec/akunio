import { NextResponse } from "next/server";
import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { loadPeriodOrDefault } from "@/server/reports/build";
import { aggregateCalkFinancialData, generateCalkNarrative } from "@/server/reports/calk-ai";
import { buildCalkDocx } from "@/server/reports/calk-docx";

export async function GET(request: Request) {
  try {
    const ctx = await requireContext();
    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get("period") ?? undefined;

    const { docxBuffer, periodEndsOn, entityName } = await withOrg(ctx.orgId, async (tx) => {
      const period = await loadPeriodOrDefault(tx, ctx.orgId, periodParam);
      const finData = await aggregateCalkFinancialData(tx, ctx.orgId, period.endsOn);
      const narrative = await generateCalkNarrative(tx, ctx.orgId, period.endsOn);
      const docxBuffer = await buildCalkDocx({
        ...finData,
        narrative,
      });

      return { docxBuffer, periodEndsOn: period.endsOn, entityName: finData.entityName };
    });

    const safeName = entityName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `CALK_${safeName}_${periodEndsOn}.docx`;

    return new NextResponse(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Error generating CALK docx:", error);
    return NextResponse.json(
      { error: "Gagal membuat dokumen CALK (.docx)" },
      { status: 500 }
    );
  }
}
