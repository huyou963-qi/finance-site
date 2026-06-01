import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import { BarSizeSetting, EventName, SecType, WhatToShow } from "@stoqey/ib";
import type { Contract, IBApi } from "@stoqey/ib";
import { clearKlineServerDebugRing, klineDebugLog } from "@/lib/data/klineDebug";
import {
  barMsForInterval,
  clampKlineLimit,
  isKlineInterval,
  lookbackMs,
  type KlineInterval,
} from "@/lib/data/klineShared";
import type { KlinePayload } from "@/lib/data/types";
import { parseIbkrTwsBarTimeToUnix } from "@/lib/data/ibkrTwsBarTime";
import { tryResolveFutConidViaCp } from "@/lib/data/ibkrCpSecdefOptional";
import {
  buildIbkrTwsContractForKlineFetch,
  ibMonthToContractMonth,
  isIbkrContinuousFutChartSymbol,
  type IbkrTwsContractSpec,
} from "@/lib/data/ibkrTwsContract";
import {
  generateListedIbMonthsForRoot,
  pickIbFutMonthForAsOf,
} from "@/lib/data/ibkrFuturesMonth";
import { getIbkrTwsConnectionOptions } from "@/lib/data/ibkrApiConfig";
import { qualifyTwsFutContract } from "@/lib/data/ibkrTwsQualifyContract";
import { withIbkrTwsApi } from "@/lib/data/ibkrTwsConnection";
import type { FetchIbkrKlinesOptions } from "@/lib/data/ibkrKlines";

let nextReqId = 9000;

function allocReqId(): number {
  nextReqId += 1;
  return nextReqId;
}

function barSizeForInterval(interval: KlineInterval): BarSizeSetting {
  switch (interval) {
    case "15m":
      return BarSizeSetting.MINUTES_FIFTEEN;
    case "1h":
      return BarSizeSetting.HOURS_ONE;
    case "4h":
      return BarSizeSetting.HOURS_FOUR;
    case "1d":
      return BarSizeSetting.DAYS_ONE;
    case "1w":
      return BarSizeSetting.WEEKS_ONE;
    default:
      return BarSizeSetting.DAYS_ONE;
  }
}

function durationStrForLimit(
  interval: KlineInterval,
  limit: number,
  contract?: Contract,
): string {
  const days = Math.min(
    365 * 5,
    Math.max(1, Math.ceil(lookbackMs(interval, limit) / 86_400_000)),
  );
  if (days >= 365) {
    const years = Math.min(
      contract?.secType === SecType.CONTFUT ? 5 : 15,
      Math.ceil(days / 365),
    );
    return `${years} Y`;
  }
  return `${days} D`;
}

