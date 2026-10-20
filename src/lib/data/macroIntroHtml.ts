import sanitizeHtml from "sanitize-html";
import type { MacroChartTemplate } from "@/lib/data/macroPresetTemplates";

export const INTRO_HTML_MAX_LEN = 60000;

/** Only the formatting offered by the template introduction editor is persisted. */
export function sanitizeMacroIntroHtml(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const clean = sanitizeHtml(input.slice(0, INTRO_HTML_MAX_LEN), {
    allowedTags: ["p", "div", "br", "span", "font", "b", "strong", "i", "em", "u", "ul", "ol", "li"],
    allowedAttributes: {
      p: ["style"], div: ["style"], span: ["style"],
      font: ["face", "size", "color"],
    },
    allowedStyles: {
      "*": {
        "font-family": [/^["']?(Arial|Georgia|Times New Roman|Microsoft YaHei|SimSun|sans-serif|serif)["']?$/i],
        "font-size": [/^(10|12|14|16|18|20|24|28|32)px$/],
        color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i],
        "line-height": [/^(1|1\.25|1\.5|1\.75|2|2\.5)$/],
      },
    },
    transformTags: {
      font: (_tag, attrs) => {
        const style = [
          /^(Arial|Georgia|Times New Roman|Microsoft YaHei|SimSun|sans-serif|serif)$/i.test(attrs.face ?? "")
            ? `font-family:${attrs.face}` : "",
          /^[1-7]$/.test(attrs.size ?? "")
            ? `font-size:${({ 1: 10, 2: 12, 3: 14, 4: 18, 5: 24, 6: 28, 7: 32 } as Record<string, number>)[attrs.size]}px` : "",
          /^#[0-9a-f]{3,8}$/i.test(attrs.color ?? "")
            ? `color:${attrs.color}` : "",
        ].filter(Boolean).join(";");
        return { tagName: "span", attribs: style ? { style } : {} as Record<string, string> };
      },
    },
  });
  return clean.trim();
}

/** Snapshot the visible introduction when a template is saved, including an unsaved editor draft. */
export function templateIntroSnapshot(template: MacroChartTemplate | null, draftHtml?: string) {
  return {
    description: template?.description,
    introText: template?.introText,
    introHtml: draftHtml === undefined ? template?.introHtml : sanitizeMacroIntroHtml(draftHtml),
    indicatorIntroNotes: template?.indicatorIntroNotes,
    chartIntroNotes: template?.chartIntroNotes,
  };
}
