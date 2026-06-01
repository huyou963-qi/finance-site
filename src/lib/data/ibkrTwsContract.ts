import type { Contract } from "@stoqey/ib";
import { SecType } from "@stoqey/ib";
import { futuresContractRoot } from "@/lib/chart/executionSymbolMatch";
import { parseIbkrFutMonthSpec } from "@/lib/data/ibkrFuturesMonth";

export { isIbkrContinuousFutChartSymbol } from "@/lib/data/ibkrFutSymbol";

function isValidIbkrSymbolInput(raw: string): boolean {
  const sym = raw.trim().toUpperCase();
  return /^[A-Z0-9.\-=^]{1,32}$/.test(sym);
}

const COMEX_METAL_ROOTS = new Set(["GC", "MGC", "SI", "HG", "PL", "PA"]);

function defaultFutExchange(root: string): string {
  if (COMEX_METAL_ROOTS.has(root)) return "COMEX";
  if (["ES", "MES", "NQ", "MNQ", "RTY", "YM", "MYM"].includes(root)) return "CME";
  if (["CL", "MCL", "NG"].includes(root)) return "NYMEX";
  return "SMART";
}

/** IB month JUN26 → lastTradeDateOrContractMonth 202606 */
export function ibMonthToContractMonth(ibMonth: string): string {
  const m = ibMonth.trim().toUpperCase().match(/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})$/);
  if (!m) return ibMonth;
  const year = 2000 + parseInt(m[2]!, 10);
  const monNames = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];
  const mi = monNames.indexOf(m[1]!);
  if (mi < 0) return ibMonth;
  return `${year}${String(mi + 1).padStart(2, "0")}`;
}

export type IbkrTwsContractSpec = {
  contract: Contract;
  chartSymbol: string;
  secType: string;
  exchange: string;
  note: string;
};

/**
 * 图表代码 → TWS Contract（连续 CONTFUT 或交割月 FUT）。
 */
export function buildIbkrTwsContract(symbolRaw: string): IbkrTwsContractSpec {
  const sym = symbolRaw.trim().toUpperCase();
  if (!isValidIbkrSymbolInput(sym)) {
    throw new Error(
      "无效的 IBKR 标的（示例：AAPL；MGCN6；MGC=F；XAUUSD）",
    );
  }

  if (/=F$/i.test(sym)) {
    const root = sym.replace(/=F$/i, "");
    const exchange = defaultFutExchange(root);
    return {
      chartSymbol: sym,
      secType: SecType.CONTFUT,
      exchange,
      note: "TWS CONTFUT 连续合约",
      contract: {
        symbol: root,
        secType: SecType.CONTFUT,
        exchange,
        currency: "USD",
      },
    };
  }

  const monthSpec = parseIbkrFutMonthSpec(sym);
  if (monthSpec) {
    const exchange = defaultFutExchange(monthSpec.root);
    const ltd = ibMonthToContractMonth(monthSpec.ibMonth);
    return {
      chartSymbol: sym,
      secType: SecType.FUT,
      exchange,
      note: `TWS FUT 交割月 ${monthSpec.ibMonth}`,
      contract: {
        symbol: monthSpec.root,
        secType: SecType.FUT,
        exchange,
        currency: "USD",
        lastTradeDateOrContractMonth: ltd,
        includeExpired: true,
        tradingClass: monthSpec.root,
      },
    };
  }

  const root = futuresContractRoot(sym);
  if (root) {
    const exchange = defaultFutExchange(root);
    return {
      chartSymbol: sym,
      secType: SecType.FUT,
      exchange,
      note: "TWS FUT（未识别月份，仅根代码）",
      contract: {
        symbol: root,
        secType: SecType.FUT,
        exchange,
        currency: "USD",
      },
    };
  }

  if (/^[A-Z]{6}$/.test(sym)) {
    return {
      chartSymbol: sym,
      secType: SecType.CASH,
      exchange: "IDEALPRO",
      note: "TWS 外汇",
      contract: {
        symbol: sym.slice(0, 3),
        secType: SecType.CASH,
        exchange: "IDEALPRO",
        currency: sym.slice(3, 6),
      },
    };
  }

  return {
    chartSymbol: sym,
    secType: SecType.STK,
    exchange: "SMART",
    note: "TWS 股票（SMART/USD）",
    contract: {
      symbol: sym,
      secType: SecType.STK,
      exchange: "SMART",
      currency: "USD",
    },
  };
}

/** K 线拉取用合约（`ROOT=F` 恒为 CONTFUT；不按月合约分页） */
export function buildIbkrTwsContractForKlineFetch(
  symbolRaw: string,
  _opts?: { beforeTimeSec?: number },
): IbkrTwsContractSpec {
  return buildIbkrTwsContract(symbolRaw);
}
