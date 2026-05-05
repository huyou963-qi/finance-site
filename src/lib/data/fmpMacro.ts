import type { MacroPayload, MacroSeriesItem } from "./types";
import { MACRO_MAX_SERIES } from "./macroCatalog";
import { fmpDisplayLabel } from "./fmpCatalog";

const FMP_BASE = "https://financialmodelingprep.com/stable";

function parseFmpRows(json: unknown): Map<string, number | null> {
  const map = new Map<string, number | null>();
  if (!Array.isArray(json)) return map;
  for (const row of json) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const dateRaw = r.date;
    if (typeof dateRaw !== "string") continue;
    const d = dateRaw.trim().slice(0, 10);
    if (!d) continue;
    const v = r.value;
    let num: number | null = null;
    if (typeof v === "number" && Number.isFinite(v)) num = v;
    else if (typeof v === "string") {
      const n = Number.parseFloat(v);
      num = Number.isFinite(n) ? n : null;
    }
    map.set(d, num);
  }
  return map;
}

async function fetchOneIndicator(
  name: string,
  apiKey: string,
): Promise<Map<string, number | null>> {
  const url = `${FMP_BASE}/economic-indicators?name=${encodeURIComponent(name)}&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  const bodyText = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`FMP「${name}」请求失败：HTTP ${res.status} ${bodyText.slice(0, 120)}`);
  }

  // FMP 某些无效 name 会返回纯文本 "Invalid name"（非 JSON）。
  if (/^\s*invalid name\s*$/i.test(bodyText)) {
    throw new Error(`FMP「${name}」不是有效的 economic-indicators name`);
  }

  let json: unknown;
  try {
    json = JSON.parse(bodyText);
  } catch {
    throw new Error(`FMP「${name}」返回了非 JSON 内容：${bodyText.slice(0, 120)}`);
  }
  return parseFmpRows(json);
}

function mergeSortedDates(maps: Map<string, number | null>[]): string[] {
  const set = new Set<string>();
  for (const m of maps) {
    for (const k of m.keys()) set.add(k);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * 统一宏观：按所选 `fmp:指标名` 拉取 Financial Modeling Prep 并拼成类目轴。
 * @param allowlist 由 `getFmpCatalogCached()` 提供，与目录树一致；缺省时仅做 fmp: 前缀过滤（不推荐）。
 */
export async function fetchFmpMacro(
  selectionKeys: string[],
  allowlist?: Set<string>,
): Promise<MacroPayload> {
  const apiKey = process.env.FMP_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("缺少环境变量 FMP_API_KEY");
  }

  const keys = [...new Set(selectionKeys)]
    .filter((k) => {
      if (!k.startsWith("fmp:")) return false;
      if (allowlist && allowlist.size > 0) return allowlist.has(k);
      return true;
    })
    .slice(0, MACRO_MAX_SERIES);

  if (keys.length === 0) {
    throw new Error("至少选择一条 FMP 经济指标");
  }

  const uniqueNames = [...new Set(keys.map((k) => k.slice(4)))];

  const settled = await Promise.allSettled(uniqueNames.map((n) => fetchOneIndicator(n, apiKey)));
  const byName = new Map<string, Map<string, number | null>>();
  const skipped: string[] = [];
  for (let i = 0; i < settled.length; i++) {
    const name = uniqueNames[i]!;
    const it = settled[i]!;
    if (it.status === "fulfilled") {
      byName.set(name, it.value);
    } else {
      skipped.push(name);
    }
  }

  const maps = [...byName.values()];

  const categories = mergeSortedDates(maps);
  if (categories.length === 0) {
    throw new Error("FMP 返回的时间序列为空，请检查指标名或账户权限");
  }

  const series: MacroSeriesItem[] = keys
    .filter((key) => byName.has(key.slice(4)))
    .map((key) => {
    const name = key.slice(4);
    const m = byName.get(name) ?? new Map();
    const data = categories.map((d) => m.get(d) ?? null);
    return {
      key,
      name: fmpDisplayLabel(name),
      data,
    };
    });

  if (series.length === 0) {
    throw new Error("所选指标在 FMP 不可用，请更换指标后重试");
  }

  return {
    title: `宏观数据（${series.length} 条 · Financial Modeling Prep）`,
    source: "fmp",
    categories,
    series,
    attribution:
      skipped.length > 0
        ? `数据来自 Financial Modeling Prep（多为美国口径）。已自动跳过 ${skipped.length} 条无效指标。`
        : "数据来自 Financial Modeling Prep（多为美国口径）。",
  };
}
