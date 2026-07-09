import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { requireEquityIngest } from "@/lib/api/equityIngestAuth";
import {
  listIndustryPeerResonances,
  parseIndustryPeerResonance,
  upsertIndustryPeerResonance,
} from "@/lib/equity/industryPeerResonance";
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
    const sectorRaw = req.nextUrl.searchParams.get("sector") ?? undefined;
    const sector = sectorRaw ? normalizeGicsSector(sectorRaw) ?? sectorRaw : undefined;
    const limit = req.nextUrl.searchParams.get("limit")
      ? Number(req.nextUrl.searchParams.get("limit"))
      : undefined;
    const result = await listIndustryPeerResonances({ sector, limit });
    return NextResponse.json(result);
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    requireEquityIngest(req);
    const body = await req.json();
    const { payload, bodyMarkdown } = parseIndustryPeerResonance(body);
    const { row, created } = await upsertIndustryPeerResonance({
      payload,
      bodyMarkdown,
    });
    return NextResponse.json(
      {
        id: row.id,
        peerGroupId: row.peerGroupId,
        periodMonth: row.periodMonth,
      },
      { status: created ? 201 : 200 },
    );
  } catch (e) {
    const { msg, status } = ingestError(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
