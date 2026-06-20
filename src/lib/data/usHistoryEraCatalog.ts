/** 美国历史 14 时代阶段边界（与 scripts/data/us-history-era-defs.mjs 一致） */
export type UsHistoryEraCatalogEntry = {
  seedKey: string;
  tag: string;
  dateFrom: string;
  dateTo: string;
};

export const US_HISTORY_ERA_CATALOG: UsHistoryEraCatalogEntry[] = [
  { seedKey: "us-era-founding", tag: "建国宪政", dateFrom: "1776-07-04", dateTo: "1815-12-31" },
  { seedKey: "us-era-market-revolution", tag: "市场革命", dateFrom: "1815-01-01", dateTo: "1860-12-31" },
  { seedKey: "us-era-civil-war", tag: "内战重建", dateFrom: "1861-04-12", dateTo: "1877-03-31" },
  { seedKey: "us-era-gilded-age", tag: "镀金时代", dateFrom: "1877-01-01", dateTo: "1893-06-30" },
  { seedKey: "us-era-progressive", tag: "进步主义", dateFrom: "1893-07-01", dateTo: "1914-07-27" },
  { seedKey: "us-era-roaring-twenties", tag: "咆哮二十年代", dateFrom: "1914-07-28", dateTo: "1929-10-29" },
  { seedKey: "us-era-great-depression", tag: "大萧条", dateFrom: "1929-10-01", dateTo: "1939-08-31" },
  { seedKey: "us-era-ww2", tag: "二战动员", dateFrom: "1939-09-01", dateTo: "1945-09-02" },
  { seedKey: "us-era-golden-age", tag: "战后黄金年代", dateFrom: "1945-09-03", dateTo: "1973-10-16" },
  { seedKey: "us-era-stagflation", tag: "滞胀时代", dateFrom: "1973-10-17", dateTo: "1982-11-30" },
  { seedKey: "us-era-neoliberal-boom", tag: "新自由主义繁荣", dateFrom: "1982-12-01", dateTo: "2000-03-10" },
  { seedKey: "us-era-gfc", tag: "金融危机时代", dateFrom: "2000-03-11", dateTo: "2009-06-30" },
  { seedKey: "us-era-qe", tag: "QE时代", dateFrom: "2009-07-01", dateTo: "2019-12-31" },
  { seedKey: "us-era-post-covid", tag: "疫情后时代", dateFrom: "2020-01-01", dateTo: "present" },
];

function eraDateToBound(dateTo: string): string {
  const raw = dateTo.trim();
  if (raw === "present" || raw === "今") return "9999-12-31";
  return raw.slice(0, 10);
}

export function findEraCatalogEntryByDate(
  dateStr: string,
  catalog = US_HISTORY_ERA_CATALOG,
): UsHistoryEraCatalogEntry | null {
  const d = dateStr.slice(0, 10);
  for (const era of catalog) {
    if (d >= era.dateFrom.slice(0, 10) && d <= eraDateToBound(era.dateTo)) return era;
  }
  return catalog[catalog.length - 1] ?? null;
}

export function findEraCatalogEntryBySeedKey(
  seedKey: string,
  catalog = US_HISTORY_ERA_CATALOG,
): UsHistoryEraCatalogEntry | null {
  return catalog.find((e) => e.seedKey === seedKey) ?? null;
}
