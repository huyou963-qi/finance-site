/** 统一 seed / verify 入口注册的目录名 → 脚本文件（不含 .ts） */
export type SeedCatalogEntry = {
  script: string;
  labelZh: string;
  /** verify 脚本是否必须加 --db */
  verifyNeedsDb?: boolean;
};

export const SEED_CATALOG_REGISTRY: Record<string, SeedCatalogEntry> = {
  p0: { script: "seed-p0", labelZh: "P0 试点（机构 + 10 条 FRED）" },
  "release-packages": { script: "seed-release-packages", labelZh: "发布包目录与成员链接" },
  phase2: { script: "seed-phase2", labelZh: "Phase 2 扩展订阅" },
  "phase3-wb": { script: "seed-phase3-wb", labelZh: "Phase 3 世行试点" },
  phase4: { script: "seed-phase4", labelZh: "Phase 4 扩展" },
  phase5: { script: "seed-phase5", labelZh: "Phase 5 扩展" },
  cpi: { script: "seed-cpi", labelZh: "美国 CPI 订阅" },
  labor: { script: "seed-labor", labelZh: "美国就业订阅" },
  overview: { script: "seed-overview", labelZh: "美国 Overview FRED" },
  fiscal: { script: "seed-fiscal", labelZh: "美国财政数据" },
  cot: { script: "seed-cot", labelZh: "CFTC COT" },
  monetary: { script: "seed-monetary", labelZh: "美国货币政策与金融条件" },
  housing: { script: "seed-housing", labelZh: "美国住房与地产" },
  "nyfed-recession": { script: "seed-nyfed-recession", labelZh: "NY Fed 衰退概率（抓取）" },
  "cycle-risk": { script: "seed-cycle-risk", labelZh: "美国增长动能与衰退风险" },
  "consumer-balance": { script: "seed-consumer-balance", labelZh: "美国消费与居民资产负债" },
  "external-dollar": { script: "seed-external-dollar", labelZh: "美国对外部门与美元" },
  "ism-te": { script: "seed-ism-te", labelZh: "ISM 制造业 TE 抓取" },
  "ism-svc-te": { script: "seed-ism-svc-te", labelZh: "ISM 服务业 TE 抓取" },
};

export const VERIFY_CATALOG_REGISTRY: Record<string, SeedCatalogEntry> = {
  catalog: { script: "verify-catalog", labelZh: "目录获取方式自检", verifyNeedsDb: true },
  phase1: { script: "verify-phase1", labelZh: "Phase 1 自检" },
  phase2: { script: "verify-phase2", labelZh: "Phase 2 自检" },
  phase3: { script: "verify-phase3", labelZh: "Phase 3 自检" },
  phase4: { script: "verify-phase4", labelZh: "Phase 4 自检" },
  phase5: { script: "verify-phase5", labelZh: "Phase 5 自检" },
  cpi: { script: "verify-cpi", labelZh: "CPI 自检" },
  labor: { script: "verify-labor", labelZh: "就业自检" },
  overview: { script: "verify-overview", labelZh: "Overview 自检" },
  fiscal: { script: "verify-fiscal", labelZh: "财政自检" },
  cot: { script: "verify-cot", labelZh: "COT 自检" },
  monetary: { script: "verify-monetary", labelZh: "货币政策与金融条件自检", verifyNeedsDb: true },
  housing: { script: "verify-housing", labelZh: "住房与地产自检", verifyNeedsDb: true },
  "nyfed-recession": { script: "verify-nyfed-recession", labelZh: "NY Fed 衰退概率自检", verifyNeedsDb: true },
  "cycle-risk": { script: "verify-cycle-risk", labelZh: "增长动能与衰退风险自检", verifyNeedsDb: true },
  "consumer-balance": {
    script: "verify-consumer-balance",
    labelZh: "消费与居民资产负债自检",
    verifyNeedsDb: true,
  },
  "external-dollar": {
    script: "verify-external-dollar",
    labelZh: "对外部门与美元自检",
    verifyNeedsDb: true,
  },
};

export function listSeedCatalogNames(): string[] {
  return Object.keys(SEED_CATALOG_REGISTRY).sort();
}

export function listVerifyCatalogNames(): string[] {
  return Object.keys(VERIFY_CATALOG_REGISTRY).sort();
}
