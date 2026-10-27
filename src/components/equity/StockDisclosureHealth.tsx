import type { StockDisclosureHealth as Health } from "@/lib/equity/disclosureHealthPolicy";

export function StockDisclosureHealth({ health }: { health: Health | null }) {
  if (!health) return null;
  const batch = health.batch;
  const color = health.state === "success" ? "text-emerald-600" : health.state === "failed" || health.state === "stale"
    ? "text-red-600" : "text-fs-muted";
  const time = (date: string) => new Date(date).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
  return <div className="min-w-0 border-b border-fs-border px-3 py-2 text-xs leading-6" role="status">
    <p className={color}>{health.message}</p>
    {batch ? <details className="text-fs-muted">
      <summary className="w-fit cursor-pointer text-fs-accent-text">每日更新详情</summary>
      <div className="flex flex-wrap gap-x-4">
        <span>开始：{time(batch.startedAt)}（北京）</span>
        <span>{batch.finishedAt ? `${batch.status === "failed" ? "失败确认" : "结束"}：${time(batch.finishedAt)}（北京）` : "批次尚未正常结束"}</span>
        <span>{batch.scope === "all" ? "全库范围" : "指定标的批次"}</span>
      </div>
      <div className="flex flex-wrap gap-x-4">
        <span>批次新增公告 {batch.indexed}</span><span>完成处理 {batch.complete}</span>
        <span>本批待补齐 {batch.pending}</span><span>失败项 {batch.failed}</span><span>剩余任务 {batch.remaining}</span>
        <span>时点核验 {batch.timingUpdated}</span>
      </div>
      <p>覆盖范围：8-K、10-Q、10-K 及其修订版；上述统计不包含 6-K、20-F 等尚未接入的公告类型。</p>
      {batch.missingIndexes.length ? <p className="break-words">尚未取得日索引：{batch.missingIndexes.join("、")}（可能为节假日或源站缺失，后续批次复核）</p> : null}
      {batch.status === "running" || batch.status === "failed" ? <p>未正常结束的批次统计可能尚不完整。</p> : null}
    </details> : null}
  </div>;
}
