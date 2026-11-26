/** 广告 SDK 的已知空填充结果；必须同时匹配代码与完整消息，不能吞掉普通业务异常。 */
export function isEmptyAdResponse(reason: unknown): boolean {
  let value = reason;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return false; }
  }
  if (!value || typeof value !== "object" || value instanceof Error) return false;
  const { code, message } = value as { code?: unknown; message?: unknown };
  return code === 30005 && typeof message === "string" &&
    /^Ad loaded,\s*but response or ad data is empty,\s*and reqId is\s*:\s*[a-f0-9]{32}\s*$/i.test(message);
}

/** 只按抛错位置识别插件错误；堆栈后续出现插件不能证明本站错误来自插件。 */
export function isExtensionScriptError(filename?: string, stack?: string): boolean {
  if (filename) return /^(?:chrome-extension|moz-extension|safari-web-extension):\/\//i.test(filename);
  const frame = stack?.split("\n").find((line) => /^\s*at\s|@[\w-]+:\/\//.test(line));
  return /(?:@|\(|\bat\s+)(?:chrome-extension|moz-extension|safari-web-extension):\/\//i.test(frame ?? "");
}

/** Next 在 pagehide 时取消 RSC 请求；页面仍活跃时的 AbortError 必须保留。 */
export function isPageExitAbort(reason: unknown, pageExiting: boolean): boolean {
  return pageExiting && reason !== null && typeof reason === "object" &&
    "name" in reason && reason.name === "AbortError";
}
