/** Historical-only definitions still need one source bootstrap on a fresh host. */
export function budgetSubscriptionEnabled(current: boolean, hasHistory: boolean): boolean {
  return current || !hasHistory;
}

export function archiveBudgetAfterBootstrap(sourceId: string, metadata: unknown, fetched: number): boolean {
  if (sourceId !== "mof-budget-accounts" || fetched < 1 || !metadata || typeof metadata !== "object") return false;
  const row = metadata as Record<string, unknown>;
  return row.historicalOnly === true && row.archiveAfterBootstrap === true;
}
