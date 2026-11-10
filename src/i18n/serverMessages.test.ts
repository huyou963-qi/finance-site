import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { buildPasswordResetUrl, buildVerifyUrl } from "@/lib/mail";
import { SERVER_MESSAGES_EN, localizeServerMessage, requestLocale } from "@/i18n/serverMessages";

/** 用户会看到的服务端提示的来源：登录/注册业务、限流、同源校验、auth 接口 */
function sourceFiles(): string[] {
  const root = process.cwd();
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
    });
  return [
    resolve(root, "src/lib/auth.ts"),
    resolve(root, "src/lib/auth/loginThrottle.ts"),
    resolve(root, "src/lib/http/sameOrigin.ts"),
    ...walk(resolve(root, "src/app/api/auth")),
  ];
}

test("auth 相关代码里的中文提示都有英文", () => {
  const missing: string[] = [];
  for (const file of sourceFiles()) {
    const src = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const m of src.matchAll(/["`]([^"`\n]*[一-鿿][^"`\n]*)["`]/g)) {
      if (!(m[1] in SERVER_MESSAGES_EN)) missing.push(`${file}: ${m[1]}`);
    }
  }
  assert.deepEqual(missing, [], "在 src/i18n/serverMessages.ts 补上英文");
});

test("英文只在 en 时替换，查不到原样返回", () => {
  assert.equal(localizeServerMessage("账号或密码错误", "en"), "Incorrect account or password");
  assert.equal(localizeServerMessage("账号或密码错误", "zh"), "账号或密码错误");
  assert.equal(localizeServerMessage("新的未登记提示", "en"), "新的未登记提示");
});

test("requestLocale 读 NEXT_LOCALE cookie", () => {
  const req = (value?: string) => ({ cookies: { get: () => (value ? { value } : undefined) } });
  assert.equal(requestLocale(req("en")), "en");
  assert.equal(requestLocale(req("fr")), "zh");
  assert.equal(requestLocale(req()), "zh");
});

test("邮件链接跟随语言", () => {
  process.env.APP_BASE_URL = "https://example.com";
  assert.equal(buildVerifyUrl("abc"), "https://example.com/auth/verify?token=abc");
  assert.equal(buildVerifyUrl("abc", "en"), "https://example.com/en/auth/verify?token=abc");
  assert.equal(buildPasswordResetUrl("a b", "en"), "https://example.com/en/auth/reset-password?token=a%20b");
});
