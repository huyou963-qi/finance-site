import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { buildInvestmentCaseFile, investmentCaseFilename } from "@/lib/investmentCaseFile";
import { getInvestmentCaseDetail } from "@/lib/investments";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const detail = await getInvestmentCaseDetail(user.id, (await params).id);
    const exportedAt = new Date();
    const file = buildInvestmentCaseFile(detail, exportedAt);
    return new NextResponse(`${JSON.stringify(file, null, 2)}\n`, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${investmentCaseFilename(detail.symbol, exportedAt)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "投资案例导出失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
