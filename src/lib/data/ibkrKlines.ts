import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import {
  IBApi,
  EventName,
  Stock,
  BarSizeSetting,
  WhatToShow,
  ErrorCode,
} from "@stoqey/ib";
import { clampKlineLimit, isKlineInterval, lookbackMs } from "./klineShared";
import type { KlineInterval } from "./klineShared";
import type { KlinePayload } from "./types";

function ibEnvHost(): string {
  return process.env.IBKR_TWS_HOST?.trim() || "127.0.0.1";
}

function ibEnvPort(): number {
  const p = Number(process.env.IBKR_TWS_PORT ?? "7497");
  return Number.isFinite(p) && p > 0 ? p : 7497;
}

function ibEnvClientId(): number {
  const n = Number(process.env.IBKR_CLIENT_ID ?? "1");
  return Number.isFinite(n) ? Math.floor(n) : 1;
}

/** IB 历史 K 线日期串 → Unix 秒（lightweight-charts UTCTimestamp） */
function ibBarTimeToUnix(dateStr: string): UTCTimestamp {
  const s = dateStr.trim();
  if (/^\d{8}$/.test(s)) {
    const y = Number(s.slice(0, 4));
    const mo = Number(s.slice(4, 6)) - 1;
    const d = Number(s.slice(6, 8));
    return Math.floor(Date.UTC(y, mo, d) / 1000) as UTCTimestamp;
  }
  const m = s.match(/^(\d{4})(\d{2})(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const ms = Date.UTC(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6]),
    );
    return Math.floor(ms / 1000) as UTCTimestamp;
  }
  const parsed = Date.parse(s);
  if (Number.isFinite(parsed)) {
    return Math.floor(parsed / 1000) as UTCTimestamp;
  }
  return Math.floor(Date.now() / 1000) as UTCTimestamp;
}

function intervalToBarSize(interval: KlineInterval): BarSizeSetting {
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

/** IB durationStr：整数 + 空格 + 单位（S/D/W/M/Y） */
function durationStrForLookback(interval: KlineInterval, limit: number): string {
  const ms = lookbackMs(interval, limit);
  const days = Math.max(1, Math.ceil(ms / 86_400_000));
  const capped = Math.min(days, 365 * 20);
  return `${capped} D`;
}

function resolveBridgeKlinesUrl(
  symbol: string,
  interval: string,
  limit: number,
): string {
  const b = process.env.IBKR_BRIDGE_URL!.trim();
  if (b.includes("/klines")) {
    const u = new URL(b);
    u.searchParams.set("symbol", symbol);
    u.searchParams.set("interval", interval);
    u.searchParams.set("limit", String(limit));
    return u.toString();
  }
  const root = b.replace(/\/$/, "");
  const u = new URL(`${root}/klines`);
  u.searchParams.set("symbol", symbol);
  u.searchParams.set("interval", interval);
  u.searchParams.set("limit", String(limit));
  return u.toString();
}

async function fetchIbkrViaBridge(
  symbol: string,
  interval: string,
  limit: number,
): Promise<KlinePayload> {
  const url = resolveBridgeKlinesUrl(symbol, interval, limit);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(
      `IBKR 桥接 HTTP ${res.status}: ${t.slice(0, 240)}`,
    );
  }
  const json: unknown = await res.json();
  if (
    !json ||
    typeof json !== "object" ||
    !Array.isArray((json as KlinePayload).candles)
  ) {
    throw new Error("IBKR 桥接返回格式无效（需含 candles 数组）");
  }
  const p = json as KlinePayload;
  return {
    ...p,
    source: "ibkr",
    attribution:
      p.attribution ??
      "Interactive Brokers（经 IBKR_BRIDGE_URL HTTP 桥接）",
  };
}

