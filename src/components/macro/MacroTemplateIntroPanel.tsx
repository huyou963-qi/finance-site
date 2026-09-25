"use client";

import { useEffect, useMemo, useRef } from "react";
import { INTRO_HTML_MAX_LEN, sanitizeMacroIntroHtml } from "@/lib/data/macroIntroHtml";

export type MacroTemplateIntroIndicator = { key: string; label: string };
export type MacroTemplateIntroChartSection = { slotKey: string; title: string };
export type MacroTemplateIntroPanelProps = {
  templateName: string | null;
  templateDescription?: string | null;
  introText?: string | null;
  introHtml?: string | null;
  chartSections?: MacroTemplateIntroChartSection[];
  indicators: MacroTemplateIntroIndicator[];
  notes: Record<string, string>;
  onIntroHtmlChange?: (html: string) => void;
  editable?: boolean;
  className?: string;
};

const MAX_TEXT_LENGTH = 20000;
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char] ?? char);

function legacyIntro(chartSections: MacroTemplateIntroChartSection[] | undefined,
  indicators: MacroTemplateIntroIndicator[], notes: Record<string, string>): string {
  const blocks: string[] = [];
  if (chartSections?.length) {
    chartSections.forEach(({ slotKey, title }, index) => {
      const note = notes[slotKey]?.trim();
      if (note) blocks.push(`图 ${index + 1} · ${title}\n${note}`);
    });
  } else {
    indicators.forEach(({ key, label }) => {
      const note = notes[key]?.trim();
      if (note) blocks.push(`${label}\n${note}`);
    });
  }
  return blocks.join("\n\n");
}

function textToParagraphs(text: string): string {
  return text.trim().split(/\n\s*\n/).filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
}

