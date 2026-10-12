import { evaluateMacroSurprise } from "@/lib/data/macroEventSurprise";

export function MacroSurpriseEvidence({ payload, compact = false }: { payload: unknown; compact?: boolean }) {
  const result = evaluateMacroSurprise(payload);
  if (!result.evidence) return <p className="text-xs text-fs-muted">{result.reason}</p>;
  const e = result.evidence;
  const direction = result.direction === "inline" ? "基本符合预期" : result.direction === "above" ? "高于预期" : "低于预期";
  return <div className={`rounded border p-2 text-xs ${result.large ? "border-amber-500/60 bg-amber-500/10" : "border-fs-border"}`}>
    {typeof e.label === "string" && <p className="mb-1 font-medium">{e.label}</p>}
    <div className="flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
      <span>首发 {e.actual} {e.unit}</span><span>一致预期 {e.consensus} {e.unit}</span>
      <span>差值 {result.difference! > 0 ? "+" : ""}{Number(result.difference!.toPrecision(6))} {e.unit}</span>
      {result.status === "scored" && <strong>{direction} · S={result.score!.toFixed(2)}{result.large ? " · 明显偏差" : ""}</strong>}
    </div>
    {!compact && <div className="mt-2 space-y-1 text-fs-muted">
      <p>参考期：{e.referencePeriod} · 历史样本 {result.sampleSize ?? 0} 次</p>
      <p>发布：{e.releaseAt} · {e.consensusAsOf ? `预期快照：${e.consensusAsOf}` : "预期证据：历史报道，非发布前精确快照"}</p>
      <p>{result.reason}。数值方向不等于资产利好／利空；来源证据仍需核实。</p>
      <div className="flex flex-wrap gap-3"><a href={e.actualSourceUrl} target="_blank" rel="noopener noreferrer" className="text-fs-accent-text underline">实际值来源</a><a href={e.consensusSourceUrl} target="_blank" rel="noopener noreferrer" className="text-fs-accent-text underline">预期来源：{e.consensusSource}</a></div>
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
