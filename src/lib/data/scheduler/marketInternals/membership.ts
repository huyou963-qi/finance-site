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