export function MacroTemplateIntroPanel({ templateName, templateDescription, introText,
  introHtml, chartSections, indicators, notes, onIntroHtmlChange, editable = false,
  className = "" }: MacroTemplateIntroPanelProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);
  const lastValidRef = useRef("");
  const dirtyRef = useRef(false);
  const canEdit = editable && Boolean(onIntroHtmlChange);
  const initialHtml = useMemo(() => {
    if (introHtml !== null && introHtml !== undefined) return sanitizeMacroIntroHtml(introHtml) ?? "";
    const body = introText?.trim() || legacyIntro(chartSections, indicators, notes);
    return textToParagraphs([templateDescription?.trim(), body].filter(Boolean).join("\n\n"));
  }, [introHtml, introText, templateDescription, chartSections, indicators, notes]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || dirtyRef.current) return;
    if (editor.innerHTML !== initialHtml) editor.innerHTML = initialHtml;
    lastValidRef.current = initialHtml;
  }, [initialHtml]);

  function rememberSelection() {
    const range = window.getSelection()?.getRangeAt(0);
    if (range && editorRef.current?.contains(range.commonAncestorContainer)) {
      selectionRef.current = range.cloneRange();
    }
  }

  function restoreSelection() {
    editorRef.current?.focus();
    if (!selectionRef.current) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(selectionRef.current);
  }

  function emitChange() {
    const editor = editorRef.current;
    if (!editor) return;
    if ((editor.textContent?.length ?? 0) > MAX_TEXT_LENGTH || editor.innerHTML.length > INTRO_HTML_MAX_LEN) {
      editor.innerHTML = lastValidRef.current;
      return;
    }
    const clean = sanitizeMacroIntroHtml(editor.innerHTML) ?? "";
    dirtyRef.current = true;
    lastValidRef.current = clean;
    onIntroHtmlChange?.(clean);
    rememberSelection();
  }

  function command(name: string, value?: string) {
    restoreSelection();
    document.execCommand(name, false, value);
    emitChange();
  }

  function setFontSize(size: string) {
    restoreSelection();
    const range = window.getSelection()?.getRangeAt(0);
    const editor = editorRef.current;
    if (!range || !editor || !editor.contains(range.commonAncestorContainer)) return;
    if (range.collapsed) {
      const node = range.startContainer;
      const element = node instanceof Element ? node : node.parentElement;
      const paragraph = element?.closest("p, div, li");
      if (paragraph && paragraph !== editor) (paragraph as HTMLElement).style.fontSize = `${size}px`;
    } else {
      const span = document.createElement("span");
      span.style.fontSize = `${size}px`;
      span.appendChild(range.extractContents());
      range.insertNode(span);
      range.selectNodeContents(span);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    emitChange();
  }

  function setLineHeight(value: string) {
    restoreSelection();
    const node = window.getSelection()?.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;
    const editor = editorRef.current;
    if (!element || !editor) return;
    let paragraph = element.closest("p, div, li");
    if (!paragraph || paragraph === editor) {
      document.execCommand("formatBlock", false, "p");
      const current = window.getSelection()?.anchorNode;
      const currentElement = current instanceof Element ? current : current?.parentElement;
      paragraph = currentElement?.closest("p, div, li") ?? null;
    }
    if (paragraph && paragraph !== editor && editor.contains(paragraph)) {
      (paragraph as HTMLElement).style.lineHeight = value;
    }
    emitChange();
  }

  const selectClass = "rounded border border-fs-border bg-white px-1 py-0.5 text-[10px] text-fs-text";
  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-2 ${className}`}>
      <p className="shrink-0 text-[11px] font-medium text-fs-text">
        {templateName?.trim() || "当前工作区"}
      </p>
      {canEdit && (
        <div className="flex shrink-0 flex-wrap items-center gap-1" onMouseDown={rememberSelection}>
          <select aria-label="字体" title="字体" className={selectClass} defaultValue="" onChange={(e) => { command("fontName", e.target.value); e.target.value = ""; }}>
            <option value="" disabled>字体</option>
            {["Arial", "Georgia", "Times New Roman", "Microsoft YaHei", "SimSun"].map((font) => <option key={font} value={font}>{font}</option>)}
          </select>
          <select aria-label="字体大小" title="字体大小" className={selectClass} defaultValue="" onChange={(e) => { setFontSize(e.target.value); e.target.value = ""; }}>
            <option value="" disabled>字号</option>
            {["10", "12", "14", "16", "18", "20", "24", "28", "32"].map((size) => <option key={size} value={size}>{size}px</option>)}
          </select>
          <label className="flex items-center gap-1 text-[10px] text-fs-text" title="字体颜色">
            字色 <input type="color" aria-label="字体颜色" defaultValue="#222222" className="h-6 w-6 cursor-pointer" onChange={(e) => command("foreColor", e.target.value)} />
          </label>
          <button type="button" title="新段落" className={selectClass} onMouseDown={(e) => e.preventDefault()} onClick={() => command("formatBlock", "p")}>段落</button>
          <select aria-label="行间距" title="行间距" className={selectClass} defaultValue="" onChange={(e) => { setLineHeight(e.target.value); e.target.value = ""; }}>
            <option value="" disabled>行距</option>
            {["1", "1.25", "1.5", "1.75", "2", "2.5"].map((spacing) => <option key={spacing} value={spacing}>{spacing}</option>)}
          </select>
        </div>
      )}
      <div
        ref={editorRef}
        role="textbox"
        aria-label="模板介绍"
        aria-multiline="true"
        contentEditable={canEdit}
        suppressContentEditableWarning
        onMouseUp={rememberSelection}
        onKeyUp={rememberSelection}
        onInput={emitChange}
        onDrop={(e) => e.preventDefault()}
        onPaste={(e) => {
          e.preventDefault();
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }}
        className={`min-h-0 flex-1 overflow-y-auto rounded-md border border-fs-border/90 bg-white/95 px-2 py-1.5 text-[11px] leading-relaxed text-fs-text [&_p]:mb-2 [&_p:last-child]:mb-0 ${canEdit ? "focus:border-fs-accent/30 focus:outline-none focus:ring-1 focus:ring-fs-accent/30" : ""}`}
      />
    </div>
  );
}
