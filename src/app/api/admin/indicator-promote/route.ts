import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, adminErrorResponse } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/prisma";
import { promoteIndicator } from "@/lib/data/indicatorOnboard";

/**
 * POST /api/admin/indicator-promote
 * Body: { instrumentCode, catalogCategory, displayName?, countryCode?, releasePackageId?, unit?, freqLabel? }
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = (await req.json()) as {
      instrumentCode?: string;
      catalogCategory?: string;
      displayName?: string;
      countryCode?: string;
      releasePackageId?: string | null;
      unit?: string | null;
      freqLabel?: string | null;
    };

    const result = await promoteIndicator(prisma, {
      instrumentCode: body.instrumentCode?.trim() ?? "",
      catalogCategory: body.catalogCategory?.trim() ?? "",
      displayName: body.displayName,
      countryCode: body.countryCode,
      releasePackageId: body.releasePackageId,
      unit: body.unit,
      freqLabel: body.freqLabel,
    });

    return NextResponse.json(result);
  } catch (e) {
    const { message, status } = adminErrorResponse(e);
    return NextResponse.json({ error: message }, { status });
  }
}
