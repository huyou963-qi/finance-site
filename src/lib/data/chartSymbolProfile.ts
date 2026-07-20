/**
 * K 线标的画像：分类 + 事件筛选默认草稿（图/列表共用）。
 * 同步分类不依赖 DB；个股 GICS 可由服务端 resolve 补全。
 */

import { GICS_SECTOR_CODES } from "@/lib/data/eventTaxonomy";
import {
  findMarketInstrument,
  type MarketInstrumentType,
} from "@/lib/data/marketInstruments";
import { normalizeAssetTag } from "@/lib/data/marketEvents";
import {
  GICS_SECTOR_DEFS,
  type GicsSector,
} from "@/lib/equity/gicsCatalog";
import type { EventTypeFamilyId } from "@/lib/data/eventTaxonomy";

export type ChartSymbolKind =
  | "sector_etf"
  | "index"
  | "macro_asset"
  | "equity"
  | "unknown";

export type ChartSymbolProfile = {
  symbol: string;
  kind: ChartSymbolKind;
  /** 展示用中文标签 */
  kindLabel: string;
  countries: string[];
  industries: string[];
  /** 大类资产子类（仅 macro_asset） */
  macroType?: MarketInstrumentType;
  /** 行业 ETF 对应 GICS sector（仅 sector_etf） */
  gicsSector?: GicsSector;
};

/** 宽基股指 / 指数 ETF */
export const BROAD_INDEX_SYMBOLS = [
  "SPY",
  "QQQ",
  "DIA",
  "IWM",
  "RSP",
  "VOO",
  "IVV",
  "VTI",
] as const;

const INDEX_SET = new Set(
  BROAD_INDEX_SYMBOLS.map((s) => s.toUpperCase()),
);

const SECTOR_ETF_BY_SYMBOL = new Map(
  GICS_SECTOR_DEFS.map((d) => [d.etf.toUpperCase(), d] as const),
);

export type EventFilterDraft = {
  typeFamilies: EventTypeFamilyId[];
  countries: string[];
  industries: string[];
  assets: string[];
  persons: string[];
  institutions: string[];
};

const MACRO_POLICY: EventTypeFamilyId[] = ["policy", "macro"];
const COMPANY_RATING: EventTypeFamilyId[] = ["company", "rating"];

function kindLabelOf(
  kind: ChartSymbolKind,
  macroType?: MarketInstrumentType,
): string {
  if (kind === "sector_etf") return "行业";
  if (kind === "index") return "股指";
  if (kind === "macro_asset") return macroType ? `大类资产(${macroType})` : "大类资产";
  if (kind === "equity") return "个股";
  return "未知";
}

/**
 * 同步分类（无 DB）。个股 industries 为空，需 resolveChartSymbolIndustries 补全。
 */
export function classifyChartSymbol(symbolRaw: string): ChartSymbolProfile {
  const symbol = normalizeAssetTag(symbolRaw);
  const upper = symbol.toUpperCase();

  const sectorDef = SECTOR_ETF_BY_SYMBOL.get(upper);
  if (sectorDef) {
    const code = GICS_SECTOR_CODES[sectorDef.sector];
    return {
      symbol,
      kind: "sector_etf",
      kindLabel: kindLabelOf("sector_etf"),
      countries: ["US"],
      industries: code ? [code] : [],
      gicsSector: sectorDef.sector,
    };
  }

  if (INDEX_SET.has(upper)) {
    return {
      symbol,
      kind: "index",
      kindLabel: kindLabelOf("index"),
      countries: ["US"],
      industries: [],
    };
  }

  const instrument = findMarketInstrument(symbol);
  if (instrument) {
    return {
      symbol,
      kind: "macro_asset",
      kindLabel: kindLabelOf("macro_asset", instrument.type),
      countries: ["US"],
      industries: [],
      macroType: instrument.type,
    };
  }

  return {
    symbol,
    kind: "equity",
    kindLabel: kindLabelOf("equity"),
    countries: ["US"],
    industries: [],
  };
}

/**
 * 按标的画像生成筛选草稿。
 * 国家仅写入「跟随」展示徽章用的 profile；筛选 tags 按规则：
 * - 股指/大类/个股：填资产；国家不进匹配 tags（避免 OR/AND 过宽或过严）
 * - 行业 ETF：只填行业，不填资产
 * - 个股：可带 industries（若已解析）
 */
export function deriveEventFilterDraft(
  profile: ChartSymbolProfile,
): EventFilterDraft {
  const emptyPeople = { persons: [] as string[], institutions: [] as string[] };

  if (profile.kind === "sector_etf") {
    return {
      typeFamilies: [...MACRO_POLICY],
      countries: [],
      industries: [...profile.industries],
      assets: [],
      ...emptyPeople,
    };
  }

  if (profile.kind === "index" || profile.kind === "macro_asset") {
    return {
      typeFamilies: [...MACRO_POLICY],
      countries: [],
      industries: [],
      assets: [profile.symbol],
      ...emptyPeople,
    };
  }

  // equity / unknown
  return {
    typeFamilies: [...COMPANY_RATING],
    countries: [],
    industries: [...profile.industries],
    assets: [profile.symbol],
    ...emptyPeople,
  };
}

/** 换标的时覆盖到统一筛选状态的字段 */
export function applySymbolDraftToFilters<T extends EventFilterDraft>(
  prev: T,
  draft: EventFilterDraft,
): T {
  return {
    ...prev,
    typeFamilies: [...draft.typeFamilies],
    countries: [...draft.countries],
    industries: [...draft.industries],
    assets: [...draft.assets],
    persons: [...draft.persons],
    institutions: [...draft.institutions],
  };
}