/** TWS 历史 K 线 endDateTime：CONTFUT 禁止带结束时刻（IB 10339）；FUT 分页用 before */
function twsEndDateTime(
  contract: Contract,
  beforeTimeSec?: number,
): string {
  if (contract.secType === SecType.CONTFUT) return "";
  if (beforeTimeSec == null) return "";
  const d = new Date(beforeTimeSec * 1000);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${mo}${day} ${h}:${mi}:${s}`;
}

async function requestHistoricalBars(
  contract: Contract,
  interval: KlineInterval,
  limit: number,
  beforeTimeSec?: number,
): Promise<{ candles: CandlestickData[]; volumes: number[] }> {
  return withIbkrTwsApi((ib) =>
    requestHistoricalBarsOn(ib, contract, interval, limit, beforeTimeSec),
  );
}

async function requestHistoricalBarsOn(
  ib: IBApi,
  contract: Contract,
  interval: KlineInterval,
  limit: number,
  beforeTimeSec?: number,
): Promise<{ candles: CandlestickData[]; volumes: number[] }> {
  const reqId = allocReqId();
  const barSize = barSizeForInterval(interval);
  const duration = durationStrForLimit(interval, limit, contract);
  const endDateTime = twsEndDateTime(contract, beforeTimeSec);
  // 股票日线用 RTH=1 更稳；期货保持 RTH=1
  const useRTH = 1;

  const candles: CandlestickData[] = [];
  const volumes: number[] = [];

  klineDebugLog("ibkr", "tws.reqHistoricalData", {
    reqId,
    secType: contract.secType,
    symbol: contract.symbol,
    duration,
    barSize,
    endDateTime: endDateTime || "(now)",
    useRTH,
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `TWS reqHistoricalData 超时（60s，已收到 ${candles.length} 根）。请确认 TWS 已登录、API 已启用、端口/clientId 正确，且账户有 ${contract.symbol} 历史数据权限。`,
        ),
      );
    }, 60_000);

    const onData = (
      id: number,
      time: string,
      open: number,
      high: number,
      low: number,
      close: number,
      volume: number,
    ): void => {
      if (id !== reqId) return;
      // IB 结束标记常为 finished-YYYYMMDD-YYYYMMDD，不是单独的 "finished"
      if (!time || time.startsWith("finished")) {
        cleanup();
        resolve({ candles, volumes });
        return;
      }
      const t = parseIbkrTwsBarTimeToUnix(time);
      if (t == null) return;
      if (beforeTimeSec != null && t >= beforeTimeSec) return;
      candles.push({
        time: t as UTCTimestamp,
        open,
        high,
        low,
        close,
      });
      volumes.push(volume);
    };

    const onError = (err: Error, code: number, id: number): void => {
      if (id !== reqId && id !== -1) return;
      klineDebugLog("ibkr", "tws.historical.error", {
        reqId: id,
        code,
        message: err?.message ?? String(err),
      });
      cleanup();
      try {
        ib.cancelHistoricalData(reqId);
      } catch {
        /* ignore */
      }
      reject(
        new Error(
          `TWS reqHistoricalData 错误 ${code}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    };

    const cleanup = (): void => {
      clearTimeout(timeout);
      ib.off(EventName.historicalData, onData);
      ib.off(EventName.error, onError);
    };

    ib.on(EventName.historicalData, onData);
    ib.on(EventName.error, onError);

    ib.reqHistoricalData(
      reqId,
      contract,
      endDateTime,
      duration,
      barSize,
      WhatToShow.TRADES,
      useRTH,
      2,
      false,
    );
  });
}

/** 连续图分页：解析可请求的 FUT（CP conid 或 TWS qualify，含过期合约） */
async function resolveTwsKlineContract(
  symbolRaw: string,
  beforeSec?: number,
): Promise<IbkrTwsContractSpec> {
  const spec = buildIbkrTwsContractForKlineFetch(symbolRaw, {
    beforeTimeSec: beforeSec,
  });
  if (spec.secType !== SecType.FUT || beforeSec == null) {
    return spec;
  }

  const root = spec.contract.symbol ?? symbolRaw.replace(/=F$/i, "");
  const ibMonth = pickIbFutMonthForAsOf(root, beforeSec);

  const cp = await tryResolveFutConidViaCp(root, ibMonth, spec.exchange);
  if (cp) {
    klineDebugLog("ibkr", "tws.contract.cp_conid", {
      root,
      ibMonth,
      conid: cp.conid,
      exchange: cp.exchange,
    });
    return {
      ...spec,
      contract: {
        ...spec.contract,
        conId: cp.conid,
        exchange: cp.exchange,
        includeExpired: true,
      },
      note: `${spec.note}；CP secdef conid=${cp.conid}`,
    };
  }

  const months = generateListedIbMonthsForRoot(root, beforeSec);
  const startIdx = Math.max(0, months.indexOf(ibMonth));
  const tryMonths =
    startIdx >= 0
      ? [...months.slice(0, startIdx + 1)].reverse()
      : [ibMonth];

  let lastErr: Error | null = null;
  for (const m of tryMonths) {
    const probe: Contract = {
      ...spec.contract,
      lastTradeDateOrContractMonth: ibMonthToContractMonth(m),
    };
    try {
      const qualified = await qualifyTwsFutContract(probe);
      return {
        ...spec,
        contract: qualified,
        note: `${spec.note}；TWS qualify ${m}`,
      };
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      klineDebugLog("ibkr", "tws.contract.qualify_fail", {
        ibMonth: m,
        message: lastErr.message,
      });
    }
  }

  throw (
    lastErr ??
    new Error(
      `无法解析 ${root} 在 ${ibMonth} 的交割月合约（可配置 IBKR_CP_COOKIE 用 Gateway secdef，或确认 TWS 有 COMEX 历史权限）`,
    )
  );
}

