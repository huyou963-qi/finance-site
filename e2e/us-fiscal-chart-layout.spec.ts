import { expect, test } from "@playwright/test";
import templates from "../src/lib/data/usFiscalTemplateUpdates.json";
import {
  US_FISCAL_VIEW_IDS,
  US_FISCAL_VIEW_LABELS,
} from "../src/lib/data/usFiscalViewTypes";

const views = Object.fromEntries(
  US_FISCAL_VIEW_IDS.map((id) => {
    const categories =
      id === "C4"
        ? ["2027-01", "2027-02"]
        : id === "B4"
          ? ["10月", "11月"]
          : ["2025-11", "2025-12"];
    return [
      id,
      {
        id,
        title: US_FISCAL_VIEW_LABELS[id],
        unit: "%",
        asOf: "2025-12",
        categories,
        series: [
          { name: "序列", data: [10, 12], color: "#2383e2", type: "line" },
        ],
        table: { columns: ["期间", "余额"], rows: [["2025-12", 12]] },
        note: "示例口径",
      },
    ];
  }),
);

test("the three fiscal templates use the standard macro grid on desktop and mobile", async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name === "mobile-chrome";
  let active = Object.entries(templates)[0]!;
  await page.route("**/api/tools/macro-chart-prefs", (route) =>
    route.fulfill({
      json: {
        prefs: { ...active[1], version: 2, activeTemplateId: active[0] },
        builtinTemplateOverrides: templates,
      },
    }),
  );
  await page.route("**/api/data/us-fiscal-views", (route) =>
    route.fulfill({ json: { views, attribution: "测试数据" } }),
  );

  for (const [index, entry] of Object.entries(templates).entries()) {
    active = entry;
    await page.goto("/macro");
    await (
      mobile
        ? page.getByRole("button", { name: "图表", exact: true })
        : page.getByRole("tab", { name: "图表", exact: true })
    ).click();
    const charts = page.locator(".echarts-for-react:visible");
    await expect(charts).toHaveCount(6);
    await expect(page.getByRole("button", { name: "拖动左边界" })).toHaveCount(
      1,
    );
    const first = (await charts.nth(0).boundingBox())!;
    const second = (await charts.nth(1).boundingBox())!;
    expect(first.height).toBeGreaterThan(100);
    expect(Math.abs(first.height - second.height)).toBeLessThan(2);
    if (mobile) {
      expect(Math.abs(first.x - second.x)).toBeLessThan(2);
      expect(second.y).toBeGreaterThan(first.y);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
    } else {
      expect(Math.abs(first.y - second.y)).toBeLessThan(2);
      expect(second.x).toBeGreaterThan(first.x);
    }

    if (index === 0) {
      await (
        mobile
          ? page.getByRole("button", { name: "设置", exact: true })
          : page.getByTitle("展开图形设置")
      ).click();
      await page.getByRole("button", { name: "数据表", exact: true }).click();
      await page.locator("summary").filter({ hasText: "公共债务存量" }).click();
      await expect(
        page.getByRole("table", { name: "公共债务存量" }).getByText("2025-12"),
      ).toBeVisible();
    }
  }
});
