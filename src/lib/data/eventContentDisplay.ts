const TRAILING_MARKERS_RE = /(?:\n\n\[(?:seed|era):[^\]]+\])+\s*$/;
const SECTION_RE = (title: string) =>
  new RegExp(`【${title}】\\s*([\\s\\S]*?)(?=\\n\\n【|$)`, "u");
const ALL_SECTIONS_RE = /【([^】]+)】\s*([\s\S]*?)(?=\n\n【|$)/gu;

export type EventContentSection = {
  title: string;
  body: string;
};

/** Hover Card 优先展示的小节标题（按顺序） */
export const EVENT_HOVER_SECTION_PRIORITY = [
  "事件概述",
  "主要影响",
  "繁荣动力",
  "萧条/危机成因",
] as const;

/** 去掉 content 尾部的 `[seed:…]` / `[era:…]` 导入标记 */
export function stripEventSeedMarker(content: string): string {
  return content.replace(TRAILING_MARKERS_RE, "").trim();
}

/** 解析全部【标题】结构化段落 */
export function parseEventSections(content: string): EventContentSection[] {
  const clean = stripEventSeedMarker(content);
  const sections: EventContentSection[] = [];
  for (const m of clean.matchAll(ALL_SECTIONS_RE)) {
    const title = m[1]?.trim();
    const body = m[2]?.trim();
    if (title && body) sections.push({ title, body });
  }
  return sections;
}

/** Hover Card 展示的小节（优先序 + 其余最多 1 条提示） */
export function eventHoverCardSections(content: string): {
  primary: EventContentSection[];
  extraCount: number;
} {
  const all = parseEventSections(content);
  if (all.length === 0) {
    const clean = stripEventSeedMarker(content);
    if (!clean) return { primary: [], extraCount: 0 };
    return {
      primary: [{ title: "内容", body: clean.length > 280 ? `${clean.slice(0, 280)}…` : clean }],
      extraCount: clean.length > 280 ? 1 : 0,
    };
  }

  const picked: EventContentSection[] = [];
  const used = new Set<string>();
  for (const key of EVENT_HOVER_SECTION_PRIORITY) {
    const hit = all.find((s) => s.title === key);
    if (hit) {
      picked.push(hit);
      used.add(hit.title);
    }
  }
  const rest = all.filter((s) => !used.has(s.title));
  const primary = picked.length > 0 ? picked : all.slice(0, 2);
  const extraCount = Math.max(0, all.length - primary.length);
  return { primary, extraCount: rest.length > 0 ? extraCount || rest.length : 0 };
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
