import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { listStoredRegimes } from "@/lib/quant/macroRegime";
import { spearmanIC } from "@/lib/quant/factorResearch";
import { getAdjustedCloseInWindowDbOnly } from "@/lib/equity/equityPriceStore";
import { getRegimeMacroVintageCoverage } from "@/lib/data/macroObservationVintages";
import {
  getSectorRegimeForwardStudy,
  SECTOR_REGIME_FORWARD_STUDY_VERSION,
  type SectorForwardHorizon,
  type SectorRegimeForwardStudyResponse,
} from "@/lib/equity/sectorRegimeForwardStudy";

export const SECTOR_REGIME_LIVE_PROTOCOL_VERSION = "stage-g-v1";
const OUTCOME_PRICE_TOLERANCE_DAYS = 7;
const TOP_BUCKET_SIZE = 3;

function iso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function plusDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 86_400_000);
}

export function addMonthsUtc(value: Date, months: number): Date {
  const result = new Date(value.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const monthEnd = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, monthEnd));
  return result;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

type SnapshotDraft = {
  signalDate: Date;
  returnStartDate: Date;
  frozenAt: Date;
  modelVersion: string;
  signalHash: string;
  regime: string;
  growthDirection: string | null;
  inflationState: string | null;
  inputs: Record<string, unknown>;
  methodology: Record<string, unknown>;
  forecasts: Array<{
    horizonMonths: number;
    targetDate: Date;
    sector: string;
    etf: string;
    rank: number;
    score: number;
    modelId: string;
    selectionPassed: boolean;
  }>;
};

async function buildSnapshotDraft(
  study: SectorRegimeForwardStudyResponse,
  frozenAt: Date,
): Promise<SnapshotDraft> {
  if (!study.current) throw new Error("当前 Regime 行业排序为空，无法冻结信号");
  const current = study.current;
  const [regime] = await listStoredRegimes({
    start: current.signalDate,
    end: current.signalDate,
  });
  if (!regime || !regime.dalioRegime) {
    throw new Error(`缺少 ${current.signalDate} 的可冻结 MacroRegime`);
  }

  // 当天日线可能在冻结前已知，也可能尚未收盘；统一从次日及之后第一根收盘价开始计分。
  const returnStartDate = plusDays(date(iso(frozenAt)), 1);
  const inputs: Record<string, unknown> = {
    signalDate: current.signalDate,
    regime: {
      date: regime.date,
      growthState: regime.growthState,
      growthDirection: regime.growthDirection,
      inflationState: regime.inflationState,
      regime: regime.regime,
      dalioRegime: regime.dalioRegime,
      inputs: regime.inputs,
    },
    horizons: current.horizons.map((horizon) => ({
      horizonMonths: horizon.horizonMonths,
      modelId: horizon.modelId,
      modelLabel: horizon.modelLabel,
      selectionPassed: horizon.selectionPassed,
      trainingLabelCutoff: horizon.trainingLabelCutoff,
      rankings: horizon.rankings.map((row) => ({
        rank: row.rank,
        sector: row.sector,
        etf: row.etf,
        score: row.score,
      })),
    })),
  };
  const methodology: Record<string, unknown> = {
    protocolVersion: SECTOR_REGIME_LIVE_PROTOCOL_VERSION,
    predictionWriteRule: "modelVersion × signalDate 首次写入后不覆盖",
    resultWriteRule: "targetDate 到期且 entry/exit/SPY/行业价格齐备后仅写一次",
    returnStartRule: "冻结日次日起第一根可得收盘价，禁止计入冻结前行情",
    returnEndRule: `目标日前最后一根收盘价，最多回看 ${OUTCOME_PRICE_TOLERANCE_DAYS} 个自然日`,
    returnTarget: "Sector SPDR 复权总收益 − SPY 复权总收益",
    primaryRule: "仅 selectionPassed=true 的验证集锁定模型计入主要证据；失败复核窗口单列",
    scoreRule: "Spearman(score, realized excess return)、Top 3 胜率/均值及 Top−Bottom",
    inferenceUpgradeRule: "至少 36 个独立月度冻结信号，并以预注册统计门槛重新评估",
  };
  const contract = {
    modelVersion: study.version,
    protocolVersion: SECTOR_REGIME_LIVE_PROTOCOL_VERSION,
    inputs,
    methodology,
  };
  return {
    signalDate: date(current.signalDate),
    returnStartDate,
    frozenAt,
    modelVersion: study.version,
    signalHash: stableHash(contract),
    regime: regime.dalioRegime,
    growthDirection: regime.growthDirection,
    inflationState: regime.inflationState,
    inputs,
    methodology,
    forecasts: current.horizons.flatMap((horizon) =>
      horizon.rankings.map((row) => ({
        horizonMonths: horizon.horizonMonths,
        targetDate: addMonthsUtc(returnStartDate, horizon.horizonMonths),
        sector: row.sector,
        etf: row.etf,
        rank: row.rank,
        score: row.score,
        modelId: horizon.modelId,
        selectionPassed: horizon.selectionPassed,
      })),
    ),
  };
}

