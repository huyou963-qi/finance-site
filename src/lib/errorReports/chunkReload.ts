const RELOAD_FLAG_KEY = "chunk-reload-attempt";
const RELOAD_PAGE_KEY = "chunk-reload-page";
/** 刷新后的一次性 query，避免 Firefox 把 location.reload() 从 bfcache 还原成同一份坏页面。 */
export const STALE_ASSET_RELOAD_QUERY = "_fsr";
/** 上次自动刷新的时间戳在这个窗口内视为“刚刚试过”，避免刷新失败时死循环。 */
const RELOAD_GUARD_MS = 15_000;
const CACHE_BUST_WAIT_MS = 500;

function errorText(input: unknown): string {
  return input instanceof Error
    ? `${input.name} ${input.message}`
    : typeof input === "string"
      ? input
      : "";
}

function currentPageId(): string {
  return String(typeof performance !== "undefined" ? performance.timeOrigin : Date.now());
}

/** Next.js 静态资源加载失败：常见于服务端发布新版本后，用户仍停留在旧版页面上引用了已被替换的 chunk 文件。 */
export function isChunkLoadError(input: unknown): boolean {
  if (input instanceof Error && input.name === "ChunkLoadError") return true;
  return /ChunkLoadError|Loading chunk .+? failed|Loading CSS chunk .+? failed|Failed to load chunk|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(
    errorText(input),
  );
}

/**
 * script 在传输中被截断/损坏时，浏览器解析到断口处会报语法错误（"Unexpected token/end of input"
 * 之类），而我们自己的代码是过了 tsc/eslint/build 才上线的，不会真的带无效语法。
 * 只有当出错脚本确实是本站 _next/static 静态资源（或事件没给出 filename，同样无法排除是本站
 * 资源）时才当作"资源损坏"处理；如果 filename 指向别的域（浏览器插件/广告注入脚本），
 * 那是第三方脚本本身的问题，刷新页面也治不好，交给下面的跨域噪音过滤即可。
 */
export function isLikelyCorruptedScriptSyntaxError(event: {
  message?: string;
  filename?: string;
}): boolean {
  const message = event.message ?? "";
  if (!/SyntaxError/i.test(message)) return false;
  if (!/Unexpected token|Unexpected identifier|Unexpected end of input|Invalid or unexpected token/i.test(message)) {
    return false;
  }
  const filename = event.filename ?? "";
  if (!filename) return true;
  try {
    const url = new URL(filename, window.location.href);
    return url.origin === window.location.origin;
  } catch {
    return true;
  }
}

export function isStaleClientAssetError(
  input: unknown,
  syntaxEvent?: { message?: string; filename?: string },
): boolean {
  const syntax =
    syntaxEvent ??
    (input instanceof Error
      ? { message: input.message }
      : { message: typeof input === "string" ? input : "" });
  return isChunkLoadError(input) || isLikelyCorruptedScriptSyntaxError(syntax);
}

export function extractFailedStaticAssetUrl(input: unknown, filename?: string): string | undefined {
  const fromMessage = errorText(input).match(/https?:\/\/[^\s)]+\/_next\/static\/[^\s)]+/)?.[0];
  if (fromMessage) return fromMessage;
  if (filename && filename.includes("/_next/static/")) return filename;
  return undefined;
}

function readAttempt(): { at: number; page: string } | null {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_FLAG_KEY) ?? 0);
    if (!at) return null;
    return { at, page: sessionStorage.getItem(RELOAD_PAGE_KEY) ?? "" };
  } catch {
    return null;
  }
}

function writeAttempt(): void {
  try {
    sessionStorage.setItem(RELOAD_FLAG_KEY, String(Date.now()));
    sessionStorage.setItem(RELOAD_PAGE_KEY, currentPageId());
  } catch {
    /* sessionStorage 不可用时仍刷新，只是不再有防抖保护 */
  }
}

function reloadHref(): string {
  const url = new URL(window.location.href);
  url.searchParams.set(STALE_ASSET_RELOAD_QUERY, String(Date.now()));
  return url.toString();
}

function navigateHard(): void {
  window.location.replace(reloadHref());
}

function bustCachedAssetThenReload(input?: unknown, filename?: string): void {
  const asset = extractFailedStaticAssetUrl(input, filename);
  const go = () => navigateHard();
  if (!asset) {
    go();
    return;
  }
  let sameOrigin = false;
  try {
    sameOrigin = new URL(asset, window.location.href).origin === new URL(window.location.href).origin;
  } catch {
    sameOrigin = false;
  }
  if (!sameOrigin) {
    go();
    return;
  }
  const timer = window.setTimeout(go, CACHE_BUST_WAIT_MS);
  void window.fetch(asset, { cache: "reload", credentials: "same-origin" })
    .catch(() => undefined)
    .finally(() => {
      window.clearTimeout(timer);
      go();
    });
}

/**
 * 检测到 chunk 加载失败 / 静态资源损坏时尝试整页刷新一次（拉取最新 HTML/资源清单）。
 * 同一文档上多个 handler（window.onerror、unhandledrejection、error.tsx）会同时触发：
 * 第一次真正发起刷新，后续调用视为“刷新已在进行”并返回 true，避免误报崩溃。
 * 若刷新后的新文档在短窗口内再次失败，返回 false，让调用方上报并展示手动刷新。
 */
export function reloadStaleAssetOnce(input?: unknown, filename?: string): boolean {
  if (typeof window === "undefined") return false;
  const prev = readAttempt();
  if (prev && Date.now() - prev.at < RELOAD_GUARD_MS) {
    return prev.page === currentPageId();
  }
  writeAttempt();
  bustCachedAssetThenReload(input, filename);
  return true;
}

/** 用户点「刷新页面」时忽略短窗口守卫。 */
export function forceReloadStaleAssets(input?: unknown, filename?: string): void {
  if (typeof window === "undefined") return;
  writeAttempt();
  bustCachedAssetThenReload(input, filename);
}

export function recoverStaleClientAsset(
  input: unknown,
  syntaxEvent?: { message?: string; filename?: string },
): boolean {
  if (!isStaleClientAssetError(input, syntaxEvent)) return false;
  return reloadStaleAssetOnce(input, syntaxEvent?.filename);
}

/** 成功加载后去掉刷新用的 query，避免污染可分享地址。 */
export function stripStaleAssetReloadQuery(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(STALE_ASSET_RELOAD_QUERY)) return;
    url.searchParams.delete(STALE_ASSET_RELOAD_QUERY);
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, "", next);
  } catch {
    /* ignore */
  }
}

/** Firefox 可能把 reload 还原成 bfcache 快照；若刚因过期资源触发过刷新，再强制跳一次。 */
export function recoverIfBfCacheAfterStaleReload(persisted: boolean): void {
  if (!persisted || typeof window === "undefined") return;
  const prev = readAttempt();
  if (!prev || Date.now() - prev.at >= RELOAD_GUARD_MS) return;
  forceReloadStaleAssets();
}
