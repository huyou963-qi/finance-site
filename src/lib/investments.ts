import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const INVESTMENT_STATUSES = [
  "research",
  "watching",
  "approved",
  "holding",
  "closed",
] as const;
export const INVESTMENT_STYLES = ["long_term", "swing", "event", "short_term"] as const;
export const ACTION_TYPES = ["BUY", "ADD", "TRIM", "SELL", "NOTE", "THESIS_UPDATE"] as const;

const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,14}$/;

export function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} 必填`);
  return value.trim().slice(0, max);
}

export function optionalText(value: unknown, max = 20_000): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("文本字段格式无效");
  return value.trim().slice(0, max) || null;
}

export function parseSymbol(value: unknown): string {
  const symbol = requiredText(value, "股票代码", 16).toUpperCase();
  if (!SYMBOL_RE.test(symbol)) throw new Error("股票代码格式无效");
  return symbol;
}

export function optionalNumber(value: unknown, opts: { min?: number; max?: number } = {}) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) throw new Error("数值字段格式无效");
  if (opts.min != null && n < opts.min) throw new Error(`数值不能小于 ${opts.min}`);
  if (opts.max != null && n > opts.max) throw new Error(`数值不能大于 ${opts.max}`);
  return n;
}

export function optionalDate(value: unknown, dateOnly = false): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("日期格式无效");
  const date = new Date(dateOnly ? `${value.slice(0, 10)}T00:00:00.000Z` : value);
  if (!Number.isFinite(date.getTime())) throw new Error("日期格式无效");
  return date;
}

export async function requireOwnedInvestmentCase(userId: string, id: string) {
  const row = await prisma.investmentCase.findFirst({ where: { id, userId } });
  if (!row) throw new Error("投资案例不存在或无权访问");
  return row;
}

function actionSignedQuantity(action: { actionType: string; quantity: number | null }): number {
  const quantity = action.quantity ?? 0;
  return action.actionType === "TRIM" || action.actionType === "SELL" ? -quantity :
    action.actionType === "BUY" || action.actionType === "ADD" ? quantity : 0;
}

export function summarizeActions(actions: {
  actionType: string;
  quantity: number | null;
  price: number | null;
  positionWeightPct: number | null;
}[]) {
  let quantity = 0;
  let currentWeightPct: number | null = null;
  let buys = 0;
  let trims = 0;
  for (const action of actions) {
    quantity += actionSignedQuantity(action);
    if (action.positionWeightPct != null) currentWeightPct = action.positionWeightPct;
    if (action.actionType === "BUY" || action.actionType === "ADD") buys += 1;
    if (action.actionType === "TRIM" || action.actionType === "SELL") trims += 1;
  }
  return { quantity, currentWeightPct, buys, trims };
}

export async function listInvestmentCases(userId: string) {
  const rows = await prisma.investmentCase.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      actions: { orderBy: { occurredAt: "asc" }, select: { actionType: true, quantity: true, price: true, positionWeightPct: true } },
      catalysts: { where: { status: "watching" }, orderBy: [{ windowEnd: "asc" }, { createdAt: "desc" }], take: 1 },
      researchVersions: { orderBy: { version: "desc" }, take: 1, select: { version: true, confirmedAt: true } },
      reviews: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, authorKind: true } },
    },
  });
  return rows.map((row) => ({ ...row, summary: summarizeActions(row.actions) }));
}

export async function getInvestmentCaseDetail(userId: string, id: string) {
  const row = await prisma.investmentCase.findFirst({
    where: { id, userId },
    include: {
      researchVersions: { orderBy: { version: "desc" } },
      catalysts: { orderBy: [{ windowEnd: "asc" }, { createdAt: "desc" }] },
      tradePlan: true,
      actions: { orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }] },
      reviews: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!row) throw new Error("投资案例不存在或无权访问");
  return { ...row, summary: summarizeActions([...row.actions].reverse()) };
}

export function asJson(value: unknown, fallback: Prisma.InputJsonValue): Prisma.InputJsonValue {
  if (value == null) return fallback;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
