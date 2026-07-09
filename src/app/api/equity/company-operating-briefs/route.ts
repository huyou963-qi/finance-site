import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { requireEquityIngest } from "@/lib/api/equityIngestAuth";
import {
  listCompanyOperatingBriefs,
  parseCompanyOperatingBriefMeta,
  upsertCompanyOperatingBrief,
} from "@/lib/equity/companyOperatingBriefs";
import { normalizeGicsSector } from "@/lib/equity/gicsCatalog";

function ingestError(e: unknown) {
  const base = apiErrorResponse(e);
  const msg = base.msg;
  const status =
    msg.includes("ingest") || msg.includes("凭证") || msg.includes("INGEST_TOKEN")
      ? 401
      : base.status;
  return { msg, status };
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const sectorRaw = sp.get("sector") ?? undefined;
    const sector = sectorRaw ? normalizeGicsSector(sectorRaw) ?? sectorRaw : undefined;
    const result = await listCompanyOperatingBriefs({
      sector,
      symbol: sp.get("symbol") ?? undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
      offset: sp.get("offset") ? Number(sp.get("offset")) : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    requireEquityIngest(req);
    const body = (await req.json()) as {
      meta?: unknown;
      bodyMarkdown?: string;
      analysis?: unknown;
    };
    const meta = parseCompanyOperatingBriefMeta(body.meta);
    const { report, created } = await upsertCompanyOperatingBrief({
      meta,
      bodyMarkdown: body.bodyMarkdown ?? "",
      analysis: body.analysis,
    });
    return NextResponse.json(
      { id: report.id, symbol: report.symbol, periodMonth: report.periodMonth },
      { status: created ? 201 : 200 },
    );
  } catch (e) {
    const { msg, status } = ingestError(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
