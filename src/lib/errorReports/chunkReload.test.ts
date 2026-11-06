import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import {
  STALE_ASSET_RELOAD_QUERY,
  extractFailedStaticAssetUrl,
  forceReloadStaleAssets,
  isChunkLoadError,
  recoverIfBfCacheAfterStaleReload,
  recoverStaleClientAsset,
  reloadStaleAssetOnce,
  stripStaleAssetReloadQuery,
} from "./chunkReload";

const PRODUCTION_MESSAGE =
  "Loading chunk 6045 failed.\n(error: https://www.gekkotech.cn/_next/static/chunks/d0709137-d58c6849958169d4.js)";

type FakeWindow = {
  location: { href: string; replace: (url: string) => void };
  history: { state: unknown; replaceState: (state: unknown, title: string, url: string) => void };
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  fetch: typeof fetch;
};

const stored = new Map<string, string>();
const replaces: string[] = [];
const historyUrls: string[] = [];
const fetches: { url: string; cache?: RequestCache }[] = [];
let fetchImpl: () => Promise<Response> = () => Promise.resolve(new Response(null, { status: 200 }));

const fakeWindow: FakeWindow = {
  location: {
    href: "https://www.gekkotech.cn/markets",
    replace: (url: string) => {
      replaces.push(url);
      fakeWindow.location.href = url;
    },
  },
  history: {
    state: null,
    replaceState: (_state, _title, url) => {
      historyUrls.push(String(url));
      fakeWindow.location.href = `https://www.gekkotech.cn${url}`;
    },
  },
  setTimeout,
  clearTimeout,
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    fetches.push({ url, cache: init?.cache });
    return fetchImpl();
  },
};

const previous = {
  window: Object.getOwnPropertyDescriptor(globalThis, "window"),
  sessionStorage: Object.getOwnPropertyDescriptor(globalThis, "sessionStorage"),
};

before(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: fakeWindow });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => {
        stored.set(key, value);
      },
    },
  });
});

beforeEach(() => {
  stored.clear();
  replaces.length = 0;
  historyUrls.length = 0;
  fetches.length = 0;
  fetchImpl = () => Promise.resolve(new Response(null, { status: 200 }));
  fakeWindow.location.href = "https://www.gekkotech.cn/markets";
});

afterEach(() => {
  stored.clear();
});

after(() => {
  for (const [key, descriptor] of Object.entries(previous)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

function chunkError(): Error {
  const error = new Error(PRODUCTION_MESSAGE);
  error.name = "ChunkLoadError";
  return error;
}

test("识别生产行情页上报的 webpack ChunkLoadError 文案", () => {
  assert.equal(isChunkLoadError(PRODUCTION_MESSAGE), true);
  assert.equal(isChunkLoadError(chunkError()), true);
  assert.equal(isChunkLoadError(new Error("boom")), false);
  assert.equal(
    extractFailedStaticAssetUrl(PRODUCTION_MESSAGE),
    "https://www.gekkotech.cn/_next/static/chunks/d0709137-d58c6849958169d4.js",
  );
});

test("同一文档上第二次调用视为刷新进行中，不再上报、不再重复跳转", async () => {
  assert.equal(recoverStaleClientAsset(chunkError()), true);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(replaces.length, 1);
  assert.match(replaces[0]!, new RegExp(`[?&]${STALE_ASSET_RELOAD_QUERY}=\\d+`));
  assert.equal(reloadStaleAssetOnce(chunkError()), true);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(replaces.length, 1);
});

test("刷新后的新文档在短窗口内再次失败则放弃自动刷新", () => {
  stored.set("chunk-reload-attempt", String(Date.now()));
  stored.set("chunk-reload-page", "previous-document");
  assert.equal(reloadStaleAssetOnce(chunkError()), false);
  assert.equal(replaces.length, 0);
});

test("刷新前对失败的本站 chunk 做 cache:reload，绕过缓存的失败响应", async () => {
  assert.equal(reloadStaleAssetOnce(chunkError()), true);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(fetches.length, 1);
  assert.equal(
    fetches[0]?.url,
    "https://www.gekkotech.cn/_next/static/chunks/d0709137-d58c6849958169d4.js",
  );
  assert.equal(fetches[0]?.cache, "reload");
  assert.equal(replaces.length, 1);
});

test("手动刷新忽略短窗口守卫", async () => {
  stored.set("chunk-reload-attempt", String(Date.now()));
  stored.set("chunk-reload-page", "previous-document");
  forceReloadStaleAssets(chunkError());
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(replaces.length, 1);
});

test("成功加载后去掉刷新 query", () => {
  fakeWindow.location.href = `https://www.gekkotech.cn/markets?${STALE_ASSET_RELOAD_QUERY}=123&symbol=AAPL`;
  stripStaleAssetReloadQuery();
  assert.deepEqual(historyUrls, ["/markets?symbol=AAPL"]);
});

test("bfcache 还原且刚因过期资源刷新过时再次强制跳转", async () => {
  stored.set("chunk-reload-attempt", String(Date.now()));
  stored.set("chunk-reload-page", String(performance.timeOrigin));
  recoverIfBfCacheAfterStaleReload(false);
  assert.equal(replaces.length, 0);
  recoverIfBfCacheAfterStaleReload(true);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(replaces.length, 1);
});
