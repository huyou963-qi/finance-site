import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchMarketInternalsIncremental } from "./marketInternalsAdapter";

test("广度日常更新只追加新日期，在线与独立校验均不改写导入历史", async () => {
  for (const membershipCorroborated of [false, true]) {
    const deps = {
      loadBreadth: async () => ({ rows: [
        { date: "2026-10-15", values: { above50: 1 } },
        { date: "2026-10-16", values: { above50: 2 } },
        { date: "2026-10-19", values: { above50: 52 } },
      ], anchor: "2026-10-19", source: "fixture", calendarThrough: "2026-10-19", membershipCorroborated }),
      loadStyles: async () => { throw new Error("should not load styles"); },
      lastStoredDate: async () => new Date("2026-10-16T00:00:00Z"),
    };
    const result = await fetchMarketInternalsIncremental({}, "breadth_us_sp500_above50_daily", "2026-08-16", deps);
    assert.deepEqual(result.points, [{ obsDate: new Date("2026-10-19T00:00:00Z"), value: 52 }]);
    const noNew = await fetchMarketInternalsIncremental({}, "breadth_us_sp500_above50_daily", "2026-08-16", { ...deps, lastStoredDate: async () => new Date("2026-10-19T00:00:00Z") });
    assert.deepEqual(noNew.points, []);
  }
});

test("官方风格文件继续回读修订，不应用广度的历史保护边界", async () => {
  const result = await fetchMarketInternalsIncremental({}, "ff_us_smb_daily", "1995-01-01", {
    loadBreadth: async () => { throw new Error("should not load breadth"); },
    loadStyles: async () => [{ date: "1995-01-03", values: { SMB: 0.2 } }],
    lastStoredDate: async () => { throw new Error("should not restrict official revisions"); },
  });
  assert.equal(result.points.length, 1);
});
