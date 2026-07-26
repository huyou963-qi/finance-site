/**
 * 稳健性分析 run 的创建 / 执行 / 持久化（P2 WS3 共享层）。
 * CLI 与 API（/api/equity/robustness）共用，「进程内异步执行 + 落库」单一来源，仿 Phase 3 backtestRuns。
 *
 * 生命周期：queued →（executeRun）running → done | failed。
 * 结果整存 mds.robustness_run.result（JSON，已月末降采样，体量可控，不另拆表）。
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  DEFAULT_BACKTEST_PARAMS,
  validateBacktestParams,
  type BacktestParams,
} from "@/lib/quant/backtest";
import { validateScreenerConfig, type ScreenerConfig } from "@/lib/quant/screener";
import {
  executeRobustness,
  type RobustnessExecution,
  type RobustnessMode,
  type RobustnessProgress,
  type RobustnessSpec,
} from "@/lib/quant/robustnessData";

export type RunStatus = "queued" | "running" | "done" | "failed";

/** 列表页头条摘要（免拉完整 result） */
export type RobustnessRunSummary = {
  mode: RobustnessMode;
  gridSize: number;
  rebalanceCount: number;
  symbolCount: number;
  /** scan：最优点年化夏普；oos：赢家 OOS 年化夏普；walkforward：拼接曲线年化夏普 */
  headlineSharpe: number | null;
  /** DSR（scan/oos 有）；扣多重检验后是否显著 */
  dsr: number | null;
  dsrSignificant: boolean | null;
  /** oos：样本外是否崩溃 */
  oosCollapsed: boolean | null;
};

/** 规范化回测参数（缺省填默认） */
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

const VALID_MODES: RobustnessMode[] = ["scan", "oos", "walkforward"];

/** 校验 spec 的基本形状（axes 数量/取值、mode 合法等，深校验在 executeRobustness/buildGrid） */
export function validateSpec(spec: RobustnessSpec): void {
  if (!VALID_MODES.includes(spec.mode)) throw new Error(`未知 mode：${spec.mode}`);
  if (spec.axes != null && !Array.isArray(spec.axes)) throw new Error("axes 必须是数组");
  if (spec.mode === "oos" && spec.splitDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(spec.splitDate)) {
    throw new Error(`splitDate 格式应为 YYYY-MM-DD：${spec.splitDate}`);
  }
  if (spec.mode === "walkforward") {
    if (spec.folds != null && (!Number.isInteger(spec.folds) || spec.folds < 1 || spec.folds > 12)) {
      throw new Error("folds 须为 1–12 的整数");
    }
    if (
      spec.minTrainPeriods != null &&
      (!Number.isInteger(spec.minTrainPeriods) || spec.minTrainPeriods < 6)
    ) {
      throw new Error("minTrainPeriods 至少 6");
    }
  }
}

/** 创建一条 queued run（尚未执行）。config/params/spec 已在此校验。 */
export async function createRun(input: {
  name: string;
  userId?: string | null;
  config: ScreenerConfig;
  params: BacktestParams;
  spec: RobustnessSpec;
}): Promise<{ id: string }> {
  validateScreenerConfig(input.config);
  validateBacktestParams(input.params);
  validateSpec(input.spec);
  const run = await prisma.robustnessRun.create({
    data: {
      name: input.name.trim() || "未命名稳健性分析",
      userId: input.userId ?? null,
      mode: input.spec.mode,
      strategyConfig: input.config as unknown as Prisma.InputJsonValue,
      params: input.params as unknown as Prisma.InputJsonValue,
      spec: input.spec as unknown as Prisma.InputJsonValue,
      status: "queued",
    },
    select: { id: true },
  });
  return run;
}

function summarize(exec: RobustnessExecution): RobustnessRunSummary {
  let headlineSharpe: number | null = null;
  let dsr: number | null = null;
  let dsrSignificant: boolean | null = null;
  let oosCollapsed: boolean | null = null;
  if (exec.scan) {
    const best = exec.scan.bestIndex != null ? exec.scan.points[exec.scan.bestIndex] : null;
    headlineSharpe = best?.metrics?.sharpeAnnual ?? null;
    dsr = exec.scan.deflated?.dsr ?? null;
    dsrSignificant = exec.scan.deflated?.significant ?? null;
  } else if (exec.oos) {
    headlineSharpe = exec.oos.oosMetrics?.sharpeAnnual ?? null;
    dsr = exec.oos.deflated?.dsr ?? null;
    dsrSignificant = exec.oos.deflated?.significant ?? null;
    oosCollapsed = exec.oos.degradation?.collapsed ?? null;
  } else if (exec.walkforward) {
    headlineSharpe = exec.walkforward.overallMetrics?.sharpe ?? null;
  }
  return {
    mode: exec.mode,
    gridSize: exec.gridSize,
    rebalanceCount: exec.rebalanceCount,
    symbolCount: exec.symbolCount,
    headlineSharpe,
    dsr,
    dsrSignificant,
    oosCollapsed,
  };
}

