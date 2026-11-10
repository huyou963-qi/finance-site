/**
 * 界面语言（纯函数，无 React / 无 Next 依赖，可单测）。
 *
 * 语言存在 cookie 里，不改 URL（不加 /en 前缀）。中文是默认语言；英文缺的文案
 * 自动回退中文，所以可以一页一页地翻。英文开关登记为功能 `site-language-en`，
 * 开发期间只有管理员能看到切换入口，服务端也会把无权用户的 en cookie 当作中文。
 * 详见 docs/I18N.md。
 */

export const LOCALES = ["zh", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "zh";

/** next-intl 约定的 cookie 名 */
export const LOCALE_COOKIE = "NEXT_LOCALE";

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
