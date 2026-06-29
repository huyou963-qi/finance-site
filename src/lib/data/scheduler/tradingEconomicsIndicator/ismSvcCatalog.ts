/** TradingEconomics ISM 服务业 PMI 指标页 */
export const TE_ISM_SVC_PAGE_URL =
  "https://tradingeconomics.com/united-states/non-manufacturing-pmi";

export const ISM_SVC_TE_SYNC_SCRIPT = "scripts/data-worker/sync-ism-svc-te.ts";

/** ism_svc_us_svc_{sector} → TE 页面 Components 表中的名称 */
export const ISM_SVC_SECTOR_TO_TE_LABEL: Record<string, string> = {
  headline: "United States ISM Services PMI",
  business_activity: "ISM Services Business Activity",
  employment: "ISM Services Employment",
  new_orders: "ISM Services New Orders",
  prices: "ISM Services Prices",
};

export const ISM_SVC_INSTRUMENT_CODES = Object.keys(ISM_SVC_SECTOR_TO_TE_LABEL).map(
  (sector) => `ism_svc_us_svc_${sector}`,
);

export const ISM_SVC_INSTRUMENT_CODE_PREFIX = "ism_svc_us_svc_";

export function isIsmSvcInstrumentCode(code: string): boolean {
  return code.startsWith(ISM_SVC_INSTRUMENT_CODE_PREFIX);
}

export function ismSvcSectorFromInstrumentCode(code: string): string | null {
  const m = /^ism_svc_us_svc_(.+)$/.exec(code.trim());
  return m?.[1] ?? null;
}

export function teLabelForIsmSvcInstrumentCode(code: string): string | null {
  const sector = ismSvcSectorFromInstrumentCode(code);
  if (!sector) return null;
  return ISM_SVC_SECTOR_TO_TE_LABEL[sector] ?? null;
}
