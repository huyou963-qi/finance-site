import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { reportClientError, type ClientErrorReportInput } from "./clientReport";

const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
const sent = new Map<string, string>();
Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: { getItem: (key: string) => sent.get(key) ?? null, setItem: (key: string, value: string) => sent.set(key, value) },
});
beforeEach(() => sent.clear());
after(() => {
  if (previousStorage) Object.defineProperty(globalThis, "sessionStorage", previousStorage);
  else Reflect.deleteProperty(globalThis, "sessionStorage");
});

const automatic: ClientErrorReportInput = {
  source: "auto_window", message: "unhandledrejection (undefined)", pageUrl: "https://example.com/",
};
const success = () => new Response(JSON.stringify({ id: "saved" }), { status: 201 });

test("同一自动错误在首次请求返回前也只发送一次，成功后保持会话去重", async (t) => {
  let resolveResponse!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => { resolveResponse = resolve; });
  const fetch = t.mock.method(globalThis, "fetch", () => pending);
  const first = reportClientError(automatic);
  assert.deepEqual(await reportClientError(automatic), { skipped: true });
  assert.equal(fetch.mock.callCount(), 1);
  resolveResponse(success());
  assert.equal((await first).id, "saved");
  assert.deepEqual(await reportClientError(automatic), { skipped: true });
  assert.equal(fetch.mock.callCount(), 1);
});

test("网络或HTTP失败不永久占用指纹，后续相同错误可以重试", async (t) => {
  for (const kind of ["network", "http"]) {
    let calls = 0;
    const fetch = t.mock.method(globalThis, "fetch", async () => {
      calls += 1;
      if (calls === 1) {
        if (kind === "network") throw new Error("offline");
        return new Response(JSON.stringify({ error: "unavailable" }), { status: 503 });
      }
      return success();
    });
    const input = { ...automatic, message: kind };
    assert.ok((await reportClientError(input)).error);
    assert.equal((await reportClientError(input)).id, "saved");
    assert.equal(calls, 2);
    fetch.mock.restore();
  }
});

test("手工反馈和不同自动指纹均可并发发送，不被去重误丢", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => success());
  const manual = { ...automatic, source: "manual" as const };
  const results = await Promise.all([
    reportClientError(manual), reportClientError(manual),
    reportClientError(automatic), reportClientError({ ...automatic, message: "another error" }),
  ]);
  assert.equal(fetch.mock.callCount(), 4);
  assert.ok(results.every((result) => result.id === "saved"));
});
