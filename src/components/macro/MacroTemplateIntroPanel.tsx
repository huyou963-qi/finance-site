"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type MacroTemplateIntroIndicator = {
  key: string;
  label: string;
};

export type MacroTemplateIntroChartSection = {
  slotKey: string;
  title: string;
};

export type MacroTemplateIntroPanelProps = {
  templateName: string | null;
  templateDescription?: string | null;
  /** 模板介绍正文（自由文本，覆盖旧版分图/分指标说明） */
  introText?: string | null;
  /** 旧版按图位介绍：仅在 introText 为空时用于生成初稿 */
  chartSections?: MacroTemplateIntroChartSection[];
  /** 旧版按指标介绍：仅在 introText 为空时用于生成初稿 */
  indicators: MacroTemplateIntroIndicator[];
  notes: Record<string, string>;
  onIntroTextChange?: (text: string) => void;
  /** admin 编辑系统模板一句话简介时传入 */
  onDescriptionChange?: (text: string) => void;
  /** false：只读展示（非 admin）；true：可编辑并保存 */
  editable?: boolean;
  className?: string;
};

const INTRO_TEXT_MAX_LEN = 20000;
const DESCRIPTION_MAX_LEN = 8000;

const introFieldClass =
  "w-full rounded border border-fs-border/90 bg-white/95 px-2 py-1.5 text-[11px] leading-relaxed text-fs-text";

/** 把旧版逐图 / 逐指标说明拼成一段可自由编辑的正文 */
function composeLegacyIntro(
  chartSections: MacroTemplateIntroChartSection[] | undefined,
  indicators: MacroTemplateIntroIndicator[],
  notes: Record<string, string>,
): string {
  const blocks: string[] = [];
  if (chartSections && chartSections.length > 0) {
    chartSections.forEach(({ slotKey, title }, idx) => {
      const note = (notes[slotKey] ?? "").trim();
      if (!note) return;
      blocks.push(`图 ${idx + 1} · ${title}\n${note}`);
    });
  } else {
    for (const { key, label } of indicators) {
      const note = (notes[key] ?? "").trim();
      if (!note) continue;
      blocks.push(`${label}\n${note}`);
    }
  }
  return blocks.join("\n\n");
}

export function MacroTemplateIntroPanel({
  templateName,
  templateDescription,
  introText,
  chartSections,
  indicators,
  notes,
  onIntroTextChange,
  onDescriptionChange,
  editable = true,
  className = "",
}: MacroTemplateIntroPanelProps) {
  const desc = templateDescription ?? "";
  const descriptionEditable = editable && Boolean(onDescriptionChange);
  const showDescriptionField = desc.trim().length > 0 || descriptionEditable;

  const introEditable = editable && Boolean(onIntroTextChange);
  const saved = introText ?? "";
  const legacy = useMemo(
    () => composeLegacyIntro(chartSections, indicators, notes),
    [chartSections, indicators, notes],
  );

  /** 用户开始编辑后不再回落到旧版拼接文本（否则清空会“复活”旧内容） */
  const [touched, setTouched] = useState(false);
  const savedRef = useRef(saved);
  useEffect(() => {
    if (savedRef.current !== saved) {
      savedRef.current = saved;
      if (saved.trim()) setTouched(true);
    }
  }, [saved]);

  const value = (saved.trim() || touched) ? saved : legacy;

  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-2 ${className}`}>
      <div className="shrink-0 rounded-md border border-fs-border/90 bg-fs-elevated/40 px-2 py-1.5">
        <p className="text-[11px] font-medium text-fs-text">
          {templateName?.trim() || "当前工作区"}
        </p>
        {showDescriptionField ? (
          <div className="mt-1">
            {descriptionEditable ? (
              <textarea
                value={desc}
                onChange={(e) =>
                  onDescriptionChange?.(e.target.value.slice(0, DESCRIPTION_MAX_LEN))
                }
                rows={2}
                placeholder="一句话简介：用于模板列表悬浮提示"
                className={`${introFieldClass} resize-y placeholder:text-fs-muted focus:border-fs-accent/30 focus:outline-none focus:ring-1 focus:ring-fs-accent/30`}
              />
            ) : (
              <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-fs-muted">
                {desc}
              </p>
            )}
          </div>
        ) : null}
      </div>

      {introEditable ? (
        <div className="flex min-h-0 flex-1 flex-col gap-1">
          <textarea
            value={value}
            onChange={(e) => {
              setTouched(true);
              onIntroTextChange?.(e.target.value.slice(0, INTRO_TEXT_MAX_LEN));
            }}
            placeholder="模板介绍：阅读顺序，以及模板中各个图分别看什么、怎么看、图与图之间如何互相印证…"
            className={`${introFieldClass} min-h-0 flex-1 resize-none placeholder:text-fs-muted focus:border-fs-accent/30 focus:outline-none focus:ring-1 focus:ring-fs-accent/30`}
          />
          <p className="shrink-0 text-right text-[9px] text-fs-muted">
            {value.length} / {INTRO_TEXT_MAX_LEN}
          </p>
        </div>
      ) : value.trim() ? (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-fs-border/90 bg-fs-elevated/30 px-2 py-1.5">
          <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-fs-text">
            {value}
          </p>
        </div>
      ) : (
        <p className="px-1 py-4 text-center text-[11px] text-fs-muted">
          {editable ? "请先加载模板后再编写介绍。" : "该模板暂无介绍。"}
        </p>
      )}
    </div>
  );
}
