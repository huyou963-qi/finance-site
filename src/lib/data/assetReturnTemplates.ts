import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type TemplateAsset = "10Y" | "SPX" | "XAU";

export type ReturnRow = {
  asset: TemplateAsset;
  startDate: string;
  endDate: string;
  closeToCloseReturn: number;
  lowToHighReturn: number;
  startClose: number;
  endClose: number;
  startLow: number;
  endHigh: number;
  tradingDays: number;
};

export type ReturnRun = {
  id: string;
  createdAt: string;
  request: { start: string; end: string; assets: TemplateAsset[] };
  rows: ReturnRow[];
};

export type Template = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  runs: ReturnRun[];
  draftStart: string;
  draftEnd: string;
  draftAssets: TemplateAsset[];
};

export type TemplateState = {
  version: 1;
  templates: Template[];
  activeTemplateId: string;
};

function isAsset(v: unknown): v is TemplateAsset {
  return v === "10Y" || v === "SPX" || v === "XAU";
}

function sanitize(input: unknown): TemplateState | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (!Array.isArray(o.templates) || o.templates.length === 0) return null;
  const templates: Template[] = [];
  for (const item of o.templates) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    const draftAssets = Array.isArray(t.draftAssets) ? t.draftAssets.filter(isAsset) : [];
    templates.push({
      id: String(t.id ?? ""),
      name: String(t.name ?? "未命名模板"),
      createdAt: String(t.createdAt ?? new Date().toISOString()),
      updatedAt: String(t.updatedAt ?? new Date().toISOString()),
      runs: Array.isArray(t.runs) ? (t.runs as ReturnRun[]) : [],
      draftStart: String(t.draftStart ?? ""),
      draftEnd: String(t.draftEnd ?? ""),
      draftAssets: draftAssets.length > 0 ? draftAssets : ["10Y", "SPX", "XAU"],
    });
  }
  if (templates.length === 0) return null;
  const active = String(o.activeTemplateId ?? templates[0]!.id);
  const activeTemplateId = templates.some((t) => t.id === active) ? active : templates[0]!.id;
  return { version: 1, templates, activeTemplateId };
}

export async function loadTemplateStateForUser(userId: string): Promise<TemplateState | null> {
  const row = await prisma.userAssetTemplateState.findUnique({
    where: { userId },
  });
  if (!row) return null;
  return sanitize(row.state as unknown);
}

export async function saveTemplateStateForUser(
  userId: string,
  input: unknown,
): Promise<TemplateState> {
  const state = sanitize(input);
  if (!state) {
    throw new Error("模板数据格式不合法");
  }
  const json = state as unknown as Prisma.InputJsonValue;
  await prisma.userAssetTemplateState.upsert({
    where: { userId },
    create: { userId, state: json },
    update: { state: json },
  });
  return state;
}