/**
 * 执行一条 run 并落库。抛错不外泄——失败写 status=failed + error，调用方（fire-and-forget）无需 catch。
 */
export async function executeRun(
  runId: string,
  onProgress?: (p: RobustnessProgress) => void,
): Promise<void> {
  const run = await prisma.robustnessRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`run 不存在：${runId}`);

  await prisma.robustnessRun.update({
    where: { id: runId },
    data: { status: "running", error: null },
  });

  try {
    const config = run.strategyConfig as unknown as ScreenerConfig;
    const params = run.params as unknown as BacktestParams;
    const spec = run.spec as unknown as RobustnessSpec;
    const exec = await executeRobustness(config, params, spec, onProgress);
    await prisma.robustnessRun.update({
      where: { id: runId },
      data: {
        status: "done",
        result: exec as unknown as Prisma.InputJsonValue,
        summary: summarize(exec) as unknown as Prisma.InputJsonValue,
        error: null,
        finishedAt: new Date(),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    await prisma.robustnessRun.update({
      where: { id: runId },
      data: { status: "failed", error: message, finishedAt: new Date() },
    });
    throw e;
  }
}

/** 进程内 fire-and-forget 执行（API 用）：失败已落库，吞异常防 unhandledRejection。 */
export function executeRunInBackground(runId: string): void {
  void executeRun(runId).catch(() => {
    /* 失败已写入 status=failed */
  });
}

// ────────────────────────────────────────────────────────── 读取

export type RunListItem = {
  id: string;
  name: string;
  mode: RobustnessMode;
  status: RunStatus;
  summary: RobustnessRunSummary | null;
  createdAt: string;
  finishedAt: string | null;
  error: string | null;
};

/** run 列表（元信息 + summary，不含完整 result）。userId=null → 全部（CLI/管理）。 */
export async function listRuns(userId: string | null): Promise<RunListItem[]> {
  const runs = await prisma.robustnessRun.findMany({
    where: userId ? { userId } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      mode: true,
      status: true,
      summary: true,
      createdAt: true,
      finishedAt: true,
      error: true,
    },
  });
  return runs.map((r) => ({
    id: r.id,
    name: r.name,
    mode: r.mode as RobustnessMode,
    status: r.status as RunStatus,
    summary: (r.summary ?? null) as RobustnessRunSummary | null,
    createdAt: r.createdAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    error: r.error,
  }));
}

export type RunDetail = {
  id: string;
  name: string;
  mode: RobustnessMode;
  status: RunStatus;
  strategyConfig: ScreenerConfig;
  params: BacktestParams;
  spec: RobustnessSpec;
  summary: RobustnessRunSummary | null;
  /** done 时的完整 RobustnessExecution 结果 */
  result: RobustnessExecution | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
};

/**
 * run 详情。includeResult=false 时省去大 result 字段（轮询用）。
 * 归属：run.userId 非空时须与 requesterId 一致（CLI run userId=null 公开可读）。
 */
export async function getRunDetail(
  runId: string,
  requesterId: string | null,
  includeResult: boolean,
): Promise<RunDetail | null> {
  const run = await prisma.robustnessRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      userId: true,
      name: true,
      mode: true,
      status: true,
      strategyConfig: true,
      params: true,
      spec: true,
      summary: true,
      result: includeResult,
      error: true,
      createdAt: true,
      finishedAt: true,
    },
  });
  if (!run) return null;
  if (run.userId && run.userId !== requesterId) return null;
  return {
    id: run.id,
    name: run.name,
    mode: run.mode as RobustnessMode,
    status: run.status as RunStatus,
    strategyConfig: run.strategyConfig as unknown as ScreenerConfig,
    params: run.params as unknown as BacktestParams,
    spec: run.spec as unknown as RobustnessSpec,
    summary: (run.summary ?? null) as RobustnessRunSummary | null,
    result: includeResult ? ((run.result ?? null) as RobustnessExecution | null) : null,
    error: run.error,
    createdAt: run.createdAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
  };
}

/** 删除 run。归属校验同 getRunDetail。返回是否删除。 */
export async function deleteRun(runId: string, requesterId: string | null): Promise<boolean> {
  const run = await prisma.robustnessRun.findUnique({
    where: { id: runId },
    select: { id: true, userId: true },
  });
  if (!run) return false;
  if (run.userId && run.userId !== requesterId) return false;
  await prisma.robustnessRun.delete({ where: { id: runId } });
  return true;
}
