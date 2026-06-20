const TRAILING_MARKERS_RE = /(?:\n\n\[(?:seed|era):[^\]]+\])+\s*$/;
const SECTION_RE = (title: string) =>
  new RegExp(`【${title}】\\s*([\\s\\S]*?)(?=\\n\\n【|$)`, "u");

/** 去掉 content 尾部的 `[seed:…]` / `[era:…]` 导入标记 */
export function stripEventSeedMarker(content: string): string {
  return content.replace(TRAILING_MARKERS_RE, "").trim();
}

/** 提取结构化段落（如【主要影响】）正文 */
export function extractEventSection(
  content: string,
  sectionTitle: string,
): string | null {
  const clean = stripEventSeedMarker(content);
  const m = clean.match(SECTION_RE(sectionTitle));
  const body = m?.[1]?.trim();
  return body || null;
}

/** 列表卡片摘要：优先【主要影响】，其次【事件概述】，否则截断全文 */
export function eventPreviewContent(content: string, maxLen = 160): string {
  const impact = extractEventSection(content, "主要影响");
  if (impact) return impact.length > maxLen ? `${impact.slice(0, maxLen)}…` : impact;

  const overview = extractEventSection(content, "事件概述");
  if (overview) {
    return overview.length > maxLen ? `${overview.slice(0, maxLen)}…` : overview;
  }

  const clean = stripEventSeedMarker(content);
  return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean;
}

export function eventDisplayContent(content: string): string {
  return stripEventSeedMarker(content);
}
