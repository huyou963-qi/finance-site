import { expect, test, type Page } from "@playwright/test";

const SMOKE_USER = process.env.L3_E2E_USERNAME ?? "l3smoke";
const SMOKE_PASS = process.env.L3_E2E_PASSWORD ?? "L3SmokePass1!";

async function collectPageErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Empty macro/kline data and missing optional APIs are acceptable in a blank L3 DB.
      if (/Failed to load resource|net::ERR_|hydration|宏观序列数读取失败/i.test(text)) return;
      errors.push(text);
    }
  });
  return errors;
}

test.describe("L3 anonymous smoke", () => {
  test("homepage renders brand and primary CTAs", async ({ page }) => {
    const errors = await collectPageErrors(page);
    const res = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(res?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { name: /全球市场/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /进入宏观|行情/ }).first()).toBeVisible();
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("macro and markets pages open without 5xx", async ({ page }) => {
    const errors = await collectPageErrors(page);
    for (const path of ["/macro", "/markets", "/pricing", "/auth"]) {
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(res?.status() ?? 0, path).toBeLessThan(500);
      await expect(page.locator("body")).toBeVisible();
    }
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("health endpoint reports db ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { ok: boolean; db: boolean };
    expect(body.ok).toBe(true);
    expect(body.db).toBe(true);
  });
});

test.describe("L3 authenticated smoke", () => {
  test("free user can log in and is denied admin API", async ({ page }) => {
    const errors = await collectPageErrors(page);
    await page.goto("/auth", { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "登录" }).click();
    await page.getByPlaceholder("用户名 / 手机号 / 邮箱").fill(SMOKE_USER);
    await page.getByPlaceholder("请输入密码").fill(SMOKE_PASS);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/", { timeout: 20_000 }),
      page.locator("form").getByRole("button", { name: "登录", exact: true }).click(),
    ]);
    await expect(page.getByRole("button", { name: "账户菜单" })).toBeVisible();

    const me = await page.request.get("/api/auth/me");
    expect(me.status()).toBe(200);
    const meBody = (await me.json()) as { user: { username: string } };
    expect(meBody.user.username).toBe(SMOKE_USER);

    const admin = await page.request.get("/api/admin/feature-access");
    expect(admin.status()).toBe(403);

    await page.goto("/admin/feature-access", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/无管理员权限|未登录/)).toBeVisible({ timeout: 15_000 });
    expect(errors, errors.join("\n")).toEqual([]);
  });
});

test.describe("L3 mobile viewport", () => {
  test("home/macro/markets/pricing have no horizontal overflow", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "mobile project only");
    for (const path of ["/", "/macro", "/markets", "/pricing"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
        };
      });
      expect(overflow.scrollWidth, path).toBeLessThanOrEqual(overflow.clientWidth + 1);
    }
  });
});
