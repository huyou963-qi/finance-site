export type ObservationPoint = {
  obsDate: Date;
  value: number;
};

export type FetchIncrementalResult = {
  points: ObservationPoint[];
  sourceLatestObsDate: Date | null;
  skippedInvalid: number;
};

export type SubscriptionRunResult = {
  status: "success" | "partial" | "failed" | "skipped";
  rowsUpserted: number;
  rowsSkipped: number;
  error?: string;
  sourceLagDays?: number | null;
};
