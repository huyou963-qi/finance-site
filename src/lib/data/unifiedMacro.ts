import {
  FRED_ALLOWED_IDS,
  parseSelectionKey,
  type MacroSelection,
  unifiedSeriesDisplayName,
  UNIFIED_KEY_SET,
} from "./macroCatalog";
import { enumerateMonthsInclusive } from "./monthUtils";
import { fetchFredMonthlyMap } from "./fred";
import type { MacroPayload } from "./types";
import { fetchWorldBankSeries } from "./worldbank";

function splitUnifiedKeys(keys: string[]): {
  wbSelections: MacroSelection[];
  fredIds: string[];
} {
  const wbSelections: MacroSelection[] = [];
  const fredIds: string[] = [];
  for (const key of keys) {
    if (key.startsWith("wb:")) {
      const p = parseSelectionKey(key.slice(3));
      if (p) wbSelections.push(p);
    } else if (key.startsWith("fred:")) {
      const id = key.slice(5).toUpperCase();
      if (FRED_ALLOWED_IDS.has(id)) fredIds.push(id);
    }
  }
  return { wbSelections, fredIds };
}

function fetchUnifiedAnnualOnly(
  keys: string[],
  wbByUnifiedKey: Map<string, Map<string, number | null>>,
  fredById: Map<string, Map<string, number | null>>,
): MacroPayload {
  const yearSet = new Set<string>();
  for (const key of keys) {
    if (key.startsWith("wb:")) {
      const m = wbByUnifiedKey.get(key);
      if (m) for (const y of m.keys()) yearSet.add(y);
    } else if (key.startsWith("fred:")) {
      const id = key.slice(5).toUpperCase();
      const m = fredById.get(id);
      if (m) for (const y of m.keys()) yearSet.add(y);
    }
  }

  const categories = [...yearSet].sort((a, b) => Number(a) - Number(b));

  const series = keys.map((key) => {
    if (key.startsWith("wb:")) {
      const m = wbByUnifiedKey.get(key);
      const data = categories.map((y) => m?.get(y) ?? null);
      return {
        key,
        name: unifiedSeriesDisplayName(key),
        data,
      };
    }
    const id = key.slice(5).toUpperCase();
    const m = fredById.get(id);
    const data = categories.map((y) => m?.get(y) ?? null);
    return {
      key,
      name: unifiedSeriesDisplayName(key),
      data,
    };
  });

  return {
    title: `宏观数据（${series.length} 条序列 · 年度）`,
    source: "unified",
    categories,
    series,
    attribution:
      "指标来自公开发布的官方与机构统计。仅供学习参考。",
  };
}

/**
 * 统一宏观：含 FRED 时横轴为连续月份；FRED 为月度口径（月内多日取月末观测）。
 * 世界银行年度序列在同年各月上展示为该年年度值（阶梯状）。
 */
export async function fetchUnifiedMacro(selectionKeys: string[]): Promise<MacroPayload> {
  const keys = [...new Set(selectionKeys)].filter((k) => UNIFIED_KEY_SET.has(k));
  if (keys.length === 0) {
    throw new Error("至少选择一条宏观序列");
  }

  const hasFred = keys.some((k) => k.startsWith("fred:"));

  const { wbSelections, fredIds } = splitUnifiedKeys(keys);
  const uniqueFred = [...new Set(fredIds)];
  const needsFred = uniqueFred.length > 0;
  const apiKey = process.env.FRED_API_KEY?.trim();

  if (needsFred && !apiKey) {
    throw new Error(
      "当前所选包含需单独授权的序列，但未检测到 API 密钥（请在 .env.local 中配置 FRED_API_KEY）",
    );
  }

  const [wbPayload, fredPairs] = await Promise.all([
    wbSelections.length > 0 ? fetchWorldBankSeries(wbSelections) : Promise.resolve(null),
    needsFred
      ? Promise.all(
          uniqueFred.map(async (id) => {
            const map = await fetchFredMonthlyMap(id, apiKey!);
            return { id, map };
          }),
        )
      : Promise.resolve([] as { id: string; map: Map<string, number | null> }[]),
  ]);

  const wbByUnifiedKey = new Map<string, Map<string, number | null>>();
  if (wbPayload) {
    for (const s of wbPayload.series) {
      const ukey = `wb:${s.key}`;
      const m = new Map<string, number | null>();
      wbPayload.categories.forEach((y, i) => {
        m.set(y, s.data[i] ?? null);
      });
      wbByUnifiedKey.set(ukey, m);
    }
  }

  const fredById = new Map(fredPairs.map(({ id, map }) => [id, map]));

  if (!hasFred) {
    return fetchUnifiedAnnualOnly(keys, wbByUnifiedKey, fredById);
  }

  let monthMin: string | null = null;
  let monthMax: string | null = null;

  for (const { map } of fredPairs) {
    for (const ym of map.keys()) {
      if (!monthMin || ym < monthMin) monthMin = ym;
      if (!monthMax || ym > monthMax) monthMax = ym;
    }
  }

  if (wbPayload && wbPayload.categories.length > 0) {
    const years = wbPayload.categories.map((y) => Number.parseInt(y, 10)).filter(Number.isFinite);
    if (years.length > 0) {
      const ymin = Math.min(...years);
      const ymax = Math.max(...years);
      const wbStart = `${ymin}-01`;
      const wbEnd = `${ymax}-12`;
      if (!monthMin || wbStart < monthMin) monthMin = wbStart;
      if (!monthMax || wbEnd > monthMax) monthMax = wbEnd;
    }
  }

  if (!monthMin || !monthMax) {
    throw new Error("无法构建月度时间轴（未获得 FRED 月度观测）");
  }

  const categories = enumerateMonthsInclusive(monthMin, monthMax);

  const series = keys.map((key) => {
    if (key.startsWith("wb:")) {
      const yearMap = wbByUnifiedKey.get(key);
      const data = categories.map((ym) => {
        const y = ym.slice(0, 4);
        return yearMap?.get(y) ?? null;
      });
      return {
        key,
        name: unifiedSeriesDisplayName(key),
        data,
      };
    }
    const id = key.slice(5).toUpperCase();
    const m = fredById.get(id);
    const data = categories.map((ym) => m?.get(ym) ?? null);
    return {
      key,
      name: unifiedSeriesDisplayName(key),
      data,
    };
  });

  return {
    title: `宏观数据（${series.length} 条序列 · 月度）`,
    source: "unified",
    categories,
    series,
    attribution:
      "指标来自公开发布的官方与机构统计；高频序列已聚合为月度（月内多日取月末观测）。世界银行年度指标在同年各月重复该年数值以便对比。仅供学习参考。",
  };
}