export type FreezeSectorRegimeSignalResult = {
  id: string;
  signalDate: string;
  returnStartDate: string;
  frozenAt: string;
  created: boolean;
  driftDetected: boolean;
  forecasts: number;
  signalHash: string;
};

export async function freezeCurrentSectorRegimeSignal(options: {
  now?: Date;
} = {}): Promise<FreezeSectorRegimeSignalResult> {
  const study = await getSectorRegimeForwardStudy();
  const draft = await buildSnapshotDraft(study, options.now ?? new Date());
  const where = {
    signalDate_modelVersion: {
      signalDate: draft.signalDate,
      modelVersion: draft.modelVersion,
    },
  } as const;
  const existing = await prisma.sectorRegimeSignalSnapshot.findUnique({
    where,
    include: { _count: { select: { forecasts: true } } },
  });
  if (existing) {
    return {
      id: existing.id,
      signalDate: iso(existing.signalDate),
      returnStartDate: iso(existing.returnStartDate),
      frozenAt: existing.frozenAt.toISOString(),
      created: false,
      driftDetected: existing.signalHash !== draft.signalHash,
      forecasts: existing._count.forecasts,
      signalHash: existing.signalHash,
    };
  }

  try {
    const created = await prisma.sectorRegimeSignalSnapshot.create({
      data: {
        signalDate: draft.signalDate,
        returnStartDate: draft.returnStartDate,
        frozenAt: draft.frozenAt,
        modelVersion: draft.modelVersion,
        protocolVersion: SECTOR_REGIME_LIVE_PROTOCOL_VERSION,
        signalHash: draft.signalHash,
        regime: draft.regime,
        growthDirection: draft.growthDirection,
        inflationState: draft.inflationState,
        vintageMode: "live-frozen",
        processGrade: "B",
        evidenceGrade: "C",
        inputs: draft.inputs as Prisma.InputJsonValue,
        methodology: draft.methodology as Prisma.InputJsonValue,
        forecasts: {
          create: draft.forecasts,
        },
      },
      include: { _count: { select: { forecasts: true } } },
    });
    return {
      id: created.id,
      signalDate: iso(created.signalDate),
      returnStartDate: iso(created.returnStartDate),
      frozenAt: created.frozenAt.toISOString(),
      created: true,
      driftDetected: false,
      forecasts: created._count.forecasts,
      signalHash: created.signalHash,
    };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    return freezeCurrentSectorRegimeSignal(options);
  }
}

export type EvaluateSectorRegimeSignalsResult = {
  eligible: number;
  evaluated: number;
  missingPrices: number;
};

