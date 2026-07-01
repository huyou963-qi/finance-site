import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type WeeklyReportKpi = {
  label: string;
  value: string;
  delta: string;
  dir: "up" | "down" | "flat";
};

export type WeeklyReportMeta = {
  weekEnding: string;
  title: string;
  regime: string;
  regimeConfidence: "H" | "M" | "L";
  scope: string;
  generatedAt: string;
  summaryOneLiner: string;
  kpis: WeeklyReportKpi[];
};

export type WeeklyReportListItem = {
  id: string;
  weekEnding: string;
  meta: WeeklyReportMeta;
  createdAt: string;
  updatedAt: string;
};

export type WeeklyReportDetail = WeeklyReportListItem & {
  bodyMarkdown: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseWeekEndingDate(value: string): Date {
  const trimmed = value.trim();
  if (!ISO_DATE.test(trimmed)) {
    throw new Error("meta.weekEnding 须为 YYYY-MM-DD");
  }
  const d = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error("meta.weekEnding 日期无效");
  }
  return d;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} 必填`);
  }
  return value.trim();
}

function asConfidence(value: unknown): "H" | "M" | "L" {
  if (value === "H" || value === "M" || value === "L") return value;
  throw new Error("meta.regimeConfidence 须为 H / M / L");
}

function asKpis(value: unknown): WeeklyReportKpi[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("meta.kpis 须为非空数组");
  }
  return value.map((item, i) => {
    if (!item || typeof item !== "object") {
      throw new Error(`meta.kpis[${i}] 格式无效`);
    }
    const row = item as Record<string, unknown>;
    const dir = row.dir;
    if (dir !== "up" && dir !== "down" && dir !== "flat") {
      throw new Error(`meta.kpis[${i}].dir 须为 up / down / flat`);
    }
    return {
      label: asString(row.label, `meta.kpis[${i}].label`),
      value: asString(row.value, `meta.kpis[${i}].value`),
      delta: asString(row.delta, `meta.kpis[${i}].delta`),
      dir,
    };
  });
}

export function parseWeeklyReportMeta(raw: unknown): WeeklyReportMeta {
  if (!raw || typeof raw !== "object") {
    throw new Error("meta 须为 JSON 对象");
  }
  const m = raw as Record<string, unknown>;
  const weekEnding = asString(m.weekEnding, "meta.weekEnding");
  parseWeekEndingDate(weekEnding);
  return {
    weekEnding,
    title: asString(m.title, "meta.title"),
    regime: asString(m.regime, "meta.regime"),
    regimeConfidence: asConfidence(m.regimeConfidence),
    scope: asString(m.scope, "meta.scope"),
    generatedAt: asString(m.generatedAt, "meta.generatedAt"),
    summaryOneLiner: asString(m.summaryOneLiner, "meta.summaryOneLiner"),
    kpis: asKpis(m.kpis),
  };
}

function toListItem(row: {
  id: string;
  weekEnding: Date;
  meta: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): WeeklyReportListItem {
  return {
    id: row.id,
    weekEnding: row.weekEnding.toISOString().slice(0, 10),
    meta: parseWeeklyReportMeta(row.meta),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listWeeklyReports(opts?: {
  limit?: number;
  offset?: number;
}): Promise<{ reports: WeeklyReportListItem[]; total: number }> {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  const offset = Math.max(opts?.offset ?? 0, 0);
  const [rows, total] = await Promise.all([
    prisma.weeklyReport.findMany({
      orderBy: { weekEnding: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        weekEnding: true,
        meta: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.weeklyReport.count(),
  ]);
  return {
    reports: rows.map(toListItem),
    total,
  };
}

export async function getWeeklyReportById(id: string): Promise<WeeklyReportDetail | null> {
  const row = await prisma.weeklyReport.findUnique({ where: { id } });
  if (!row) return null;
  return {
    ...toListItem(row),
    bodyMarkdown: row.bodyMarkdown,
  };
}

export async function deleteWeeklyReport(id: string): Promise<boolean> {
  const existing = await prisma.weeklyReport.findUnique({ where: { id } });
  if (!existing) return false;
  await prisma.weeklyReport.delete({ where: { id } });
  return true;
}

export async function upsertWeeklyReport(input: {
  meta: WeeklyReportMeta;
  bodyMarkdown: string;
}): Promise<{ report: WeeklyReportDetail; created: boolean }> {
  const meta = parseWeeklyReportMeta(input.meta);
  const bodyMarkdown = input.bodyMarkdown?.trim();
  if (!bodyMarkdown) {
    throw new Error("bodyMarkdown 不能为空");
  }
  if (meta.weekEnding !== input.meta.weekEnding?.trim()) {
    throw new Error("meta.weekEnding 格式不一致");
  }

  const weekEnding = parseWeekEndingDate(meta.weekEnding);
  const existing = await prisma.weeklyReport.findUnique({ where: { weekEnding } });

  const row = existing
    ? await prisma.weeklyReport.update({
        where: { weekEnding },
        data: {
          meta: meta as unknown as Prisma.InputJsonValue,
          bodyMarkdown,
        },
      })
    : await prisma.weeklyReport.create({
        data: {
          weekEnding,
          meta: meta as unknown as Prisma.InputJsonValue,
          bodyMarkdown,
        },
      });

  return {
    report: {
      ...toListItem(row),
      bodyMarkdown: row.bodyMarkdown,
    },
    created: !existing,
  };
}
