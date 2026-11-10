import type { TextDict } from "@/i18n/text";

/**
 * 英文功能页文案（中文原文 → 英文，AI 初译 + 人工抽查），按模块分文件。
 * 新模块在这里登记；同一中文在不同模块译法不同时，后登记的覆盖前面的（尽量避免）。
 */
export async function loadEnglishText(): Promise<TextDict> {
  const modules = await Promise.all([
    import("./common.json"),
    import("./macro.json"),
    import("./markets.json"),
    import("./equity.json"),
  ]);
  return Object.assign({}, ...modules.map((m) => m.default)) as TextDict;
}
