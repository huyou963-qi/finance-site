import { NextRequest, NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/auth/requireAdmin";
import { loadEquityCoverageReport } from "@/lib/equity/equityCoverageAdmin";
import { loadDisclosureBatchHistory } from "@/lib/equity/disclosureBatchAdmin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const [report, disclosureHistory] = await Promise.all([
      loadEquityCoverageReport(prisma),
      loadDisclosureBatchHistory(prisma, new Date()).catch((error: unknown) => {
        console.error("Could not load SEC disclosure batch history", error);
        return null;
      }),
    ]);
    return NextResponse.json({ ...report, disclosureHistory });
  } catch (e) {
    const { message, status } = adminErrorResponse(e);
    return NextResponse.json({ error: message }, { status });
  }
}
