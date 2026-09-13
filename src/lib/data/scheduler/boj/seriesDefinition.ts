/** Minimum BOJ catalogue contract shared by every domain using the BOJ API. */
export type BojApiSeriesDefinition = {
  db: string;
  seriesCode: string;
  key: string;
  instrumentCode: string;
  frequency: "MONTHLY" | "QUARTERLY";
  sourceUnit: string;
};
