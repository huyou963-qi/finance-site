import { prisma } from "@/lib/prisma";
import { REGIME_CODES } from "@/lib/quant/macroRegime";
import { fetchFredVintages } from "@/lib/data/scheduler/adapters/fredAdapter";
import { appendMacroObservationVintages } from "@/lib/data/scheduler/observationVintages";

export const REGIME_FRED_VINTAGE_CODES = [
  REGIME_CODES.indpro,
  REGIME_CODES.payems,
  REGIME_CODES.income,
  REGIME_CODES.cpi,
  REGIME_CODES.pce,
  REGIME_CODES.usrec,
] as const;

export const REGIME_VINTAGE_INPUT_CODES = [
  REGIME_CODES.indpro,
  REGIME_CODES.payems,
  REGIME_CODES.income,
  REGIME_CODES.ism,
  REGIME_CODES.ismSvc,
  REGIME_CODES.cpi,
  REGIME_CODES.pce,
] as const;

/** FRED 官方 real-time max；避免亚洲已跨日而 FRED 服务器仍处前一 UTC 日时请求失败。 */
export const FRED_REALTIME_MAX = "9999-12-31";

export type SyncFredMacroVintagesResult = {
  realtimeStart: string;
  realtimeEnd: string;
  series: Array<{
    code: string;
    seriesId: string;
    fetchedRows: number;
    parsedVintages: number;
    insertedVintages: number;
  }>;
  insertedVintages: number;
};

/**
 * 任意已登记 FRED Instrument 的版本回填编排器。
 * HTTP/协议属于统一 FRED adapter，版本落库属于统一 append writer；这里仅选择序列并编排。
 */
export async function syncFredMacroVintages(options: {
  instrumentCodes: readonly string[];
  realtimeStart?: string;
  realtimeEnd?: string;
  apiKey?: string;
}): Promise<SyncFredMacroVintagesResult> {
  const apiKey = options.apiKey ?? process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("缺少 FRED_API_KEY，无法同步 ALFRED vintage");
  const realtimeStart = options.realtimeStart ?? "1990-01-01";
  const realtimeEnd = options.realtimeEnd ?? FRED_REALTIME_MAX;
  const instruments = await prisma.instrument.findMany({
    where: { code: { in: [...options.instrumentCodes] }, fredSeriesId: { not: null } },
    select: { id: true, code: true, fredSeriesId: true },
    orderBy: { code: "asc" },
  });
  const series: SyncFredMacroVintagesResult["series"] = [];
  for (const instrument of instruments) {
    const seriesId = instrument.fredSeriesId!;
    const fetched = await fetchFredVintages({
      apiKey,
      seriesId,
      realtimeStart,
      realtimeEnd,
    });
    const insertedVintages = await appendMacroObservationVintages(
      prisma,
      fetched.vintages.map((row) => ({
        instrumentId: instrument.id,
        obsDate: row.obsDate,
        availableAt: row.availableAt,
        realtimeStart: row.realtimeStart,
        realtimeEnd: row.realtimeEnd,
        value: row.value,
        source: "alfred",
        sourceSeriesId: seriesId,
        isInitialRelease: row.isInitialRelease,
      })),
    );
    series.push({
      code: instrument.code,
      seriesId,
      fetchedRows: fetched.sourceRows,
      parsedVintages: fetched.vintages.length,
      insertedVintages,
    });
  }
  return {
    realtimeStart,
    realtimeEnd,
    series,
    insertedVintages: series.reduce((sum, row) => sum + row.insertedVintages, 0),
  };
}

/** 行业 Regime 是通用 FRED vintage 编排器的一组预登记消费者，不再拥有独立抓取链。 */
export async function syncRegimeMacroVintages(options: {
  realtimeStart?: string;
  realtimeEnd?: string;
  apiKey?: string;
} = {}): Promise<SyncFredMacroVintagesResult> {
  return syncFredMacroVintages({
    instrumentCodes: REGIME_FRED_VINTAGE_CODES,
    ...options,
  });
}

export type RegimeMacroVintageInputHealth = {
  code: string;
  instrumentId: string;
  alfredEligible: boolean;
  hasAlfredHistory: boolean;
  latestObservationDate: string | null;
  latestObservationValue: number | null;
  latestVintageDate: string | null;
  latestVintageAvailableAt: string | null;
  latestVintageValue: number | null;
  latestVintageSource: string | null;
  currentObservationCovered: boolean;
  currentValueMatches: boolean;
};

export type RegimeMacroVintageCoverage = {
  trackedInputs: number;
  capturedInputs: number;
  alfredInputs: number;
  vintageRows: number;
  currentCoveredInputs: number;
  currentMatchingInputs: number;
  inputs: RegimeMacroVintageInputHealth[];
};

export type BootstrapRegimeCurrentVintagesResult = {
  capturedAt: string;
  examinedInputs: number;
  projectedInputs: number;
  insertedVintages: number;
  projections: Array<{
    code: string;
    obsDate: string;
    value: number;
    previousValue: number | null;
  }>;
};

/**
 * 首次启用版本账本时，为当时确实可见的“当前快表值”建立一个保守的时间锚点。
 * 这不是历史回填：availableAt 永远是实际执行时刻，不会把当前值伪装成更早已知。
 * 后续变化仍由统一 observation writer 捕获；ALFRED 官方历史仍由统一 adapter 回填。
 */
