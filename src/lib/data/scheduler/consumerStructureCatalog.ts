/** First, deliberately bounded consumer-monitor basket. No full-table expansion. */
export const CONSUMER_STRUCTURE_PACKAGE = "us.bea.personal_income";
export const CONSUMER_STRUCTURE_SERIES = [
  { fredId: "PCE", name: "个人消费支出（名义，月度季调折年）", beaCode: "DPCERC" },
  { fredId: "PCEDG", name: "PCE耐用品（名义，月度季调折年）", beaCode: "DDURRC" },
  { fredId: "PCEND", name: "PCE非耐用品（名义，月度季调折年）", beaCode: "DNDGRC" },
  { fredId: "PCES", name: "PCE服务（名义，月度季调折年）", beaCode: "DSERRC" },
] as const;
export const CONSUMER_MONITOR_REUSED_IDS = [
  "PCEC96", "PCEDGC96", "PCESC96", "PCEPI", "PCEPILFE",
  "RSAFS", "RSXFS", "DSPIC96", "PSAVERT", "PAYEMS", "CES0500000003", "AWHNONAG",
  "TNWBSHNO", "TDSP", "TOTALSL", "REVOLSL", "DRCCLACBS", "CORCCACBS",
] as const;
export const CONSUMER_MONITOR_SELECTED_IDS: readonly string[] = [
  ...CONSUMER_STRUCTURE_SERIES.map(row => row.fredId), ...CONSUMER_MONITOR_REUSED_IDS,
];
