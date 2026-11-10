/**
 * 界面语言（纯函数，无 React / 无 Next 依赖，可单测）。
 *
 * 语言由网址决定：中文不带前缀（/macro），英文带 /en 前缀（/en/macro），便于搜索引擎
 * 分别收录。middleware 把 /en/... 内部转到同一个页面并标记语言，页面文件不用挪目录。
 * cookie 只记住「上次选了英文」，让还没改成本地化链接的跳转也留在英文。
 * 中文是默认语言；英文缺的文案自动回退中文，所以可以一页一页地翻。
 * 英文开关登记为功能 `site-language-en`，未开放的身份访问 /en 会被送回中文。
 * 详见 docs/I18N.md。
 */

export const LOCALES = ["zh", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "zh";

/** 记住「选了英文」的 cookie（next-intl 约定的名字） */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** middleware 写给服务端的请求头：本次请求的语言、去掉语言前缀后的路径 */
export const LOCALE_HEADER = "x-app-locale";
export const PATHNAME_HEADER = "x-app-pathname";

/** 各语言的网址前缀 */
export const LOCALE_PREFIX: Record<AppLocale, string> = { zh: "", en: "/en" };

/** featureCatalog 里英文界面开关的 id */
export const ENGLISH_FEATURE_ID = "site-language-en";

/** `<html lang>` 取值 */
export const HTML_LANG: Record<AppLocale, string> = { zh: "zh-CN", en: "en" };

/** 数字/日期格式化用的 BCP 47 标签 */
export const INTL_LOCALE: Record<AppLocale, string> = { zh: "zh-CN", en: "en-US" };

export function parseLocale(value: string | null | undefined): AppLocale {
  return value === "en" ? "en" : DEFAULT_LOCALE;
}

export type Messages = { [key: string]: string | Messages };

/**
 * 深合并：override 覆盖 base，override 缺的键保留 base。
 * 用于「英文缺翻译时回退中文」。
 */
export function mergeMessages(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const prev = out[key];
    out[key] =
      typeof value === "object" && typeof prev === "object" ? mergeMessages(prev, value) : value;
  }
  return out;
}

/** 文案树的全部叶子键（`nav.macro` 形式），用于检查中英文是否对齐 */
export function flattenMessageKeys(messages: Messages, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") keys.push(path);
    else keys.push(...flattenMessageKeys(value, path));
  }
  return keys;
}

/** 网址路径 → 语言 + 去掉前缀后的页面路径。`/en` → en + `/`；`/enterprise` 仍是中文。 */
export function splitLocalePath(pathname: string): { locale: AppLocale; pathname: string } {
  if (pathname === "/en") return { locale: "en", pathname: "/" };
  if (pathname.startsWith("/en/")) return { locale: "en", pathname: pathname.slice(3) };
  return { locale: DEFAULT_LOCALE, pathname };
}

/**
 * 站内链接加上语言前缀（会先去掉已有前缀，可重复调用）。
 * 不处理：外链、协议相对地址、纯锚点/查询、`/api/` 与 `/_next/` 资源。
 */
export function localizeHref(href: string, locale: AppLocale): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const cut = href.search(/[?#]/);
  const path = cut === -1 ? href : href.slice(0, cut);
  const rest = cut === -1 ? "" : href.slice(cut);
  const bare = splitLocalePath(path).pathname;
  if (bare === "/api" || bare.startsWith("/api/") || bare.startsWith("/_next/")) return href;
  const prefix = LOCALE_PREFIX[locale];
  const localized = prefix ? (bare === "/" ? prefix : `${prefix}${bare}`) : bare;
  return `${localized}${rest}`;
}
