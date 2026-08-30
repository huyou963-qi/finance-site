import crypto from "node:crypto";

export const INVESTMENT_CASE_FILE_SCHEMA = "finova.investment-case.v1" as const;

type InvestmentCaseDetail = {
  id: string;
  symbol: string;
  title: string;
  style: string;
  status: string;
  horizon: string | null;
  coreThesis: string | null;
  nextReviewAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  researchVersions: unknown[];
  catalysts: unknown[];
  tradePlan: unknown;
  actions: unknown[];
  reviews: unknown[];
  summary: unknown;
};

function jsonValue(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function sortedRecords(value: unknown[], field: string, direction: "asc" | "desc" = "asc"): unknown[] {
  const records = jsonValue(value) as Record<string, unknown>[];
  return records.sort((a, b) => {
    const left = String(a[field] ?? "");
    const right = String(b[field] ?? "");
    return direction === "asc"
      ? left.localeCompare(right, undefined, { numeric: true })
      : right.localeCompare(left, undefined, { numeric: true });
  });
}

export function buildInvestmentCaseFile(detail: InvestmentCaseDetail, exportedAt = new Date()) {
  const primaryEvidence = {
    case: {
      id: detail.id,
      symbol: detail.symbol,
      title: detail.title,
      style: detail.style,
      status: detail.status,
      horizon: detail.horizon,
      coreThesis: detail.coreThesis,
      nextReviewAt: detail.nextReviewAt,
      closedAt: detail.closedAt,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
      summary: detail.summary,
    },
    researchVersions: sortedRecords(detail.researchVersions, "version"),
    catalysts: sortedRecords(detail.catalysts, "createdAt"),
    tradePlan: detail.tradePlan,
    actions: sortedRecords(detail.actions, "occurredAt"),
  };
  const stableEvidence = JSON.stringify(jsonValue(primaryEvidence));

  return {
    schema: INVESTMENT_CASE_FILE_SCHEMA,
    schemaVersion: 1,
    exportedAt: exportedAt.toISOString(),
    dataCutoff: exportedAt.toISOString(),
    locale: "zh-CN",
    source: {
      application: "Finova",
      feature: "investment-journal",
      evidenceSha256: crypto.createHash("sha256").update(stableEvidence).digest("hex"),
    },
    analysisRequest: {
      purpose: "复盘投资研究、催化剂判断、资产影响判断、建仓、跟踪、减仓或退出的全过程，并做偏差与结果归因。",
      evidencePolicy: [
        "primaryEvidence 是事实输入；只依据文件内信息分析，不补造行情、公司事实或时间点。",
        "区分事实、假设、当时判断和事后结果；区分决策过程质量与最终盈亏。",
        "priorReviews 是历史派生观点，不得将其当作原始事实；如引用必须明确标记。",
        "所有结论标注数据截止时间，信息不足时直接列出缺口。",
      ],
      requestedSections: [
        "结论摘要",
        "原始投资论点与版本变化",
        "Catalyst 概率、影响路径及结果校准",
        "建仓与仓位风险",
        "跟踪、减仓和退出的执行纪律",
        "偏差与结果归因（能力、流程、运气、外部因素）",
        "遗漏信息与证据缺口",
        "可执行改进",
      ],
      outputFormat: "中文 Markdown；可直接粘贴回 Finova 的复盘输入框。",
    },
    primaryEvidence: jsonValue(primaryEvidence),
    priorReviews: sortedRecords(detail.reviews, "createdAt"),
  };
}

export function investmentCaseFilename(symbol: string, exportedAt = new Date()): string {
  const stamp = exportedAt.toISOString().replace(/[:.]/g, "-");
  return `${symbol}-investment-case-${stamp}.json`;
}
