/** TradingEconomics ISM 制造业 PMI 指标页 */
export const TE_ISM_PAGE_URL =
  "https://tradingeconomics.com/united-states/business-confidence";

export const ISM_TE_SYNC_SCRIPT = "scripts/data-worker/sync-ism-te.ts";

/** ism_us_ism_{sector} → TE 页面 Components / Related 表中的名称 */
export const ISM_SECTOR_TO_TE_LABEL: Record<string, string> = {
  headline: "ISM Manufacturing PMI",
  backlog: "ISM Manufacturing Backlog of Orders",
  employment: "ISM Manufacturing Employment",
  inventories: "ISM Manufacturing Inventories",
  new_orders: "ISM Manufacturing New Orders",
  prices: "ISM Manufacturing Prices",
  production: "ISM Manufacturing Production",
  supplier_deliveries: "ISM Manufacturing Supplier Deliveries",
};

export const ISM_INSTRUMENT_CODES = Object.keys(ISM_SECTOR_TO_TE_LABEL).map(
  (sector) => `ism_us_ism_${sector}`,
);

export const ISM_INSTRUMENT_CODE_PREFIX = "ism_us_ism_";

export function isIsmInstrumentCode(code: string): boolean {
  return code.startsWith(ISM_INSTRUMENT_CODE_PREFIX);
}

export function ismSectorFromInstrumentCode(code: string): string | null {
  const m = /^ism_us_ism_(.+)$/.exec(code.trim());
  return m?.[1] ?? null;
}

export function teLabelForInstrumentCode(code: string): string | null {
  const sector = ismSectorFromInstrumentCode(code);
  if (!sector) return null;
  return ISM_SECTOR_TO_TE_LABEL[sector] ?? null;
}
