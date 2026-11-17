import assert from "node:assert/strict";
import test from "node:test";
import { makeTr } from "@/i18n/text";
import { generateCategoryBrief } from "@/lib/macro-framework/categoryAnalysis";
import type { MacroIndicator } from "@/lib/macro-framework/types";

const base: MacroIndicator = {
  id: "ism-pmi",
  nameEn: "ISM Manufacturing PMI",
  nameZh: "ISM 制造业 PMI",
  timing: "leading",
  sector: "corporate",
  value: 52,
  unit: "指数",
  prevValue: 50,
  releaseFreq: "月度",
  asOfDate: "2026-06",
  source: "ISM",
  sparkline: [],
  description: "x",
};

test("近况分析模板经 tr 翻译，中文站不变", () => {
  const zh = generateCategoryBrief("activity", []);
  assert.match(zh, /生产与景气暂无可观测指标/);

  const tr = makeTr({
    "{label}暂无可观测指标。": "{label}: no observable indicators yet.",
    生产与景气: "Activity & sentiment",
  });
  const en = generateCategoryBrief("activity", [], tr);
  assert.equal(en, "Activity & sentiment: no observable indicators yet.");
});

test("有指标时保留数值占位并翻译语气", () => {
  const tr = makeTr({
    "{open}{tone}：领先指标 {pct}% 方向向好。": "{open} {tone}: {pct}% of leading indicators are improving.",
    实体生产链: "Real activity",
    偏强: "firm",
    "关注 {hl}。": "Watch {hl}.",
    "；": "; ",
    指数: "index",
  });
  const out = generateCategoryBrief("activity", [{ ...base }], tr, (ind) => ind.nameEn);
  assert.match(out, /Real activity firm: 100% of leading indicators are improving\./);
  assert.match(out, /Watch ISM Manufacturing PMI/);
});
