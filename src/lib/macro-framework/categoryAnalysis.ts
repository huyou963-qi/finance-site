import type { Tr } from "@/i18n/text";
import { identityTr } from "@/i18n/text";
import type { MatrixCategory } from "./matrixCategories";
import { MATRIX_CATEGORY_LABEL } from "./matrixCategories";
import type { MacroIndicator } from "./types";
import { changeArrow, formatValue } from "./utils";

/** 数值下降代表改善的指标 */
const LOWER_IS_BETTER = new Set([
  "jobless-claims",
  "unemployment",
  "hy-oas",
  "nfci",
  "fed-deficit-12m",
  "delinq-rate",
  "charge-off",
  "core-pce",
  "core-cpi",
  "headline-cpi",
  "supercore",
  "sticky-cpi",
  "inv-sales",
  "primary-balance",
  "interest-rev",
  "fed-debt-gdp",
  "goods-trade",
  "wti",
  "sloos",
]);

function hasLivePair(ind: MacroIndicator): ind is MacroIndicator & {
  value: number;
  prevValue: number;
} {
  return ind.value !== null && ind.prevValue !== null;
}

function isImproving(ind: MacroIndicator): boolean {
  if (!hasLivePair(ind)) return false;
  const delta = ind.value - ind.prevValue;
  if (Math.abs(delta) < 0.005) return true;
  const rising = delta > 0;
  return LOWER_IS_BETTER.has(ind.id) ? !rising : rising;
}

function toneLabel(ratio: number): string {
  if (ratio >= 0.75) return "偏强";
  if (ratio >= 0.55) return "温和改善";
  if (ratio >= 0.45) return "大致中性";
  if (ratio >= 0.25) return "温和走弱";
  return "偏弱";
}

function pickHighlights(items: MacroIndicator[], n = 2): MacroIndicator[] {
  return [...items]
    .filter(hasLivePair)
    .sort((a, b) => Math.abs(b.value - b.prevValue) - Math.abs(a.value - a.prevValue))
    .slice(0, n);
}

function fmtHighlight(ind: MacroIndicator, tr: Tr, pickName: (ind: MacroIndicator) => string): string {
  const chg = changeArrow(ind.value, ind.prevValue);
  return `${pickName(ind)} ${formatValue(ind.value, tr(ind.unit))}${chg}`;
}

function groupRatio(items: MacroIndicator[]): number {
  const live = items.filter(hasLivePair);
  if (live.length === 0) return 0.5;
  return live.filter(isImproving).length / live.length;
}

const CATEGORY_OPEN: Record<MatrixCategory, string> = {
  activity: "实体生产链",
  consumption: "内需消费端",
  investment: "投资与住房",
  labor: "劳动力市场",
  inflation: "通胀层面",
  financial: "金融条件",
  external: "外需与汇率",
  policy: "政策立场",
};

/** 根据当前指标快照生成 2–3 句近况分析（中文原文即键，英文站经 tr 翻译） */
export function generateCategoryBrief(
  category: MatrixCategory,
  indicators: MacroIndicator[],
  tr: Tr = identityTr,
  pickName: (ind: MacroIndicator) => string = (ind) => ind.nameZh,
): string {
  if (indicators.length === 0) {
    return tr("{label}暂无可观测指标。", { label: tr(MATRIX_CATEGORY_LABEL[category]) });
  }

  const leading = indicators.filter((i) => i.timing === "leading");
  const coincident = indicators.filter((i) => i.timing === "coincident");
  const lagging = indicators.filter((i) => i.timing === "lagging");

  const leadR = groupRatio(leading);
  const coinR = groupRatio(coincident);
  const lagR = groupRatio(lagging);

  const parts: string[] = [];

  parts.push(
    tr("{open}{tone}：领先指标 {pct}% 方向向好。", {
      open: tr(CATEGORY_OPEN[category]),
      tone: tr(toneLabel(leadR)),
      pct: Math.round(leadR * 100),
    }),
  );

  if (leading.length > 0) {
    const hl = pickHighlights(leading, 2).map((ind) => fmtHighlight(ind, tr, pickName)).join(tr("；"));
    parts.push(tr("关注 {hl}。", { hl }));
  }

  if (coincident.length > 0) {
    const syncTone = tr(toneLabel(coinR));
    if (Math.abs(coinR - leadR) < 0.25) {
      parts.push(tr("同步指标{tone}，与领先信号基本一致。", { tone: syncTone }));
    } else if (coinR > leadR) {
      parts.push(tr("同步端表现{tone}，硬数据优于软数据预期。", { tone: syncTone }));
    } else {
      parts.push(tr("同步端{tone}，软数据与硬数据出现一定背离。", { tone: syncTone }));
    }
  }

  if (lagging.length > 0) {
    const lagHl = pickHighlights(lagging, 1).map((ind) => fmtHighlight(ind, tr, pickName)).join(tr("；"));
    const lagTone = tr(toneLabel(lagR));
    parts.push(tr("滞后指标{tone}，{hl}。", { tone: lagTone, hl: lagHl }));
  }

  return parts.join("");
}

export function generateAllCategoryBriefs(
  grouped: Record<MatrixCategory, MacroIndicator[]>,
  tr: Tr = identityTr,
  pickName: (ind: MacroIndicator) => string = (ind) => ind.nameZh,
): Record<MatrixCategory, string> {
  const out = {} as Record<MatrixCategory, string>;
  for (const cat of Object.keys(grouped) as MatrixCategory[]) {
    out[cat] = generateCategoryBrief(cat, grouped[cat] ?? [], tr, pickName);
  }
  return out;
}
