/** 用户搜索添加的指标：草稿 → 管理员晋升后正式进目录树 */

export const ONBOARDING_STATUS_PENDING = "pending_completion" as const;
export const ONBOARDING_STATUS_COMPLETE = "complete" as const;

export type OnboardingStatus =
  | typeof ONBOARDING_STATUS_PENDING
  | typeof ONBOARDING_STATUS_COMPLETE;

export function readOnboardingStatus(metadata: unknown): OnboardingStatus | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const v = (metadata as Record<string, unknown>).onboardingStatus;
  if (v === ONBOARDING_STATUS_PENDING || v === ONBOARDING_STATUS_COMPLETE) return v;
  return null;
}

export function isPendingOnboarding(metadata: unknown): boolean {
  return readOnboardingStatus(metadata) === ONBOARDING_STATUS_PENDING;
}

export function isCompleteOnboarding(metadata: unknown): boolean {
  return readOnboardingStatus(metadata) === ONBOARDING_STATUS_COMPLETE;
}

export function fredCatalogKey(fredId: string): string {
  return `fred:${fredId.trim().toUpperCase()}`;
}

export function fredInstrumentCode(fredId: string): string {
  return `sched_fred_${fredId.trim().toUpperCase()}`;
}

export function wbCatalogKey(countryCode: string, indicatorId: string): string {
  return `wb:${countryCode.trim().toUpperCase()}:${indicatorId.trim()}`;
}

export function wbInstrumentCode(countryCode: string, indicatorId: string): string {
  const cc = countryCode.trim().toUpperCase();
  const id = indicatorId.trim().replace(/\./g, "_");
  return `sched_wb_${cc}_${id}`;
}

export function wbSourceSeriesKey(countryCode: string, indicatorId: string): string {
  return `${countryCode.trim().toUpperCase()}:${indicatorId.trim()}`;
}

export function freqLabelFromFredFrequency(freq: string | undefined): string {
  const f = (freq ?? "").toLowerCase();
  if (f.includes("daily")) return "日";
  if (f.includes("weekly")) return "周";
  if (f.includes("monthly")) return "月";
  if (f.includes("quarter")) return "季度";
  if (f.includes("annual") || f.includes("year")) return "年";
  return "月";
}