export async function bootstrapRegimeCurrentVintages(options: {
  capturedAt?: Date;
} = {}): Promise<BootstrapRegimeCurrentVintagesResult> {
  const capturedAt = options.capturedAt ?? new Date();
  const instruments = await prisma.instrument.findMany({
    where: { code: { in: [...REGIME_VINTAGE_INPUT_CODES] } },
    select: { id: true, code: true, fredSeriesId: true },
    orderBy: { code: "asc" },
  });
  const projections: BootstrapRegimeCurrentVintagesResult["projections"] = [];
  const rows = [];
  for (const instrument of instruments) {
    const latestObservation = await prisma.macroObservation.findFirst({
      where: { instrumentId: instrument.id },
      orderBy: { obsDate: "desc" },
      select: { obsDate: true, value: true },
    });
    if (!latestObservation) continue;
    const latestVintage = await prisma.macroObservationVintage.findFirst({
      where: { instrumentId: instrument.id, obsDate: latestObservation.obsDate },
      orderBy: { availableAt: "desc" },
      select: { value: true },
    });
    if (latestVintage && Math.abs(latestVintage.value - latestObservation.value) <= 1e-10) {
      continue;
    }
    rows.push({
      instrumentId: instrument.id,
      obsDate: latestObservation.obsDate,
      availableAt: capturedAt,
      value: latestObservation.value,
      source: "stage_h_bootstrap",
      sourceSeriesId: instrument.fredSeriesId ?? instrument.code,
      isInitialRelease: false,
      metadata: {
        reason: "initial_current_projection",
        semantics: "value_observed_at_bootstrap_time_not_historical_release_time",
      },
    });
    projections.push({
      code: instrument.code,
      obsDate: latestObservation.obsDate.toISOString().slice(0, 10),
      value: latestObservation.value,
      previousValue: latestVintage?.value ?? null,
    });
  }
  const insertedVintages = await appendMacroObservationVintages(prisma, rows);
  return {
    capturedAt: capturedAt.toISOString(),
    examinedInputs: instruments.length,
    projectedInputs: projections.length,
    insertedVintages,
    projections,
  };
}

/** Regime 所有消费者共用的版本覆盖审计，不在页面与运维脚本分别重写覆盖口径。 */
export async function getRegimeMacroVintageCoverage(): Promise<RegimeMacroVintageCoverage> {
  const instruments = await prisma.instrument.findMany({
    where: { code: { in: [...REGIME_VINTAGE_INPUT_CODES] } },
    select: { id: true, code: true },
    orderBy: { code: "asc" },
  });
  const [sources, vintageRows, inputs] = await Promise.all([
    prisma.macroObservationVintage.findMany({
      where: { instrumentId: { in: instruments.map((row) => row.id) } },
      select: { instrumentId: true, source: true },
      distinct: ["instrumentId", "source"],
    }),
    prisma.macroObservationVintage.count({
      where: { instrumentId: { in: instruments.map((row) => row.id) } },
    }),
    Promise.all(instruments.map(async (instrument): Promise<RegimeMacroVintageInputHealth> => {
      const latestObservation = await prisma.macroObservation.findFirst({
        where: { instrumentId: instrument.id },
        orderBy: { obsDate: "desc" },
        select: { obsDate: true, value: true },
      });
      const latestVintage = latestObservation
        ? await prisma.macroObservationVintage.findFirst({
            where: { instrumentId: instrument.id, obsDate: latestObservation.obsDate },
            orderBy: { availableAt: "desc" },
            select: { obsDate: true, availableAt: true, value: true, source: true },
          })
        : null;
      const currentValueMatches = Boolean(
        latestObservation
        && latestVintage
        && Math.abs(latestObservation.value - latestVintage.value) <= 1e-10,
      );
      return {
        code: instrument.code,
        instrumentId: instrument.id,
        alfredEligible: (REGIME_FRED_VINTAGE_CODES as readonly string[]).includes(instrument.code),
        hasAlfredHistory: false,
        latestObservationDate: latestObservation?.obsDate.toISOString().slice(0, 10) ?? null,
        latestObservationValue: latestObservation?.value ?? null,
        latestVintageDate: latestVintage?.obsDate.toISOString().slice(0, 10) ?? null,
        latestVintageAvailableAt: latestVintage?.availableAt.toISOString() ?? null,
        latestVintageValue: latestVintage?.value ?? null,
        latestVintageSource: latestVintage?.source ?? null,
        currentObservationCovered: latestVintage != null,
        currentValueMatches,
      };
    })),
  ]);
  const capturedIds = new Set(sources.map((row) => row.instrumentId));
  const alfredIds = new Set(
    sources.filter((row) => row.source === "alfred").map((row) => row.instrumentId),
  );
  const enrichedInputs = inputs.map((row) => ({
    ...row,
    hasAlfredHistory: alfredIds.has(row.instrumentId),
  }));
  return {
    trackedInputs: instruments.length,
    capturedInputs: capturedIds.size,
    alfredInputs: alfredIds.size,
    vintageRows,
    currentCoveredInputs: enrichedInputs.filter((row) => row.currentObservationCovered).length,
    currentMatchingInputs: enrichedInputs.filter((row) => row.currentValueMatches).length,
    inputs: enrichedInputs,
  };
}
