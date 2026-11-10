"use client";

import { classifyMacroEventSurprise, evaluateMacroSurprise, macroSurpriseMarkerColor } from "@/lib/data/macroEventSurprise";
import { useTr } from "@/i18n/TextProvider";

export function MacroEventSurpriseSummary({ payload }: { payload: unknown }) {
  const tr = useTr();
  const result = classifyMacroEventSurprise(payload);
  const c = result.decisive;
  if (!c) return <p className="text-xs text-fs-muted">{tr("预期差未评估：缺少有效数值证据或适用阈值，不能视为符合预期。")}</p>;
  const unit = c.evidence.unit === "%" ? tr("个百分点") : c.evidence.unit;
  const fmt = (n: number) => Number(n.toPrecision(6)).toLocaleString("zh-CN");
  return <div className="mb-2 rounded border border-fs-border p-2 text-xs">
    <strong style={{ color: macroSurpriseMarkerColor(result) }}>{result.level === "large" ? tr("◆大预期差") : tr("未达大偏差阈值")}{result.direction === "mixed" ? tr(" · 关键分项方向相反") : ""}</strong>
    <p className="mt-1">{tr("判定分项：")}{c.evidence.label ?? c.evidence.metricId} {tr("· 实际")} {fmt(c.evidence.actual)} {tr("/ 预期")} {fmt(c.evidence.consensus)} {c.evidence.unit}</p>
    <p>{tr("差值")} {c.difference > 0 ? "+" : ""}{fmt(c.difference)} {unit} {tr("· 大偏差阈值 ≥")}{fmt(c.threshold)} {unit} {tr("· 强度")} {c.strength.toFixed(2)} {tr("倍阈值")}</p>
    {c.thresholdReason && <p className="text-fs-muted">{c.thresholdReason}{c.relativeDifference !== undefined ? tr("；本次相对预期偏差 {v0}{v1}%", { v0: c.relativeDifference > 0 ? "+" : "", v1: c.relativeDifference.toFixed(1) }) : ""}</p>}
    {c.evidence.consensusRange && <p className="text-fs-muted">{tr("调查范围：")}{c.evidence.consensusRange}{tr("（供参考）")}</p>}
    <p className="mt-1 text-fs-muted">{tr("关键分项任一达标即入选，不重复累加。试行绝对阈值，非标准差；历史报道用于事后研究，未证明发布前快照。数值方向不代表资产利好／利空。")}</p>
  </div>;
}

export function MacroSurpriseEvidence({ payload, compact = false }: { payload: unknown; compact?: boolean }) {
  const tr = useTr();
  const result = evaluateMacroSurprise(payload);
  if (!result.evidence) return <p className="text-xs text-fs-muted">{result.reason}</p>;
  const e = result.evidence;
  const direction = result.direction === "inline" ? tr("基本符合预期") : result.direction === "above" ? tr("高于预期") : tr("低于预期");
  return <div className={`rounded border p-2 text-xs ${result.large ? "border-amber-500/60 bg-amber-500/10" : "border-fs-border"}`}>
    {typeof e.label === "string" && <p className="mb-1 font-medium">{tr(e.label)}</p>}
    <div className="flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
      <span>{tr("首发")} {e.actual} {e.unit}</span><span>{tr("一致预期")} {e.consensus} {e.unit}</span>
      <span>{tr("差值")} {result.difference! > 0 ? "+" : ""}{Number(result.difference!.toPrecision(6))} {e.unit}</span>
      {result.status === "scored" && <strong>{direction} · S={result.score!.toFixed(2)}{result.large ? tr(" · 明显偏差") : ""}</strong>}
    </div>
    {!compact && <div className="mt-2 space-y-1 text-fs-muted">
      <p>{tr("参考期：")}{e.referencePeriod} {tr("· 历史样本")} {result.sampleSize ?? 0} {tr("次")}</p>
      <p>{tr("发布：")}{e.releaseAt} · {e.consensusAsOf ? tr("预期快照：{consensusAsOf}", { consensusAsOf: e.consensusAsOf }) : tr("预期证据：历史报道，非发布前精确快照")}</p>
      <p>{result.reason}{tr("。数值方向不等于资产利好／利空；来源证据仍需核实。")}</p>
      <div className="flex flex-wrap gap-3"><a href={e.actualSourceUrl} target="_blank" rel="noopener noreferrer" className="text-fs-accent-text underline">{tr("实际值来源")}</a><a href={e.consensusSourceUrl} target="_blank" rel="noopener noreferrer" className="text-fs-accent-text underline">{tr("预期来源：")}{e.consensusSource}</a></div>
    </div>}
    {compact && result.status !== "scored" && <p className="mt-1 text-fs-muted">{result.reason}</p>}
  </div>;
}

export function MacroReleaseComponentsEvidence({ payload }: { payload: unknown }) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const root = payload as Record<string, unknown>;
  const components = root.macroReleaseComponents;
  const primary = root.macroRelease as Record<string, unknown> | undefined;
  if (!Array.isArray(components)) return null;
  return <div className="space-y-2">{components.slice(0, 30).filter(c => c && typeof c === "object" &&
    (!primary?.metricId || c.metricId !== primary.metricId)).map((component, i) =>
      <MacroSurpriseEvidence key={i} payload={{ macroRelease: component }} />)}</div>;
}
