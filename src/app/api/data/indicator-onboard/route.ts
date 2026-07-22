import { NextRequest, NextResponse } from "next/server";
import { requireUser, apiErrorResponse } from "@/lib/api/eventAuth";
import { prisma } from "@/lib/prisma";
import { onboardIndicator, type OnboardSource } from "@/lib/data/indicatorOnboard";

/**
 * POST /api/data/indicator-onboard
 * Body: { source: "fred"|"worldbank", sourceSeriesKey: string, countryCode?, titleHint? }
 * 登录用户：幂等解析/草稿入库外部指标。
 */
export async function POST(req: NextRequest) {
  try {
    await requireUser(req);
    const body = (await req.json()) as {
      source?: string;
      sourceSeriesKey?: string;
      countryCode?: string;
      titleHint?: string;
    };
    const source = body.source?.trim() as OnboardSource | undefined;
    const sourceSeriesKey = body.sourceSeriesKey?.trim() ?? "";
    if (source !== "fred" && source !== "worldbank") {
      return NextResponse.json({ error: "source 须为 fred 或 worldbank" }, { status: 400 });
    }
    if (!sourceSeriesKey) {
      return NextResponse.json({ error: "缺少 sourceSeriesKey" }, { status: 400 });
    }

    const result = await onboardIndicator(prisma, {
      source,
      sourceSeriesKey,
      countryCode: body.countryCode,
      titleHint: body.titleHint,
    });

    return NextResponse.json(result);
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
