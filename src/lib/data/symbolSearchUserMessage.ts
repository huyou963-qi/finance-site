/**
 * 将上游（Yahoo 等）抛出的含整页 HTML 的 message 转为可展示的一行说明，避免把整份 HTML 塞进 UI。
 */
export function symbolSearchErrorForUser(raw: string | undefined | null): string {
  if (raw == null || raw.trim() === "") {
    return "搜索服务暂不可用，请稍后再试或检查网络。";
  }
  const s = raw.trim();
  if (looksLikeHtmlDocument(s)) {
    return "无法连接 Yahoo 联想服务（常被地区网络拦截）。已尝试备用源；若仍无结果，请直接输入代码（如 AAPL）或在本地配置 MASSIVE_API_KEY。";
  }
  if (s.length > 280) {
    return `${s.slice(0, 280)}…`;
  }
  return s;
}

function looksLikeHtmlDocument(s: string): boolean {
  if (s.length > 800) return true;
  const lower = s.slice(0, 2000).toLowerCase();
  return (
    /<\s*!?\s*doctype\s+html/i.test(s) ||
    /<\s*html[\s>]/i.test(s) ||
    (/<\s*head[\s>]/i.test(s) && /<\s*body[\s>]/i.test(s)) ||
    (lower.includes("<title>") && lower.includes("yahoo") && lower.includes("</html>"))
  );
}
