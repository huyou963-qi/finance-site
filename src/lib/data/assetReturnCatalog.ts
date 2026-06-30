import type { InstrumentKind } from "@prisma/client";

export type AssetCode = "10Y" | "SPX" | "XAU";

export const ASSET_RETURN_TIMEFRAME = "1d";

export type AssetReturnDef = {
  instrumentCode: string;
  name: string;
  kind: InstrumentKind;
  xlsxFile: string;
};

export const ASSET_RETURN_DEFS: Record<AssetCode, AssetReturnDef> = {
  "10Y": {
    instrumentCode: "asset_ret_10y",
    name: "美国10年期国债收益率",
    kind: "MACRO_SERIES",
    xlsxFile: "10Y.xlsx",
  },
  SPX: {
    instrumentCode: "asset_ret_spx",
    name: "标普500指数",
    kind: "INDEX_SPOT",
    xlsxFile: "SPX.xlsx",
  },
  XAU: {
    instrumentCode: "asset_ret_xau",
    name: "黄金",
    kind: "COMMODITY",
    xlsxFile: "XAU.xlsx",
  },
};

export const ALL_ASSET_CODES = Object.keys(ASSET_RETURN_DEFS) as AssetCode[];
