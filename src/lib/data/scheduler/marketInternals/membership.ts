import history from "./sp500History.json";
import { normalizeSp500Ticker, type Sp500Change } from "@/lib/equity/wikipediaSp500Changes";

export const HISTORY_SOURCE = `${history.repository}/tree/${history.commit}`;
export const HISTORY_FIRST_DATE = history.firstDate;

export function rawTicker(value: string): string { return value.replace(/\./g, "-").toUpperCase(); }
export function archiveTicker(value: string): string { return `WIKI:${value.replace(/[.-]/g, "_").toUpperCase()}`; }

/** 开放历史快照逐日向前回放；首份快照以前留空，不把1996名单倒填到1995。 */
export function historicalDailyMembership(dates: readonly string[], current: readonly string[], recent: readonly Sp500Change[], anchor: string): Map<string, Set<string>> {
  const members = new Set(history.initial.map(rawTicker));
  const historical = history.changes.map((row) => ({ date: row.date, added: row.added.map(rawTicker), removed: row.removed.map(rawTicker) }));
  // 历史快照以原始代码存储；近期Wikipedia事件已经归一代码，需要同步别名后再桥接。
  const bridge = recent.filter((row) => row.date > history.lastDate && row.date <= anchor).sort((a, b) => a.date.localeCompare(b.date));
  const result = new Map<string, Set<string>>();
  let event = 0;
  let bridgeEvent = 0;
  let normalized = false;
  for (const date of [...dates].filter((d) => d >= history.firstDate && d <= anchor).sort()) {
    while (event < historical.length && historical[event].date <= date) {
      const row = historical[event++];
      row.removed.forEach((ticker) => members.delete(ticker));
      row.added.forEach((ticker) => members.add(ticker));
    }
    if (date > history.lastDate) {
      if (!normalized) {
        const symbols = [...members].map((s) => normalizeSp500Ticker(s, history.lastDate) ?? s);
        members.clear(); symbols.forEach((s) => members.add(s)); normalized = true;
      }
      while (bridgeEvent < bridge.length && bridge[bridgeEvent].date <= date) {
        const row = bridge[bridgeEvent++];
        if (row.removedTicker) members.delete(row.removedTicker);
        if (row.addedTicker) members.add(row.addedTicker);
      }
    }
    result.set(date, new Set(members));
  }
  // 全量回填时核对桥接后的最新名单，禁止默默丢弃未解释的成分差异。
  const latest = [...result.keys()].at(-1);
  if (latest && latest > history.lastDate) {
    const expected = new Set(current);
    // latest可能是锚点前一个交易日：撤销尚未生效到latest的事件。
    for (const row of [...recent].filter((r) => r.date > latest && r.date <= anchor).sort((a, b) => b.date.localeCompare(a.date))) {
      if (row.addedTicker) expected.delete(row.addedTicker);
      if (row.removedTicker) expected.add(row.removedTicker);
    }
    const actual = result.get(latest)!;
    const missing = [...expected].filter((s) => !actual.has(s));
    const extra = [...actual].filter((s) => !expected.has(s));
    if (missing.length || extra.length) throw new Error(`历史名单桥接未通过: 缺少${missing.join(",")}；多出${extra.join(",")}`);
  }
  return result;
}


/** 已证实的代码复用：旧Paramount与新Banzai、旧L Brands与新LandBridge不能共享价格。 */
export function historicalPriceTicker(symbol: string, date = "9999-12-31"): string {
  const ticker = normalizeSp500Ticker(symbol, date) ?? symbol;
  // 同一发行人的旧报价由现代码完整行情保留；DV在2021年后被DoubleVerify复用。
  if (symbol === "DV" && date < "2017-05-24") return "CVSA";
  if (symbol === "ATGE" && date < "2026-02-24") return "CVSA";
  if ((symbol === "WYN" || symbol === "WYND") && date < "2021-02-17") return "TNL";
  if (symbol === "JDSU" && date < "2015-08-04") return "VIAV";
  // 2020分离前的IAC存续发行人更名为Match，新的IAC不是同一发行人。
  if ((symbol === "IAC" || symbol === "IACI") && date < "2020-07-01") return "MTCH";
  if (symbol === "CBS" && date < "2019-12-05") return "LEGACY:PARA";
  if (symbol === "BBT" && date < "2019-12-09") return "TFC";
  if (symbol === "BHGE" && date < "2019-10-18") return "BKR";
  if (symbol === "TMK" && date < "2019-08-09") return "GL";
  if (symbol === "IR" && date < "2020-03-03") return "TT";
  if (symbol === "TT" && date < "2008-06-06") return "LEGACY:TT";
  // WBD保留DISCA的A类历史，不可把同一条价格线用于DISCK的C类股。
  if (symbol === "DISCA" && date < "2022-04-11") return "WBD";
  if (symbol === "CTL" && date < "2020-09-18") return "LUMN";
  // VTRS行情保留真实MYL旧报价；仅在旧MYL成员期使用，不能把未来VTRS报价倒填。
  if (symbol === "MYL" && date < "2020-11-17") return "VTRS";
  // 原Arconic母公司变为HWM；2020-04后的ARNC是另一个分拆发行人。
  if (symbol === "ARNC" && date < "2020-04-06") return "HWM";
  // WIKI:AGN是Actavis历史，不能冒充2015并购前的原Allergan。
  if (symbol === "AGN" && date < "2015-06-15") return "LEGACY:AGN";
  if ((symbol === "VIAC" || symbol === "PARA") && date < "2025-08-08") return "LEGACY:PARA";
  if (symbol === "LB" && date < "2021-08-03") return "LEGACY:LB";
  return ticker;
}


export function historicalPriceKeys(symbol: string, date?: string): string[] {
  const primary = historicalPriceTicker(symbol, date);
  if (primary === "LEGACY:AGN") return [primary, `Q12:${primary}`, `Q12S:${primary}`];
  // 未复权归档仅作最终补缺，不能抢占已有完整的拆股调整价格窗口。
  return [primary, `Y22:${primary}`, `Y20:${primary}`, archiveTicker(symbol), `Q12:${primary}`, `Q12S:${primary}`];
}
