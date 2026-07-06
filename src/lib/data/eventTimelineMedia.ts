import { EVENT_TIMELINE_IMAGE_BY_SEED_KEY } from "@/lib/data/eventTimelineImageCatalog";
import { EVENT_TIMELINE_IMAGE_PATCH } from "@/lib/data/eventTimelineImagePatch";

/** 从 Wikipedia 链接解析词条标题 */
export function wikipediaTitleFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /wikipedia\.org\/wiki\/([^#?]+)/i.exec(url);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]).replace(/_/g, " ");
  } catch {
    return m[1].replace(/_/g, " ");
  }
}

/** 从事件正文解析 seedKey（与入库脚本一致） */
export function eventSeedKey(content: string | null | undefined): string | null {
  const m = /\[seed:([^\]]+)\]/.exec(content ?? "");
  return m?.[1] ?? null;
}

/** 按 seedKey 查静态图库（生成目录 + 手工补丁） */
export function catalogEventImage(seedKey: string | null | undefined): string | null {
  if (!seedKey) return null;
  return (
    EVENT_TIMELINE_IMAGE_BY_SEED_KEY[seedKey] ??
    EVENT_TIMELINE_IMAGE_PATCH[seedKey] ??
    null
  );
}

/** 维基百科 REST 摘要缩略图（客户端调用） */
export async function fetchWikipediaThumbnail(
  pageTitle: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const slug = pageTitle.trim().replace(/ /g, "_");
  if (!slug) return null;
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`,
      { signal },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { thumbnail?: { source?: string } };
    return j.thumbnail?.source ?? null;
  } catch {
    return null;
  }
}

/** 无维基图时的时代/主题占位（Wikimedia Commons 公有领域） */
const ERA_FALLBACK_IMAGES: Record<string, string> = {
  建国宪政:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Declaration_of_Independence_%281819%29%2C_by_John_Trumbull.jpg/440px-Declaration_of_Independence_%281819%29%2C_by_John_Trumbull.jpg",
  市场革命:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Robert_Fulton%27s_steamboat_%22Clermont%22.jpg/440px-Robert_Fulton%27s_steamboat_%22Clermont%22.jpg",
  内战重建:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Battle_of_Gettysburg%2C_by_Currier_and_Ives.png/440px-Battle_of_Gettysburg%2C_by_Currier_and_Ives.png",
  镀金时代:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Official_program_-_Woman_suffrage_procession_March_3%2C_1913.jpg/440px-Official_program_-_Woman_suffrage_procession_March_3%2C_1913.jpg",
  大萧条:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Breadline_in_the_U.S._during_the_Great_Depression_-_NARA_541884.jpg/440px-Breadline_in_the_U.S._during_the_Great_Depression_-_NARA_541884.jpg",
  二战动员:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Raising_the_Flag_on_Iwo_Jima%2C_larger_-_edit1.jpg/440px-Raising_the_Flag_on_Iwo_Jima%2C_larger_-_edit1.jpg",
  战后黄金年代:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/1950s_Family_Watching_Television.jpg/440px-1950s_Family_Watching_Television.jpg",
  滞胀时代:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Gas_lines_in_the_U.S._-%281979%29.jpg/440px-Gas_lines_in_the_U.S._-%281979%29.jpg",
  新自由主义繁荣:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Reagan_and_Gorbachev_signing.jpg/440px-Reagan_and_Gorbachev_signing.jpg",
  金融危机时代:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Lehman_Brothers_Building_%28New_York%29.jpg/440px-Lehman_Brothers_Building_%28New_York%29.jpg",
};

const EVENT_KEYWORD_IMAGES: [RegExp, string][] = [
  [/广场协议|Plaza Accord/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Plaza_Accord_signing.jpg/440px-Plaza_Accord_signing.jpg"],
  [/黑色星期一|Black Monday/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/New_York_Stock_Exchange_-_trading_floor.jpg/440px-New_York_Stock_Exchange_-_trading_floor.jpg"],
  [/次贷危机|Lehman|雷曼/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Lehman_Brothers_Building_%28New_York%29.jpg/440px-Lehman_Brothers_Building_%28New_York%29.jpg"],
  [/尼克松|Nixon.*shock|布雷顿森林/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Nixon_shock.jpg/440px-Nixon_shock.jpg"],
];

export function fallbackEventImage(
  title: string | null | undefined,
  eraTag?: string | null,
  seedKey?: string | null,
): string | null {
  const fromCatalog = catalogEventImage(seedKey);
  if (fromCatalog) return fromCatalog;

  const t = title ?? "";
  for (const [re, url] of EVENT_KEYWORD_IMAGES) {
    if (re.test(t)) return url;
  }
  if (eraTag && ERA_FALLBACK_IMAGES[eraTag]) return ERA_FALLBACK_IMAGES[eraTag];
  return null;
}

/** 时间轴卡片图片：目录 → 维基缩略图 → 关键词/时代占位 */
export async function resolveEventTimelineImage(
  opts: {
    content: string;
    title: string | null | undefined;
    sourceUrl: string | null | undefined;
    eraTag?: string | null;
  },
  signal?: AbortSignal,
): Promise<string | null> {
  const seedKey = eventSeedKey(opts.content);
  const catalog = catalogEventImage(seedKey);
  if (catalog) return catalog;

  const wikiTitle = wikipediaTitleFromUrl(opts.sourceUrl);
  if (wikiTitle) {
    const thumb = await fetchWikipediaThumbnail(wikiTitle, signal);
    if (thumb) return thumb;
  }

  return fallbackEventImage(opts.title, opts.eraTag, seedKey);
}
