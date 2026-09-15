const RELOAD_FLAG_KEY = "chunk-reload-attempt";
/** 上次自动刷新的时间戳在这个窗口内视为“刚刚试过”，避免刷新失败时死循环。 */
const RELOAD_GUARD_MS = 15_000;

/** Next.js 静态资源加载失败：常见于服务端发布新版本后，用户仍停留在旧版页面上引用了已被替换的 chunk 文件。 */
export function isChunkLoadError(input: unknown): boolean {
  const message =
    input instanceof Error
      ? `${input.name} ${input.message}`
      : typeof input === "string"
        ? input
        : "";
  return /ChunkLoadError|Loading chunk [\w.-]+ failed|Loading CSS chunk [\w.-]+ failed/i.test(
    message,
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

/**
 * 检测到 chunk 加载失败 / 静态资源损坏时尝试整页刷新一次（拉取最新 HTML/资源清单）。
 * 用 sessionStorage 记录最近一次尝试时间，短时间内已刷新过就不再刷新（避免死循环），
 * 返回值表示是否已经（或将要）触发刷新——调用方据此决定要不要照常上报错误。
 */
export function reloadStaleAssetOnce(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG_KEY) ?? 0);
    if (Date.now() - last < RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(RELOAD_FLAG_KEY, String(Date.now()));
  } catch {
    /* sessionStorage 不可用时也放行刷新，只是不再有防抖保护 */
  }
  window.location.reload();
  return true;
}
