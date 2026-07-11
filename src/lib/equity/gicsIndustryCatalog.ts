/**
 * GICS 74 Industry / 163 Sub-Industry 目录（2023+ 结构）。
 * 数据来源：data/gics/*.json（离线生成，见 scripts/equity/generate-gics-offline.py）
 */

import gicsStructure from "../../../data/gics/gics-structure.json";
import industryStyleTags from "../../../data/gics/industry-style-tags.json";
import subIndustryAliases from "../../../data/gics/sub-industry-aliases.json";
import type { GicsSector } from "./gicsCatalog";
import { isGicsSector } from "./gicsCatalog";

export type IndustryStyleTag = "cyclical" | "defensive" | "both";

export type GicsIndustry = {
  code: string;
  nameEn: string;
  sector: GicsSector;
  industryGroup: string;
  industryGroupCode: string;
};

export type GicsSubIndustry = {
  sectorCode: string;
  sector: GicsSector;
  industryGroupCode: string;
  industryGroup: string;
  industryCode: string;
  industry: string;
  subIndustryCode: string;
  subIndustry: string;
};

export type GicsClassification = {
  sectorCode: string;
  sector: GicsSector;
  industryGroupCode: string;
  industryGroup: string;
  industryCode: string;
  industry: string;
  subIndustryCode: string;
  subIndustry: string;
};

function normKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function assertSector(value: string): GicsSector {
  if (!isGicsSector(value)) {
    throw new Error(`未知 GICS Sector: ${value}`);
  }
  return value;
}

const rawIndustries = gicsStructure.industries as Array<{
  code: string;
  nameEn: string;
  sector: string;
  industryGroup: string;
  industryGroupCode: string;
}>;

const rawSubIndustries = gicsStructure.subIndustries as Array<{
  sectorCode: string;
  sector: string;
  industryGroupCode: string;
  industryGroup: string;
  industryCode: string;
  industry: string;
  subIndustryCode: string;
  subIndustry: string;
}>;

export const GICS_INDUSTRIES: readonly GicsIndustry[] = rawIndustries.map((row) => ({
  code: row.code,
  nameEn: row.nameEn,
  sector: assertSector(row.sector),
  industryGroup: row.industryGroup,
  industryGroupCode: row.industryGroupCode,
}));

export const GICS_SUB_INDUSTRIES: readonly GicsSubIndustry[] = rawSubIndustries.map((row) => ({
  sectorCode: row.sectorCode,
  sector: assertSector(row.sector),
  industryGroupCode: row.industryGroupCode,
  industryGroup: row.industryGroup,
  industryCode: row.industryCode,
  industry: row.industry,
  subIndustryCode: row.subIndustryCode,
  subIndustry: row.subIndustry,
}));

const STYLE_TAGS = industryStyleTags as Record<string, IndustryStyleTag>;
const SUB_INDUSTRY_ALIAS_MAP = subIndustryAliases as Record<string, string>;

const subIndustryByCode = new Map<string, GicsSubIndustry>(
  GICS_SUB_INDUSTRIES.map((row) => [row.subIndustryCode, row]),
);

const subIndustryByNormName = new Map<string, GicsSubIndustry>(
  GICS_SUB_INDUSTRIES.map((row) => [normKey(row.subIndustry), row]),
);

const industryByCode = new Map<string, GicsIndustry>(
  GICS_INDUSTRIES.map((row) => [row.code, row]),
);

const industryBySlug = new Map<string, GicsIndustry[]>();
for (const row of GICS_INDUSTRIES) {
  const slug = industrySlug(row.nameEn);
  const list = industryBySlug.get(slug) ?? [];
  list.push(row);
  industryBySlug.set(slug, list);
}

/** Wikipedia / 文本 → 规范 sub-industry code；未匹配返回 null */
export function lookupSubIndustry(subIndustryName: string): string | null {
  const trimmed = subIndustryName.trim();
  if (!trimmed) return null;
  const key = normKey(trimmed);
  const fromAlias = SUB_INDUSTRY_ALIAS_MAP[key];
  if (fromAlias) return fromAlias;
  const row = subIndustryByNormName.get(key);
  return row?.subIndustryCode ?? null;
}

/** Sub-Industry 名称 → 完整四级分类；未匹配返回 null */
export function rollupFromSubIndustry(subIndustryName: string): GicsClassification | null {
  const code = lookupSubIndustry(subIndustryName);
  if (!code) return null;
  const row = subIndustryByCode.get(code);
  if (!row) return null;
  return {
    sectorCode: row.sectorCode,
    sector: row.sector,
    industryGroupCode: row.industryGroupCode,
    industryGroup: row.industryGroup,
    industryCode: row.industryCode,
    industry: row.industry,
    subIndustryCode: row.subIndustryCode,
    subIndustry: row.subIndustry,
  };
}

export function industrySlug(nameEn: string): string {
  return nameEn
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** slug（可选 sector 消歧）→ Industry；未匹配返回 null */
export function industryFromSlug(slug: string, sector?: GicsSector): GicsIndustry | null {
  const normalized = slug.trim().toLowerCase();
  const matches = industryBySlug.get(normalized) ?? [];
  if (matches.length === 0) return null;
  if (sector) {
    const scoped = matches.find((row) => row.sector === sector);
    if (scoped) return scoped;
  }
  return matches.length === 1 ? matches[0]! : null;
}

export function getIndustryStyle(code: string): IndustryStyleTag | null {
  return STYLE_TAGS[code] ?? null;
}

export function listIndustriesBySector(sector: GicsSector): readonly GicsIndustry[] {
  return GICS_INDUSTRIES.filter((row) => row.sector === sector);
}

export function getIndustryByCode(code: string): GicsIndustry | null {
  return industryByCode.get(code) ?? null;
}

export function assertGicsIndustryCatalog(): void {
  if (GICS_INDUSTRIES.length !== 74) {
    throw new Error(`期望 74 个 Industry，实际 ${GICS_INDUSTRIES.length}`);
  }
  if (GICS_SUB_INDUSTRIES.length !== 163) {
    throw new Error(`期望 163 个 Sub-Industry，实际 ${GICS_SUB_INDUSTRIES.length}`);
  }
  for (const row of GICS_INDUSTRIES) {
    if (!getIndustryStyle(row.code)) {
      throw new Error(`Industry 缺少风格标注: ${row.code} ${row.nameEn}`);
    }
  }
}
