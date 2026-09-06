import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isMacroAssetGroupHead,
  macroAssetGroupNameZh,
  MACRO_ASSET_CLASSES,
  MACRO_ASSET_GROUPS,
  MACRO_ASSET_SYMBOLS,
} from "./macroAssetClasses";
import { GICS_SECTOR_DEFS, BENCHMARK_ETF } from "./gicsCatalog";
import { stageEdgeToleranceSec, stageWindowReturn } from "./sectorReturns";

const DAY = 86400;

describe("macroAssetClasses", () => {
  it("id / symbol 唯一，且不与行业 ETF 或基准重复", () => {
    const ids = MACRO_ASSET_CLASSES.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(new Set(MACRO_ASSET_SYMBOLS).size, MACRO_ASSET_SYMBOLS.length);
    const equitySymbols = new Set([
      BENCHMARK_ETF,
      ...GICS_SECTOR_DEFS.map((d) => d.etf),
    ]);
    for (const symbol of MACRO_ASSET_SYMBOLS) {
      assert.ok(!equitySymbols.has(symbol), `${symbol} 与股票口径重复`);
    }
  });

  it("每个资产的分组都在分组目录内，且表内按分组连续排列", () => {
    const groupIds = MACRO_ASSET_GROUPS.map((g) => g.id);
    const seen: string[] = [];
    for (const asset of MACRO_ASSET_CLASSES) {
      assert.ok(groupIds.includes(asset.group), `${asset.id} 分组未注册`);
      if (seen.at(-1) !== asset.group) {
        assert.ok(!seen.includes(asset.group), `${asset.group} 在表内被拆散`);
        seen.push(asset.group);
      }
    }
    assert.ok(seen.length >= 2);
  });

  it("分组名与组首标记可用于渲染", () => {
    assert.equal(macroAssetGroupNameZh("rates"), "利率");
    assert.equal(isMacroAssetGroupHead(0), true);
    const firstCreditIndex = MACRO_ASSET_CLASSES.findIndex((a) => a.group === "credit");
    assert.equal(isMacroAssetGroupHead(firstCreditIndex), true);
    assert.equal(isMacroAssetGroupHead(firstCreditIndex + 1), false);
  });

  it("每条代理都写清了口径与研究用途", () => {
    for (const asset of MACRO_ASSET_CLASSES) {
      assert.ok(asset.proxyZh.length > 4, `${asset.id} 缺代理口径`);
      assert.ok(asset.readsZh.length > 4, `${asset.id} 缺研究用途`);
    }
  });
});

describe("stageWindowReturn", () => {
  const from = 1_000 * DAY;
  const to = from + 400 * DAY;

  it("首尾贴边时返回区间总收益", () => {
    const points = [
      { time: from + DAY, value: 100 },
      { time: from + 200 * DAY, value: 90 },
      { time: to - DAY, value: 120 },
    ];
    const r = stageWindowReturn(points, from, to);
    assert.ok(r != null && Math.abs(r - 0.2) < 1e-9);
  });

  it("序列晚于阶段起点上市时判为不可比", () => {
    const points = [
      { time: from + 120 * DAY, value: 100 },
      { time: to - DAY, value: 150 },
    ];
    assert.equal(stageWindowReturn(points, from, to), null);
  });

  it("序列在阶段结束前很久就断掉时判为不可比", () => {
    const points = [
      { time: from + DAY, value: 100 },
      { time: to - 120 * DAY, value: 150 },
    ];
    assert.equal(stageWindowReturn(points, from, to), null);
  });

  it("容差吸收假期与尾部滞后，但短窗口按比例收紧", () => {
    assert.equal(stageEdgeToleranceSec(from, to), 15 * DAY);
    const shortTo = from + 30 * DAY;
    assert.equal(stageEdgeToleranceSec(from, shortTo), 6 * DAY);
    const holidayGap = [
      { time: from + 4 * DAY, value: 100 },
      { time: to - 9 * DAY, value: 110 },
    ];
    assert.ok(stageWindowReturn(holidayGap, from, to) != null);
    const tooLateInShortWindow = [
      { time: from + 8 * DAY, value: 100 },
      { time: shortTo, value: 110 },
    ];
    assert.equal(stageWindowReturn(tooLateInShortWindow, from, shortTo), null);
  });

  it("窗口内不足两个样本或首值为 0 时返回 null", () => {
    assert.equal(stageWindowReturn([{ time: from + DAY, value: 100 }], from, to), null);
    assert.equal(stageWindowReturn(undefined, from, to), null);
    assert.equal(
      stageWindowReturn(
        [
          { time: from + DAY, value: 0 },
          { time: to - DAY, value: 100 },
        ],
        from,
        to,
      ),
      null,
    );
  });
});
