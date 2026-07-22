/**
 * 回测 run 的创建 / 执行 / 持久化（Phase 3 WS3 共享层）。
 * CLI（scripts/quant/run-backtest.ts）与 API（/api/equity/backtest）共用，
 * 保证「进程内异步执行 + 落库」逻辑单一来源。
 *
 * 生命周期：queued →（executeRun）running → done | failed。
 * 结果分三表：backtest_run（元信息+metrics+summary）、backtest_nav（日序列）、
 * backtest_position（逐期持仓）。nav 行量大（25 年≈6300 行），分块 createMany。
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  DEFAULT_BACKTEST_PARAMS,
  validateBacktestParams,
  type BacktestParams,
} from "@/lib/quant/backtest";
import { validateScreenerConfig, type ScreenerConfig } from "@/lib/quant/screener";
import { executeBacktest, type BacktestProgress } from "@/lib/quant/backtestData";

const NAV_INSERT_CHUNK = 1000;
const POSITION_INSERT_CHUNK = 1000;

export type RunStatus = "queued" | "running" | "done" | "failed";

export type BacktestRunSummary = {
  effectiveStart: string;
  dataFloor: string;
  rebalanceCount: number;
  symbolCount: number;
  /** 逐期数据边界（透明化）：选中数/持有数/无价跳过/权重缺失/清算 */
  periods: {
    date: string;
    execDate: string;
    selected: number;
    held: number;
    noPriceSkipped: number;
    droppedNoWeight: number;
    liquidated: number;
    turnover: number;
    cost: number;
    universeTotal: number | null;
    droppedNull: number | null;
    filteredOut: number | null;
    matched: number | null;
    regime: string | null;
    regimeBlocked: boolean;
  }[];
};

/** 规范化 + 校验参数（缺省填默认，供 CLI/API 入口统一） */
export function normalizeParams(partial: Partial<BacktestParams>): BacktestParams {
  const params: BacktestParams = {
    ...DEFAULT_BACKTEST_PARAMS,
    ...partial,
    start: partial.start ?? null,
    end: partial.end ?? null,
  };
  validateBacktestParams(params);
  return params;
}

/** 创建一条 queued run（尚未执行）。config/params 已在此校验。 */
export async function createRun(input: {
  name: string;
  userId?: string | null;
  config: ScreenerConfig;
  params: BacktestParams;
}): Promise<{ id: string }> {
  validateScreenerConfig(input.config);
  validateBacktestParams(input.params);
  const run = await prisma.backtestRun.create({
    data: {
      name: input.name.trim() || "未命名回测",
      userId: input.userId ?? null,
      strategyConfig: input.config as unknown as Prisma.InputJsonValue,
      params: input.params as unknown as Prisma.InputJsonValue,
      status: "queued",
    },
    select: { id: true },
  });
  return run;
}

/**
 * 执行一条 run 并落库。幂等保护：只处理 queued/failed 的 run。
 * 抛错不外泄——失败写入 status=failed + error 字段，调用方（fire-and-forget）无需 catch。
 */
