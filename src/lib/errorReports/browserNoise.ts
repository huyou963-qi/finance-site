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