export async function evaluateMaturedSectorRegimeSignals(options: {
  now?: Date;
} = {}): Promise<EvaluateSectorRegimeSignalsResult> {
  const now = options.now ?? new Date();
  const today = date(iso(now));
  const forecasts = await prisma.sectorRegimeForecast.findMany({
    where: { evaluatedAt: null, targetDate: { lte: today } },
    include: { snapshot: { select: { returnStartDate: true } } },
    orderBy: [{ targetDate: "asc" }, { rank: "asc" }],
  });
  let evaluated = 0;
  let missingPrices = 0;
  for (const forecast of forecasts) {
    const entryTo = plusDays(forecast.snapshot.returnStartDate, OUTCOME_PRICE_TOLERANCE_DAYS);
    const exitFrom = plusDays(forecast.targetDate, -OUTCOME_PRICE_TOLERANCE_DAYS);
    const [entry, exit, benchmarkEntry, benchmarkExit] = await Promise.all([
      getAdjustedCloseInWindowDbOnly({
        symbol: forecast.etf,
        from: forecast.snapshot.returnStartDate,
        to: entryTo,
        prefer: "earliest",
      }),
      getAdjustedCloseInWindowDbOnly({
        symbol: forecast.etf,
        from: exitFrom,
        to: forecast.targetDate,
        prefer: "latest",
      }),
      getAdjustedCloseInWindowDbOnly({
        symbol: "SPY",
        from: forecast.snapshot.returnStartDate,
        to: entryTo,
        prefer: "earliest",
      }),
      getAdjustedCloseInWindowDbOnly({
        symbol: "SPY",
        from: exitFrom,
        to: forecast.targetDate,
        prefer: "latest",
      }),
    ]);
    if (!entry || !exit || !benchmarkEntry || !benchmarkExit || exit.date <= entry.date) {
      missingPrices += 1;
      continue;
    }
    const sectorReturn = exit.adjClose / entry.adjClose - 1;
    const benchmarkReturn = benchmarkExit.adjClose / benchmarkEntry.adjClose - 1;
    const excessReturn = sectorReturn - benchmarkReturn;
    const outcome = {
      entryTradeDate: iso(entry.date),
      exitTradeDate: iso(exit.date),
      sectorReturn,
      benchmarkReturn,
      excessReturn,
    };
    const result = await prisma.sectorRegimeForecast.updateMany({
      where: { id: forecast.id, evaluatedAt: null },
      data: {
        entryTradeDate: entry.date,
        exitTradeDate: exit.date,
        sectorReturn,
        benchmarkReturn,
        excessReturn,
        outcomeHash: stableHash(outcome),
        evaluatedAt: now,
      },
    });
    evaluated += result.count;
  }
  return { eligible: forecasts.length, evaluated, missingPrices };
}

export type LiveLedgerHorizonSummary = {
  horizonMonths: number;
  modelId: string;
  selectionPassed: boolean;
  targetDate: string;
  status: "pending" | "partial" | "scored";
  evaluated: number;
  total: number;
  meanIc: number | null;
  top3HitRate: number | null;
  meanTop3Excess: number | null;
  topBottomSpread: number | null;
  rankings: Array<{
    rank: number;
    sector: string;
    etf: string;
    score: number;
    excessReturn: number | null;
  }>;
};

function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function summarizeForecastHorizon(rows: readonly {
  horizonMonths: number;
  targetDate: Date;
  sector: string;
  etf: string;
  rank: number;
  score: number;
  modelId: string;
  selectionPassed: boolean;
  excessReturn: number | null;
  evaluatedAt: Date | null;
}[]): LiveLedgerHorizonSummary | null {
  const first = rows[0];
  if (!first) return null;
  const ordered = [...rows].sort((left, right) => left.rank - right.rank);
  const completed = ordered.filter(
    (row): row is typeof row & { excessReturn: number; evaluatedAt: Date } =>
      row.evaluatedAt != null && row.excessReturn != null && Number.isFinite(row.excessReturn),
  );
  const fullyScored = completed.length === ordered.length;
  const top = completed.filter((row) => row.rank <= TOP_BUCKET_SIZE);
  const bottom = completed.filter((row) => row.rank > ordered.length - TOP_BUCKET_SIZE);
  return {
    horizonMonths: first.horizonMonths,
    modelId: first.modelId,
    selectionPassed: first.selectionPassed,
    targetDate: iso(first.targetDate),
    status: fullyScored ? "scored" : completed.length ? "partial" : "pending",
    evaluated: completed.length,
    total: ordered.length,
    meanIc: fullyScored ? spearmanIC(ordered.map((row) => row.score), ordered.map((row) => row.excessReturn!)) : null,
    top3HitRate: top.length ? top.filter((row) => row.excessReturn > 0).length / top.length : null,
    meanTop3Excess: mean(top.map((row) => row.excessReturn)),
    topBottomSpread: top.length && bottom.length
      ? (mean(top.map((row) => row.excessReturn)) ?? 0) - (mean(bottom.map((row) => row.excessReturn)) ?? 0)
      : null,
    rankings: ordered.map((row) => ({
      rank: row.rank,
      sector: row.sector,
      etf: row.etf,
      score: row.score,
      excessReturn: row.excessReturn,
    })),
  };
}

