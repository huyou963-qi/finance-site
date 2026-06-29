import type { CotSector } from "./cotProductCatalog";

export type CotReportRow = {
  slug: string;
  label: string;
  sector: CotSector;
  sectorLabel: string;
  sortOrder: number;
  reportDate: string | null;
  long: number | null;
  longChange: number | null;
  short: number | null;
  shortChange: number | null;
  net: number | null;
  netChange: number | null;
  netChangePct: number | null;
  netHistory: number[];
  yearHigh: number | null;
  yearLow: number | null;
  relativeToMax: number | null;
};

export type CotReportPayload = {
  reportDate: string | null;
  reportDateLabel: string | null;
  rows: CotReportRow[];
  totals: {
    long: number;
    longChange: number;
    short: number;
    shortChange: number;
    net: number;
    netChange: number;
    netChangePct: number | null;
  };
  source: string;
};
