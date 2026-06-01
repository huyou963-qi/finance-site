/**
 * 将上游抛出的含整页 HTML 的 message 转为可展示的一行说明，避免把整份 HTML 塞进 UI。
 */
export function symbolSearchErrorForUser(raw: string | undefined | null): string {
  if (raw == null || raw.trim() === "") {
    return "搜索服务暂不可用，请稍后再试或检查网络。";
  }
  const s = raw.trim();
  if (looksLikeHtmlDocument(s)) {
    return "搜索接口返回异常内容（常为网络或会话问题）。请确认已登录 IB Gateway；也可直接输入完整代码。";
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
    (lower.includes("<title>") && lower.includes("</html>"))
  );
}