export type SectorRegimeLiveLedgerResponse = {
  protocolVersion: string;
  generatedAt: string;
  status: {
    processGrade: "B";
    inferenceGrade: "C";
    label: string;
    frozenSignals: number;
    scoredPrimarySignals: number;
    requiredForUpgrade: number;
  };
  vintageCoverage: {
    trackedInputs: number;
    capturedInputs: number;
    alfredInputs: number;
    vintageRows: number;
    officialNote: string;
  };
  snapshots: Array<{
    id: string;
    signalDate: string;
    returnStartDate: string;
    frozenAt: string;
    modelVersion: string;
    signalHash: string;
    regime: string;
    processGrade: string;
    evidenceGrade: string;
    horizons: LiveLedgerHorizonSummary[];
  }>;
  protocol: {
    predictionLock: string;
    outcomeLock: string;
    scoring: string;
    automation: string;
  };
};

export async function getSectorRegimeLiveLedger(): Promise<SectorRegimeLiveLedgerResponse> {
  const [snapshots, vintageCoverage] = await Promise.all([
    prisma.sectorRegimeSignalSnapshot.findMany({
      include: { forecasts: { orderBy: [{ horizonMonths: "asc" }, { rank: "asc" }] } },
      orderBy: { frozenAt: "desc" },
      take: 36,
    }),
    getRegimeMacroVintageCoverage(),
  ]);
  const serialized = snapshots.map((snapshot) => {
    const byHorizon = new Map<number, typeof snapshot.forecasts>();
    for (const forecast of snapshot.forecasts) {
      const rows = byHorizon.get(forecast.horizonMonths) ?? [];
      rows.push(forecast);
      byHorizon.set(forecast.horizonMonths, rows);
    }
    return {
      id: snapshot.id,
      signalDate: iso(snapshot.signalDate),
      returnStartDate: iso(snapshot.returnStartDate),
      frozenAt: snapshot.frozenAt.toISOString(),
      modelVersion: snapshot.modelVersion,
      signalHash: snapshot.signalHash,
      regime: snapshot.regime,
      processGrade: snapshot.processGrade,
      evidenceGrade: snapshot.evidenceGrade,
      horizons: [...byHorizon.values()].flatMap((rows) => {
        const summary = summarizeForecastHorizon(rows);
        return summary ? [summary] : [];
      }),
    };
  });
  const scoredPrimarySignals = serialized.reduce(
    (count, snapshot) => count + snapshot.horizons.filter(
      (horizon) => horizon.selectionPassed && horizon.status === "scored",
    ).length,
    0,
  );
  return {
    protocolVersion: SECTOR_REGIME_LIVE_PROTOCOL_VERSION,
    generatedAt: new Date().toISOString(),
    status: {
      processGrade: "B",
      inferenceGrade: "C",
      label: snapshots.length ? "真实前瞻观察中" : "等待首次冻结",
      frozenSignals: snapshots.length,
      scoredPrimarySignals,
      requiredForUpgrade: 36,
    },
    vintageCoverage: {
      trackedInputs: vintageCoverage.trackedInputs,
      capturedInputs: vintageCoverage.capturedInputs,
      alfredInputs: vintageCoverage.alfredInputs,
      vintageRows: vintageCoverage.vintageRows,
      officialNote: "FRED 输入可用 ALFRED 官方 vintage；ISM 暂从本系统首次捕获日起留痕。",
    },
    snapshots: serialized,
    protocol: {
      predictionLock: "每个模型版本 × 数据归属月只接受首次写入；宏观/因子修订不会回写旧预测。",
      outcomeLock: "3/6/12 个月分别到期，价格齐备后只结算一次；结果哈希永久保留。",
      scoring: "主证据只统计验证集通过的模型；IC、Top 3 胜率、Top 3 超额和首尾差同步报告。",
      automation: "建议每个交易日冻结新信号并结算到期项；命令是 equity:run-sector-regime-ledger。",
    },
  };
}

export const LIVE_LEDGER_MODEL_VERSION = SECTOR_REGIME_FORWARD_STUDY_VERSION;
