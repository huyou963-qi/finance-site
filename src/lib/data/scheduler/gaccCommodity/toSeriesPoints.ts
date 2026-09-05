import type { ObservationPoint } from "../types";
import {
  GACC_QTY_UNITS,
  gaccCode,
  gaccCommodities,
  gaccRowKey,
  normalizeGaccQtyUnit,
  type GaccCommodity,
  type TradeDirection,
} from "./catalog";
import type { ParsedGaccCommodityTable } from "./parseCommodityTable";

/**
 * 已解析的量值表 + 精选商品目录 → 各仪器的当月观测点。
 *
 * 三个口径：
 *   qty   = 源数量，折算到目录声明的 qtyUnit（万吨 / 亿个 / 辆 …）
 *   value = 源金额 × 单位倍数 ÷ 1e8 → 亿美元（仅当该期表以美元计价）
 *   price = 源金额 × 单位倍数 ÷（源数量 × 源单位倍数）→ 美元 / 量纲基准单位
 *
 * 单价只是量值表的定义式比值 + 单位归一，不是分析变换。两种情况不出金额与单价、但仍出数量：
 *   - 该期表以人民币计价（2025 年全年出口表如此）—— 不做汇率换算，绝不混币种；
 *   - 数量缺失或为 0（源表里 Soya bean oil 这类小额商品当月数量确会四舍五入成 0）。
 */

export type GaccSeriesPoint = { code: string; point: ObservationPoint };

export type BuiltGaccPoints = {
  points: GaccSeriesPoint[];
  /** 目录里有、但本期表中缺行的商品（早期表尚未收录该商品时正常出现） */
  missing: string[];
  /** 该期是否因非美元计价而只落了数量 */
  valueSkippedByCurrency: boolean;
};

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/**
 * 源单位 → { 换算到目录 qtyUnit 的倍数, 换算到量纲基准单位的倍数 }。
 * 量纲不一致（计件改计重之类）直接 throw；同量纲换单位（2018 年集成电路是 MN，
 * 现在是 100MN；2020 年鞋类是 10000PR，现在是 100MP）自动折算，序列不会出现断层。
 */
function unitScales(
  commodity: GaccCommodity,
  actualUnit: string,
  direction: TradeDirection,
): { toCatalog: number; toBase: number } {
  const canonicalKey = normalizeGaccQtyUnit(commodity.qtyUnit);
  const actualKey = normalizeGaccQtyUnit(actualUnit);
  const canonical = GACC_QTY_UNITS[canonicalKey];
  const actual = GACC_QTY_UNITS[actualKey];
  if (!canonical) {
    throw new Error(
      `海关主要商品量值表：目录单位 ${commodity.qtyUnit} 未登记（请补 GACC_QTY_UNITS）`,
    );
  }
  if (!actual) {
    throw new Error(
      `海关主要商品量值表：${direction}「${commodity.sourceName}」出现未登记的数量单位 ${actualUnit}` +
        "（请在 GACC_QTY_UNITS 补量纲与倍数）",
    );
  }
  if (actual.dimension !== canonical.dimension) {
    throw new Error(
      `海关主要商品量值表：${direction}「${commodity.sourceName}」数量单位 ${actualUnit}` +
        `（${actual.dimension}）与目录 ${commodity.qtyUnit}（${canonical.dimension}）量纲不同，` +
        "口径已变，拒绝入库（请更新 catalog）",
    );
  }
  return { toCatalog: actual.factor / canonical.factor, toBase: actual.factor };
}

export function buildGaccSeriesPoints(
  direction: TradeDirection,
  parsed: ParsedGaccCommodityTable,
): BuiltGaccPoints {
  const points: GaccSeriesPoint[] = [];
  const missing: string[] = [];
  const usd = parsed.valueUnit.currency === "USD";

  for (const commodity of gaccCommodities(direction)) {
    const keys = [commodity.sourceName, ...(commodity.aliases ?? [])].map(gaccRowKey);
    const duplicated = keys.find((k) => parsed.duplicates.has(k));
    if (duplicated) {
      throw new Error(
        `海关主要商品量值表：${direction}「${duplicated}」本期有多行同名数据，` +
          "无法确定取哪一行（请在目录里换用更明确的行名）",
      );
    }
    const row = keys.map((k) => parsed.rows.get(k)).find((r) => r !== undefined);
    if (!row) {
      missing.push(commodity.sourceName);
      continue;
    }
    const { qty, value } = row;
    const scales = qty === null ? null : unitScales(commodity, row.qtyUnit, direction);

    if (qty !== null && scales) {
      points.push({
        code: gaccCode(direction, commodity.slug, "qty"),
        point: { obsDate: parsed.obsDate, value: round(qty * scales.toCatalog, 4) },
      });
    }
    if (value !== null && usd) {
      points.push({
        code: gaccCode(direction, commodity.slug, "value"),
        point: {
          obsDate: parsed.obsDate,
          value: round((value * parsed.valueUnit.factor) / 100_000_000, 6),
        },
      });
    }
    if (qty !== null && qty > 0 && value !== null && usd && scales) {
      const price = (value * parsed.valueUnit.factor) / (qty * scales.toBase);
      if (!Number.isFinite(price) || price <= 0) {
        throw new Error(
          `海关主要商品量值表：${direction}「${commodity.sourceName}」单价计算得到 ${price}`,
        );
      }
      points.push({
        code: gaccCode(direction, commodity.slug, "price"),
        point: { obsDate: parsed.obsDate, value: round(price, 4) },
      });
    }
  }

  if (points.length === 0) {
    throw new Error(
      `海关主要商品量值表：${direction} 本期 0 个精选商品命中（共 ${parsed.rows.size} 行，` +
        "英文商品名可能整体改版）",
    );
  }
  return { points, missing, valueSkippedByCurrency: !usd };
}
