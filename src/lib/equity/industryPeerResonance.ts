import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const MONTH_RE = /^\d{4}-\d{2}$/;

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} 必填`);
  }
  return value.trim();
}

export type IndustryPeerResonancePayload = {
  meta: {
    periodMonth: string;
    peerGroupId: string;
    peerGroupLabel: string;
    gicsIndustry: string;
    gicsSector: string;
    peerCount: number;
    generatedAt: string;
    peersAnalyzed?: string[];
  };
  consensus?: unknown;
  outliers?: unknown;
};

export function parseIndustryPeerResonance(raw: unknown): {
  payload: IndustryPeerResonancePayload;
  bodyMarkdown: string;
} {
  if (!raw || typeof raw !== "object") throw new Error("body 须为 JSON 对象");
  const body = raw as Record<string, unknown>;
  const metaRaw = body.meta;
  if (!metaRaw || typeof metaRaw !== "object") throw new Error("meta 必填");
  const m = metaRaw as Record<string, unknown>;
  const periodMonth = asString(m.periodMonth, "meta.periodMonth");
  if (!MONTH_RE.test(periodMonth)) throw new Error("meta.periodMonth 须为 YYYY-MM");
  const peerGroupId = asString(m.peerGroupId, "meta.peerGroupId");
  const payload: IndustryPeerResonancePayload = {
    meta: {
      periodMonth,
      peerGroupId,
      peerGroupLabel: asString(m.peerGroupLabel, "meta.peerGroupLabel"),
      gicsIndustry: asString(m.gicsIndustry, "meta.gicsIndustry"),
      gicsSector: asString(m.gicsSector, "meta.gicsSector"),
      peerCount: Number(m.peerCount) || 0,
      generatedAt: asString(m.generatedAt, "meta.generatedAt"),
      peersAnalyzed: Array.isArray(m.peersAnalyzed)
        ? m.peersAnalyzed.filter((x): x is string => typeof x === "string")
        : undefined,
    },
    consensus: body.consensus,
    outliers: body.outliers,
  };
  const bodyMarkdown =
    typeof body.bodyMarkdown === "string" ? body.bodyMarkdown : "";
  if (!bodyMarkdown.trim()) throw new Error("bodyMarkdown 必填");
  return { payload, bodyMarkdown };
}

export async function upsertIndustryPeerResonance(input: {
  payload: IndustryPeerResonancePayload;
  bodyMarkdown: string;
}) {
  const peerGroupId = input.payload.meta.peerGroupId;
  const periodMonth = input.payload.meta.periodMonth;
  const json = input.payload as unknown as Prisma.InputJsonValue;

  const existing = await prisma.industryPeerResonance.findUnique({
    where: { peerGroupId_periodMonth: { peerGroupId, periodMonth } },
  });

  if (existing) {
    const row = await prisma.industryPeerResonance.update({
      where: { id: existing.id },
      data: { payload: json, bodyMarkdown: input.bodyMarkdown },
    });
    return { row, created: false };
  }

  const row = await prisma.industryPeerResonance.create({
    data: {
      peerGroupId,
      periodMonth,
      payload: json,
      bodyMarkdown: input.bodyMarkdown,
    },
  });
  return { row, created: true };
}

export async function listIndustryPeerResonances(opts: {
  sector?: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const rows = await prisma.industryPeerResonance.findMany({
    orderBy: [{ periodMonth: "desc" }],
    take: 200,
  });

  const filtered = opts.sector
    ? rows.filter((r) => {
        const p = r.payload as { meta?: { gicsSector?: string } };
        return p?.meta?.gicsSector === opts.sector;
      })
    : rows;

  return {
    items: filtered.slice(0, limit).map((r) => ({
      id: r.id,
      peerGroupId: r.peerGroupId,
      periodMonth: r.periodMonth,
      bodyMarkdown: r.bodyMarkdown,
      payload: r.payload,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
