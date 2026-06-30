"use client";

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
  /** 按图位介绍（有则优先，不再逐指标展开） */
  chartSections?: MacroTemplateIntroChartSection[];
  indicators: MacroTemplateIntroIndicator[];
  notes: Record<string, string>;
  onNoteChange: (key: string, text: string) => void;
  /** admin 编辑系统模板总介绍时传入 */
  onDescriptionChange?: (text: string) => void;
  /** false：只读展示（非 admin）；true：可编辑并保存 */
  editable?: boolean;
  className?: string;
};

const NOTE_MAX_LEN = 8000;

const introFieldClass =
  "w-full rounded border border-fs-border/90 bg-white/95 px-2 py-1.5 text-[11px] leading-relaxed text-fs-text";

function IntroTextField({
  value,
  editable,
  rows,
  placeholder,
  onChange,
}: {
  value: string;
  editable: boolean;
  rows: number;
  placeholder: string;
  onChange?: (text: string) => void;
}) {
  if (editable) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange?.(e.target.value.slice(0, NOTE_MAX_LEN))}
        rows={rows}
        placeholder={placeholder}
        className={`${introFieldClass} resize-y placeholder:text-fs-muted focus:border-fs-accent/30 focus:outline-none focus:ring-1 focus:ring-fs-accent/30`}
      />
    );
  }

  return (
    <textarea
      value={value}
      readOnly
      tabIndex={-1}
      rows={rows}
      className={`${introFieldClass} cursor-default resize-none border-fs-border text-fs-text focus:outline-none`}
    />
  );
}

export function MacroTemplateIntroPanel({
  templateName,
  templateDescription,
  chartSections,
  indicators,
  notes,
  onNoteChange,
  onDescriptionChange,
  editable = true,
  className = "",
}: MacroTemplateIntroPanelProps) {
  const useChartMode = (chartSections?.length ?? 0) > 0;
  const desc = templateDescription ?? "";
  const descriptionEditable = editable && Boolean(onDescriptionChange);
  const showDescriptionField = desc.trim().length > 0 || descriptionEditable;

  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-2 ${className}`}>
      <div className="shrink-0 rounded-md border border-fs-border/90 bg-fs-elevated/40 px-2 py-1.5">
        <p className="text-[11px] font-medium text-fs-text">
          {templateName?.trim() || "当前工作区"}
        </p>
        {showDescriptionField ? (
          <div className="mt-1">
            <IntroTextField
              value={desc}
              editable={descriptionEditable}
              rows={3}
              placeholder="模板总介绍：阅读顺序、核心问题、与其它模板的衔接…"
              onChange={onDescriptionChange}
            />
          </div>
        ) : (
          <p className="mt-1 text-[11px] leading-relaxed text-fs-muted">
            {editable
              ? "记录各图如何解读、关注哪些拐点与联动关系。内容会自动保存到您的账号。"
              : "以下为模板内置分析思路。"}
          </p>
        )}
      </div>

      {useChartMode ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
          {chartSections!.map(({ slotKey, title }, idx) => (
            <div
              key={slotKey}
              className="rounded-md border border-fs-border/90 bg-fs-elevated/30 p-2"
            >
              <div className="mb-1.5 min-w-0">
                <p className="text-[11px] font-medium text-fs-text">
                  图 {idx + 1} · {title}
                </p>
              </div>
              <IntroTextField
                value={notes[slotKey] ?? ""}
                editable={editable}
                rows={5}
                placeholder="本图分析什么、如何看、与下一图的衔接…"
                onChange={(text) => onNoteChange(slotKey, text)}
              />
            </div>
          ))}
        </div>
      ) : indicators.length === 0 ? (
        <p className="px-1 py-4 text-center text-[11px] text-fs-muted">
          请先加载模板或选择指标后再编写介绍。
        </p>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
          {indicators.map(({ key, label }) => (
            <div
              key={key}
              className="rounded-md border border-fs-border/90 bg-fs-elevated/30 p-2"
            >
              <div className="mb-1.5 min-w-0">
                <p className="truncate text-[11px] font-medium text-fs-text">{label}</p>
                <p className="truncate font-mono text-[9px] text-fs-muted">{key}</p>
              </div>
              <IntroTextField
                value={notes[key] ?? ""}
                editable={editable}
                rows={4}
                placeholder="如何看这条线：定义、正常区间、与 Headline/Core 的联动、发布期关注点…"
                onChange={(text) => onNoteChange(key, text)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
