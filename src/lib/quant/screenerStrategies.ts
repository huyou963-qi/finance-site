/** 选股器策略存储的共享工具（API 路由不允许导出非 HTTP 方法，故独立成模块） */

import type { ScreenerConfig } from "@/lib/quant/screener";

export type StrategyRow = {
  id: string;
  name: string;
  config: ScreenerConfig;
  createdAt: string;
  updatedAt: string;
};

export function toStrategyRow(s: {
  id: string;
  name: string;
  config: unknown;
  createdAt: Date;
  updatedAt: Date;
}): StrategyRow {
  return {
    id: s.id,
    name: s.name,
    config: s.config as ScreenerConfig,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export function parseStrategyName(name: unknown): string {
  if (typeof name !== "string" || !name.trim()) throw new Error("策略名不能为空");
  const trimmed = name.trim();
  if (trimmed.length > 128) throw new Error("策略名过长（≤128 字符）");
  return trimmed;
}