function fetchIbkrViaTws(
  symbol: string,
  interval: KlineInterval,
  limit: number,
): Promise<KlinePayload> {
  const sym = symbol.trim().toUpperCase();
  if (!/^[A-Z.\-]{1,32}$/.test(sym)) {
    throw new Error(
      "无效的 IBKR 标的（示例美股：AAPL；含字母、点、连字符）",
    );
  }

  const host = ibEnvHost();
  const port = ibEnvPort();
  const clientId = ibEnvClientId();
  const barSize = intervalToBarSize(interval);
  const durationStr = durationStrForLookback(interval, limit);

  return new Promise((resolve, reject) => {
    const ib = new IBApi({ host, port });
    const bars: CandlestickData[] = [];
    const volumes: number[] = [];
    const reqId = Math.floor(Math.random() * 900_000) + 100_000;
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ib.disconnect();
      } catch {
        /* ignore */
      }
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error("IBKR TWS 历史数据请求超时（60s）")));
    }, 60_000);

    ib.on(EventName.connected, () => {
      ib.reqHistoricalData(
        reqId,
        new Stock(sym, "SMART", "USD"),
        "",
        durationStr,
        barSize,
        WhatToShow.TRADES,
        1,
        1,
        false,
      );
    });

    ib.on(
      EventName.historicalData,
      (
        id: number,
        date: string,
        open: number,
        high: number,
        low: number,
        close: number,
        volume: number,
      ) => {
        if (id !== reqId) return;
        /** 数据集结束：completedIndicator + open=-1（见 decoder HISTORICAL_DATA） */
        if (
          typeof date === "string" &&
          date.startsWith("finished") &&
          open === -1
        ) {
          const n = Math.min(limit, bars.length);
          const sliceFrom = Math.max(0, bars.length - n);
          finish(() =>
            resolve({
              source: "ibkr",
              symbol: sym,
              interval,
              candles: bars.slice(sliceFrom),
              volumes: volumes.slice(sliceFrom),
              attribution: `Interactive Brokers TWS / IB Gateway（${host}:${port}；须本机登录并保持运行；合约 SMART STK USD）`,
            }),
          );
          return;
        }
        bars.push({
          time: ibBarTimeToUnix(String(date)),
          open,
          high,
          low,
          close,
        });
        volumes.push(Number(volume ?? 0) || 0);
      },
    );

    ib.on(
      EventName.error,
      (
        err: Error,
        code: ErrorCode,
        reqIdEmitted: number,
        adv?: string,
      ) => {
        if (settled) return;
        const connFail =
          code === ErrorCode.CONNECT_FAIL ||
          code === ErrorCode.NOT_CONNECTED ||
          code === ErrorCode.FAIL_CONNECTION_LOST_BETWEEN_SERVER_AND_TWS ||
          code === ErrorCode.FAIL_CONNECTION_LOST_BETWEEN_TWS_AND_SERVER;
        if (!connFail && reqIdEmitted !== reqId && reqIdEmitted !== -1) {
          return;
        }
        const msg = [err?.message, adv ? String(adv) : ""]
          .filter(Boolean)
          .join(" ");
        finish(() =>
          reject(
            new Error(
              `IBKR：${msg || `错误码 ${code}`}（请确认 TWS 或 IB Gateway 已启动并已启用 API：编辑 → 全局配置 → API → 启用 ActiveX 与套接字客户端）`,
            ),
          ),
        );
      },
    );

    try {
      ib.connect(clientId);
    } catch (e) {
      finish(() =>
        reject(
          e instanceof Error ? e : new Error(String(e)),
        ),
      );
    }
  });
}

/**
 * Interactive Brokers K 线。
 *
 * 1) 若配置 `IBKR_BRIDGE_URL`：向桥接服务请求（JSON 同 KlinePayload），便于自动化/独立进程持连。
 * 2) 否则直连本机 TWS / IB Gateway（`IBKR_TWS_HOST` / `IBKR_TWS_PORT`，默认 127.0.0.1:7497 模拟）。
 */
export async function fetchIbkrKlines(
  symbolRaw: string,
  intervalRaw: string,
  limitRaw: number,
): Promise<KlinePayload> {
  const bridge = process.env.IBKR_BRIDGE_URL?.trim();
  if (bridge) {
    return fetchIbkrViaBridge(
      symbolRaw.trim(),
      intervalRaw,
      clampKlineLimit(limitRaw),
    );
  }

  if (!isKlineInterval(intervalRaw)) {
    throw new Error("interval 必须为之一：15m, 1h, 4h, 1d, 1w");
  }
  const interval = intervalRaw;
  const limit = clampKlineLimit(limitRaw);
  return fetchIbkrViaTws(symbolRaw, interval, limit);
}
