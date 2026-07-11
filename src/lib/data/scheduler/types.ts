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
  /** 实际写库行数（新增 + 修订），不含无变化的空转覆盖 */
  rowsUpserted: number;
  rowsSkipped: number;
  error?: string;
  sourceLagDays?: number | null;
  /** 新增行数 */
  inserted?: number;
  /** 修订（值变化）行数 */
  changed?: number;
  /** 本次拉取窗口内最新观测日期（写入或已存在），YYYY-MM-DD */
  latestObsDate?: string | null;
  /** latestObsDate 对应值 */
  latestValue?: number | null;
};
