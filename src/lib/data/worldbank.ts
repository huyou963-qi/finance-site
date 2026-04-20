import {
  countryName,
  indicatorLabel,
  ISO2_TO_ISO3,
  selectionKey,
  type MacroSelection,
} from "./macroCatalog";
import type { MacroPayload } from "./types";

function buildWorldBankUrl(countryIso2List: string[], indicatorId: string): string {
  const pathCountries = [...new Set(countryIso2List)].join(";");
  return (
    `https://api.worldbank.org/v2/country/${pathCountries}` +
    `/indicator/${indicatorId}?format=json&date=1990:2030&per_page=1000`
  );
}

/**
 * 按勾选组合拉取多条序列：先按 indicator 分批请求，再拆成「国家 × 指标」序列。
 */
export async function fetchWorldBankSeries(
  selections: MacroSelection[],
): Promise<MacroPayload> {
  if (selections.length === 0) {
    throw new Error("至少选择一条宏观序列");
  }

  const byIndicator = new Map<string, Set<string>>();
  for (const s of selections) {
    if (!byIndicator.has(s.indicator)) {
      byIndicator.set(s.indicator, new Set());
    }
    byIndicator.get(s.indicator)!.add(s.country);
  }

  type SeriesMaps = {
    selection: MacroSelection;
    yearToValue: Map<string, number | null>;
  };

  const pending: SeriesMaps[] = [];

  for (const [indicatorId, countrySet] of byIndicator) {
    const countries = [...countrySet];
    const url = buildWorldBankUrl(countries, indicatorId);
    const res = await fetch(url, { next: { revalidate: 43_200 } });

    if (!res.ok) {
      throw new Error(`World Bank HTTP ${res.status} (${indicatorId})`);
    }

    const json: unknown = await res.json();
    if (!Array.isArray(json) || json.length < 2 || !Array.isArray(json[1])) {
      throw new Error(`World Bank: unexpected response (${indicatorId})`);
    }

    const rows = json[1] as {
      countryiso3code?: string;
      date?: string;
      value?: number | null;
    }[];

    const picks = selections.filter((s) => s.indicator === indicatorId);

    for (const sel of picks) {
      const iso3 = ISO2_TO_ISO3[sel.country];
      if (!iso3) continue;

      const yearToValue = new Map<string, number | null>();
      for (const row of rows) {
        if (row.countryiso3code !== iso3 || !row.date) continue;
        const v =
          row.value === null ||
          row.value === undefined ||
          Number.isNaN(Number(row.value))
            ? null
            : Number(row.value);
        yearToValue.set(row.date, v);
      }
      pending.push({ selection: sel, yearToValue });
    }
  }

  const yearSet = new Set<string>();
  for (const p of pending) {
    for (const y of p.yearToValue.keys()) yearSet.add(y);
  }

  const categories = [...yearSet].sort((a, b) => Number(a) - Number(b));

  const series = pending.map((p) => {
    const { country, indicator } = p.selection;
    const name = `${countryName(country)} — ${indicatorLabel(indicator)}`;
    const data = categories.map((y) =>
      p.yearToValue.has(y) ? (p.yearToValue.get(y) ?? null) : null,
    );
    return {
      name,
      data,
      key: selectionKey(country, indicator),
    };
  });

  return {
    title: `世界银行开放数据（${series.length} 条序列）`,
    source: "worldbank",
    categories,
    series,
    attribution:
      "World Bank Open Data（免费；指标含义以世行为准；请勿超出条款使用）",
  };
}
