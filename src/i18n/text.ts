/**
 * 功能页文案（源文本做键，纯函数，有单测）。
 *
 * 外壳（导航、登录、定价…）用 next-intl 键名文案（messages/*.json）。功能页文案量大、
 * 且大量写在配置对象里，改用「中文原文即键」：代码写 `tr("宏观数据")`，中文站原样返回，
 * 英文站查 `src/i18n/text/en/*.json`（中文 → 英文），查不到显示中文。
 * 占位符写 `{name}`：`tr("共 {count} 条", { count })`。
 * 详见 docs/I18N.md「功能页文案」。
 */

export type TextDict = Readonly<Record<string, string>>;
export type TextValues = Readonly<Record<string, string | number | boolean | null | undefined>>;

/** 把 `{name}` 换成对应值；没有提供的占位符原样保留 */
export function interpolate(template: string, values?: TextValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole,
  );
}

/** dict 为 null 表示中文站（不翻译） */
export function translateText(source: string, dict: TextDict | null, values?: TextValues): string {
  const template = dict ? (dict[source] ?? source) : source;
  return interpolate(template, values);
}

/** 空值原样返回（显示处常直接包 tr(x.label)，x.label 可能为 null） */
export interface Tr {
  (source: string, values?: TextValues): string;
  (source: string | null | undefined, values?: TextValues): string | null | undefined;
}

export function makeTr(dict: TextDict | null): Tr {
  return ((source: string | null | undefined, values?: TextValues) =>
    source == null ? source : translateText(source, dict, values)) as Tr;
}

/** 不翻译的 tr：给「组件外辅助函数」的 tr 参数做默认值，未传入时保持中文 */
export const identityTr: Tr = makeTr(null);