export async function executeRun(
  runId: string,
  onProgress?: (p: BacktestProgress) => void,
): Promise<void> {
  const run = await prisma.backtestRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`run 不存在：${runId}`);

  await prisma.backtestRun.update({
    where: { id: runId },
    data: { status: "running", error: null },
  });

  try {
    const config = run.strategyConfig as unknown as ScreenerConfig;
    const params = run.params as unknown as BacktestParams;
    const exec = await executeBacktest(config, params, { onProgress });
    const { result } = exec;

    // 旧结果清理（重跑 failed run 时）
    await prisma.$transaction([
      prisma.backtestNav.deleteMany({ where: { runId } }),
      prisma.backtestPosition.deleteMany({ where: { runId } }),
    ]);

    for (let i = 0; i < result.nav.length; i += NAV_INSERT_CHUNK) {
      const chunk = result.nav.slice(i, i + NAV_INSERT_CHUNK);
      await prisma.backtestNav.createMany({
        data: chunk.map((p) => ({
          runId,
          date: new Date(`${p.date}T00:00:00.000Z`),
          nav: p.nav,
          benchNav: p.benchNav,
        })),
        skipDuplicates: true,
      });
    }
    for (let i = 0; i < result.positions.length; i += POSITION_INSERT_CHUNK) {
      const chunk = result.positions.slice(i, i + POSITION_INSERT_CHUNK);
      await prisma.backtestPosition.createMany({
        data: chunk.map((p) => ({
          runId,
          rebalanceDate: new Date(`${p.rebalanceDate}T00:00:00.000Z`),
          symbol: p.symbol,
          weight: p.weight,
          entryPrice: p.entryPrice,
          exitReason: p.exitReason,
        })),
      });
    }

    const summary: BacktestRunSummary = {
      effectiveStart: exec.effectiveStart,
      dataFloor: exec.dataFloor,
      rebalanceCount: exec.rebalanceCount,
      symbolCount: exec.symbolCount,
      periods: result.periods.map((p) => ({
        date: p.date,
        execDate: p.execDate,
        selected: p.selected,
        held: p.held,
        noPriceSkipped: p.noPriceSkipped,
        droppedNoWeight: p.droppedNoWeight,
        liquidated: p.liquidated,
        turnover: p.turnover,
        cost: p.cost,
        universeTotal: p.stats?.universeTotal ?? null,
        droppedNull: p.stats?.droppedNull ?? null,
        filteredOut: p.stats?.filteredOut ?? null,
        matched: p.stats?.matched ?? null,
        regime: p.regime,
        regimeBlocked: p.regimeBlocked,
      })),
    };

    await prisma.backtestRun.update({
      where: { id: runId },
      data: {
        status: "done",
        metrics: result.metrics as unknown as Prisma.InputJsonValue,
        summary: summary as unknown as Prisma.InputJsonValue,
        error: null,
        finishedAt: new Date(),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    await prisma.backtestRun.update({
      where: { id: runId },
      data: { status: "failed", error: message, finishedAt: new Date() },
    });
    throw e;
  }
}

/** 进程内 fire-and-forget 执行（API 用）：失败已落库，吞掉异常防 unhandledRejection。 */
export function executeRunInBackground(runId: string): void {
  void executeRun(runId).catch(() => {
    /* 失败已写入 status=failed；此处仅防未处理拒绝 */
  });
}

// ────────────────────────────────────────────────────────── 读取 / 序列化

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type RunListItem = {
  id: string;
  name: string;
  status: RunStatus;
  weighting: string;
  start: string | null;
  end: string | null;
  cagr: number | null;
  sharpe: number | null;
  maxDrawdown: number | null;
  createdAt: string;
  finishedAt: string | null;
  error: string | null;
};

/** run 列表（元信息 + 关键 metrics，不含逐日 NAV）。userId=null → 全部（CLI/管理）。 */
export async function listRuns(userId: string | null): Promise<RunListItem[]> {
  const runs = await prisma.backtestRun.findMany({
    where: userId ? { userId } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return runs.map((r) => {
    const m = (r.metrics ?? null) as { cagr?: number; sharpe?: number; maxDrawdown?: number } | null;
    const p = (r.params ?? {}) as { weighting?: string; start?: string | null; end?: string | null };
    return {
      id: r.id,
      name: r.name,
      status: r.status as RunStatus,
      weighting: p.weighting ?? "equal",
      start: p.start ?? null,
      end: p.end ?? null,
      cagr: m?.cagr ?? null,
      sharpe: m?.sharpe ?? null,
      maxDrawdown: m?.maxDrawdown ?? null,
      createdAt: r.createdAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      error: r.error,
    };
  });
}

export type RunDetail = {
  id: string;
  name: string;
  status: RunStatus;
  strategyConfig: ScreenerConfig;
  params: BacktestParams;
  metrics: Record<string, unknown> | null;
  summary: BacktestRunSummary | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  /** done 时附带完整曲线/持仓；running/queued/failed 时为空数组 */
  nav: { date: string; nav: number; benchNav: number | null }[];
  positions: {
    rebalanceDate: string;
    symbol: string;
    weight: number;
    entryPrice: number | null;
    exitReason: string | null;
  }[];
};

/**
 * run 详情。includeResults=false 时只回状态（轮询用，省去大表读取）。
 * 归属：run.userId 非空时须与 requesterId 一致，否则视为不存在（CLI run userId=null 公开可读）。
 */
export async function getRunDetail(
  runId: string,
  requesterId: string | null,
  includeResults: boolean,
): Promise<RunDetail | null> {
  const run = await prisma.backtestRun.findUnique({ where: { id: runId } });
  if (!run) return null;
  if (run.userId && run.userId !== requesterId) return null;

  let nav: RunDetail["nav"] = [];
  let positions: RunDetail["positions"] = [];
  if (includeResults && run.status === "done") {
    const [navRows, posRows] = await Promise.all([
      prisma.backtestNav.findMany({
        where: { runId },
        orderBy: { date: "asc" },
        select: { date: true, nav: true, benchNav: true },
      }),
      prisma.backtestPosition.findMany({
        where: { runId },
        orderBy: [{ rebalanceDate: "asc" }, { weight: "desc" }],
        select: { rebalanceDate: true, symbol: true, weight: true, entryPrice: true, exitReason: true },
      }),
    ]);
    nav = navRows.map((n) => ({ date: iso(n.date), nav: n.nav, benchNav: n.benchNav }));
    positions = posRows.map((p) => ({
      rebalanceDate: iso(p.rebalanceDate),
      symbol: p.symbol,
      weight: p.weight,
      entryPrice: p.entryPrice,
      exitReason: p.exitReason,
    }));
  }

  return {
    id: run.id,
    name: run.name,
    status: run.status as RunStatus,
    strategyConfig: run.strategyConfig as unknown as ScreenerConfig,
    params: run.params as unknown as BacktestParams,
    metrics: (run.metrics ?? null) as Record<string, unknown> | null,
    summary: (run.summary ?? null) as BacktestRunSummary | null,
    error: run.error,
    createdAt: run.createdAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    nav,
    positions,
  };
}

/** 删除 run（级联 nav/position）。归属校验同 getRunDetail。返回是否删除。 */
export async function deleteRun(runId: string, requesterId: string | null): Promise<boolean> {
  const run = await prisma.backtestRun.findUnique({
    where: { id: runId },
    select: { id: true, userId: true },
  });
  if (!run) return false;
  if (run.userId && run.userId !== requesterId) return false;
  await prisma.backtestRun.delete({ where: { id: runId } });
  return true;
}