/**
 * 经 TWS Socket API 拉取 K 线（支持 CONTFUT 连续合约，由 IB 服务端拼接）。
 */
export async function fetchIbkrTwsKlines(
  symbolRaw: string,
  intervalRaw: string,
  limitRaw: number,
  options?: FetchIbkrKlinesOptions,
): Promise<KlinePayload> {
  if (!isKlineInterval(intervalRaw)) {
    throw new Error("interval 必须为之一：15m, 1h, 4h, 1d, 1w");
  }
  const interval = intervalRaw;
  const limit = clampKlineLimit(limitRaw);
  const beforeSec = options?.beforeTimeSec;
  const sym = symbolRaw.trim().toUpperCase();
  const contFutOnly = isIbkrContinuousFutChartSymbol(sym);

  clearKlineServerDebugRing();

  if (contFutOnly && beforeSec != null) {
    klineDebugLog("ibkr", "tws.contfut.no_pagination", {
      symbol: sym,
      beforeTimeSec: beforeSec,
    });
    const { host, port, clientId } = getIbkrTwsConnectionOptions();
    return {
      source: "ibkr",
      symbol: sym,
      interval,
      candles: [],
      volumes: [],
      hasMoreOlder: false,
      attribution: `Interactive Brokers TWS API（${host}:${port} clientId=${clientId}；CONTFUT 仅首屏，不向左分页）`,
    };
  }

  const spec = await resolveTwsKlineContract(symbolRaw, beforeSec);
  klineDebugLog("ibkr", "tws.contract", {
    chartSymbol: spec.chartSymbol,
    secType: spec.secType,
    exchange: spec.exchange,
    note: spec.note,
    beforeTimeSec: beforeSec ?? null,
  });

  const { candles: rawCandles, volumes: rawVolumes } =
    await requestHistoricalBars(
      spec.contract,
      interval,
      limit,
      beforeSec,
    );

  const order = [...rawCandles.keys()].sort(
    (i, j) => (rawCandles[i]!.time as number) - (rawCandles[j]!.time as number),
  );
  let candles = order.map((i) => rawCandles[i]!);
  let volumes = order.map((i) => rawVolumes[i]!);

  if (beforeSec == null && candles.length > limit) {
    candles = candles.slice(-limit);
    volumes = volumes.slice(-limit);
  }

  const { host, port, clientId } = getIbkrTwsConnectionOptions();

  klineDebugLog("ibkr", "tws.fetchIbkrKlines", {
    symbol: sym,
    barCount: candles.length,
    secType: spec.secType,
    firstIso:
      candles[0]?.time != null
        ? new Date((candles[0].time as number) * 1000).toISOString()
        : null,
    lastIso:
      candles.length > 0
        ? new Date(
            (candles[candles.length - 1]!.time as number) * 1000,
          ).toISOString()
        : null,
  });

  return {
    source: "ibkr",
    symbol: sym,
    interval,
    candles,
    volumes,
    hasMoreOlder: contFutOnly ? false : candles.length > 0,
    attribution: `Interactive Brokers TWS API（${host}:${port} clientId=${clientId}；${spec.note}${contFutOnly ? "；连续期货不向左分页" : ""}）`,
  };
}
