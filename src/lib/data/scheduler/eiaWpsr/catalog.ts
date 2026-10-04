/**
 * EIA Weekly Petroleum Status Report (WPSR) official-history workbooks.
 *
 * These are source-published levels only. Weekly changes, four-week averages,
 * year-over-year changes and seasonal deviations belong in chart calculations.
 */

export const EIA_WPSR_PROVIDER = "eia_wpsr_xls";
export const EIA_WPSR_PACKAGE_ID = "us.eia.weekly_petroleum_status";
export const EIA_WPSR_SYNC_SCRIPT = "scripts/data-worker/sync-eia-wpsr.ts";

export const EIA_WPSR_SOURCE = {
  id: "eia-wpsr-xls",
  agencyId: "us-eia",
  nameZh: "美国能源信息署",
  nameEn: "U.S. Energy Information Administration",
  name: "EIA Weekly Petroleum Status Report history workbooks",
  baseUrl: "https://www.eia.gov/dnav/pet/hist_xls/",
  termsUrl: "https://www.eia.gov/about/copyrights_reuse.php",
  websiteUrl: "https://www.eia.gov/",
} as const;

export type EiaWpsrSeries = {
  code: string;
  sourceSeriesKey: string;
  name: string;
  displayName: string;
  unit: string;
  freqLabel: "周";
  countryCode: "US";
  category: "通胀与价格";
  subgroup: "通胀预期与能源";
  minValue: number;
  maxValue: number;
  minimumHistoryPoints: number;
};

export const EIA_WPSR_SERIES: readonly EiaWpsrSeries[] = [
  {
    code: "eia_wpsr_wdistus1",
    sourceSeriesKey: "WDISTUS1",
    name: "Weekly U.S. Ending Stocks of Distillate Fuel Oil",
    displayName: "美国馏分油周末库存",
    unit: "千桶",
    freqLabel: "周",
    countryCode: "US",
    category: "通胀与价格",
    subgroup: "通胀预期与能源",
    minValue: 0,
    maxValue: 500_000,
    minimumHistoryPoints: 2_000,
  },
  {
    code: "eia_wpsr_wd0st_nus_1",
    sourceSeriesKey: "WD0ST_NUS_1",
    name: "Weekly U.S. Ending Stocks of Distillate Fuel Oil, 0 to 15 ppm Sulfur",
    displayName: "美国超低硫馏分油周末库存（0–15 ppm）",
    unit: "千桶",
    freqLabel: "周",
    countryCode: "US",
    category: "通胀与价格",
    subgroup: "通胀预期与能源",
    minValue: 0,
    maxValue: 300_000,
    minimumHistoryPoints: 1_000,
  },
  {
    code: "eia_wpsr_wdiupus2",
    sourceSeriesKey: "WDIUPUS2",
    name: "Weekly U.S. Product Supplied of Distillate Fuel Oil",
    displayName: "美国馏分油周度表观需求（Product Supplied）",
    unit: "千桶/日",
    freqLabel: "周",
    countryCode: "US",
    category: "通胀与价格",
    subgroup: "通胀预期与能源",
    minValue: 0,
    maxValue: 10_000,
    minimumHistoryPoints: 1_700,
  },
  {
    code: "eia_wpsr_wpuleus3",
    sourceSeriesKey: "WPULEUS3",
    name: "Weekly U.S. Percent Utilization of Refinery Operable Capacity",
    displayName: "美国炼厂可运营产能利用率",
    unit: "%",
    freqLabel: "周",
    countryCode: "US",
    category: "通胀与价格",
    subgroup: "通胀预期与能源",
    minValue: 0,
    maxValue: 120,
    minimumHistoryPoints: 1_700,
  },
  {
    code: "eia_wpsr_wcsstus1",
    sourceSeriesKey: "WCSSTUS1",
    name: "Weekly U.S. Ending Stocks of Crude Oil in the Strategic Petroleum Reserve",
    displayName: "美国战略石油储备（SPR）周末库存",
    unit: "千桶",
    freqLabel: "周",
    countryCode: "US",
    category: "通胀与价格",
    subgroup: "通胀预期与能源",
    minValue: 0,
    maxValue: 1_000_000,
    minimumHistoryPoints: 2_000,
  },
] as const;

export const EIA_WPSR_INSTRUMENT_CODES = EIA_WPSR_SERIES.map((row) => row.code);

export function eiaWpsrWorkbookUrl(sourceSeriesKey: string): string {
  return `${EIA_WPSR_SOURCE.baseUrl}${sourceSeriesKey}w.xls`;
}

export function eiaWpsrPageUrl(sourceSeriesKey: string): string {
  return `https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=${encodeURIComponent(sourceSeriesKey)}&f=W`;
}

export function findEiaWpsrSeriesByCode(code: string): EiaWpsrSeries | undefined {
  return EIA_WPSR_SERIES.find((row) => row.code === code);
}

export function findEiaWpsrSeriesBySourceKey(sourceSeriesKey: string): EiaWpsrSeries | undefined {
  return EIA_WPSR_SERIES.find((row) => row.sourceSeriesKey === sourceSeriesKey);
}
