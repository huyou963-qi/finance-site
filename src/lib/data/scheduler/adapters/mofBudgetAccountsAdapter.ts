import type { FetchIncrementalResult } from "../types";
import { fetchMofBudgetAccountSeries } from "../mofBudgetAccounts/client";
import { MOF_BUDGET_ACCOUNTS_SERIES } from "../mofBudgetAccounts/catalog";
export async function fetchMofBudgetAccountsIncremental(metadata: unknown, code: string, obsStart: string): Promise<FetchIncrementalResult> {
  const scrape = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).scrape as Record<string, unknown> | undefined : undefined;
  const series = MOF_BUDGET_ACCOUNTS_SERIES.find(x => x.code === code);
  if (!series || !scrape || scrape.component !== series.key) throw new Error("年度决算 scrape.component 与 instrument.code 不匹配");
  if (!Number.isFinite(new Date(obsStart).getTime())) throw new Error("年度决算 obsStart 无效");
  // Re-read every published annual final account to capture revisions.
  const points = await fetchMofBudgetAccountSeries(series.key);
  if (!points.length) throw new Error(`源端未披露已登记指标 ${series.key}`);
  return { points, sourceLatestObsDate: points.at(-1)?.obsDate ?? null, skippedInvalid: 0, sourceMetadata: { dataset: "MOF annual final accounts", budgetStage: "final", scope: series.scope, account: series.account, unit: "亿元", revisionPolicy: "full history reread" } };
}
