import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { interpolate, translateText } from "@/i18n/text";
import { loadEnglishText } from "@/i18n/text/en";
import { scanFile } from "@/i18n/tooling/cjkScan";

/**
 * 已完成「源文本做键」翻译的功能页文件/目录。翻完一个模块就登记进来：
 * 组件里不得再有未包裹的中文，所有原文都要有英文。
 */
export const TRANSLATED_FEATURE_PATHS = [
  "src/app/macro",
  "src/components/macro",
  "src/components/macro-framework",
  "src/components/MacroChart.tsx",
  "src/components/MacroChartAxisSettings.tsx",
  "src/components/MacroChartDrawingToolbar.tsx",
  "src/components/MacroChartIndicatorAssignment.tsx",
  "src/components/MacroChartPanel.tsx",
  "src/components/MacroExtractedDataTable.tsx",
  "src/components/MacroMultiChartGrid.tsx",
  "src/components/MacroTemplateFolderSection.tsx",
  "src/components/MacroTimeRangeNavigator.tsx",
  "src/components/SelectedIndicatorsList.tsx",
  "src/components/UnifiedMacroSidebar.tsx",
  // 指标预测（*ModelDetails 只给管理员看，不翻译）
  "src/app/forecast",
  "src/components/forecast/ForecastSidebarNav.tsx",
  "src/components/forecast/UsCpiNowcastCharts.tsx",
  "src/components/forecast/UsCpiNowcastView.tsx",
  "src/components/forecast/UsGdpNowcastCharts.tsx",
  "src/components/forecast/UsGdpNowcastView.tsx",
  "src/components/forecast/UsNfpNowcastCharts.tsx",
  "src/components/forecast/UsNfpNowcastView.tsx",
  // 行情与事件
  "src/app/markets",
  "src/components/CandlestickPanel.tsx",
  "src/components/StockChartWorkspace.tsx",
  "src/components/MarketsWatchlist.tsx",
  "src/components/chart",
  "src/components/events",
];

function files(): string[] {
  const walk = (p: string): string[] =>
    statSync(p).isFile()
      ? /\.tsx?$/.test(p) && !/\.test\./.test(p)
        ? [p]
        : []
      : readdirSync(p).flatMap((n) => walk(join(p, n)));
  return TRANSLATED_FEATURE_PATHS.flatMap((p) => walk(resolve(process.cwd(), p)));
}

test("interpolate / translateText", () => {
  assert.equal(interpolate("共 {count} 条", { count: 3 }), "共 3 条");
  assert.equal(interpolate("保留 {x}", {}), "保留 {x}");
  assert.equal(translateText("宏观数据", null), "宏观数据");
  assert.equal(translateText("宏观数据", { 宏观数据: "Macro Data" }), "Macro Data");
  assert.equal(translateText("{n} 张", { "{n} 张": "{n} charts" }, { n: 2 }), "2 charts");
  assert.equal(translateText("未登记", {}), "未登记");
});

test("已翻译的功能页：组件里没有未包裹的中文，且每条原文都有英文", async () => {
  const dict = await loadEnglishText();
  const unwrapped: string[] = [];
  const missing = new Set<string>();
  for (const file of files()) {
    const code = readFileSync(file, "utf8");
    const trName = /const tx = (useTr\(\)|await getServerTr\(\))/.test(code) ? "tx" : "tr";
    const scan = scanFile(file, code, { trName });
    for (const s of scan.sources) unwrapped.push(`${file}: ${s}`);
    const manual = scan.manual.filter((m) => !m.reason.startsWith("数据位置")).map((m) => m.text);
    for (const s of [...scan.existing, ...manual]) if (!(s in dict)) missing.add(s);
  }
  assert.deepEqual(unwrapped, [], "运行 scripts/i18n/wrap-cjk.ts --write 包裹");
  assert.deepEqual([...missing], [], "在 src/i18n/text/en/*.json 补英文");
});
