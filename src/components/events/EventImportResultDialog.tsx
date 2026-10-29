"use client";

import type { MarketEventDto } from "@/lib/data/marketEvents";
import type { EventImportReceipt, LocalEventPack } from "@/lib/equity/localEventPacks";
import { describeImportedBatch } from "@/lib/chart/eventImportResults";
import type { EventViewFilterState } from "@/lib/chart/eventViewFilters";
import type { selectChartEvents } from "@/lib/chart/eventSelection";
import { EventSettingsDialog } from "./EventSettingsDialog";

export function EventImportResultDialog({ receipt, packs, symbol, filters, from, to, projection, onClose, onManage, onDetail }: {
  receipt: EventImportReceipt; packs: LocalEventPack[]; symbol: string; filters: EventViewFilterState;
  from: string; to: string; projection: ReturnType<typeof selectChartEvents>["chartProjection"];
  onClose: () => void; onManage: () => void; onDetail?: (event: MarketEventDto) => void;
}) {
  const batch = describeImportedBatch(receipt, packs, symbol, filters, from, to);
  const chartStatus = { candidate: "已通过图表筛选", merged: "与同一事件合并显示", disabled: "本类上图开关已关闭", hidden_marker: "此事件已单独设置为不上图" };
  return <EventSettingsDialog title="本次导入结果" onClose={onClose}>
    <div className="w-full space-y-3 text-xs">
      <p className="break-words"><strong>{receipt.packName}</strong></p>
      <p>新增 {receipt.added} · 更新 {receipt.updated} · 未变 {receipt.unchanged}</p>
      <p>本次提交 {receipt.externalIds.length} 条，当前条件下可见 {batch.visible} 条。{receipt.otherPackIds > 0 ? `另有 ${receipt.otherPackIds} 个 ID 在其他包出现，其他包未被改动。` : ""}</p>
      <details><summary className="min-h-9 cursor-pointer leading-9">导入明细</summary><p>包 ID：{receipt.packId} · 原有未提交事件保留 {receipt.retained}</p><p>当前资产 {symbol} · {from} 至 {to}</p></details>
      {batch.pack ? <p>包范围：{batch.pack.target === "all-assets" ? "全部资产" : batch.pack.symbols?.join("、")} · {batch.pack.enabled ? "已启用" : "已停用（重导保留原开关）"}</p> : <p role="status">此事件包已被删除。</p>}
      {batch.missing > 0 && <p role="status">本次记录有 {batch.missing} 条当前未找到，请检查事件包是否被修改或删除。</p>}
      <button className="min-h-10 rounded border border-fs-border px-2" onClick={onManage}>管理事件包</button>
      <ul className="space-y-2">{batch.rows.map(({ event, reasons, visible }) => <li key={event.id} className="space-y-1 rounded border border-fs-border p-2">
        <p><time>{event.occurredAt.slice(0, 10)}</time> · {event.title}</p>
        <p className={visible ? "text-fs-accent-text" : "text-fs-muted"}>{visible ? `可见 · ${projection[event.id] ? chartStatus[projection[event.id].status] : "等待事件集合更新"}` : `未显示：${reasons.join("；")}`}</p>
        {onDetail && <button className="min-h-9 text-fs-accent-text" onClick={() => onDetail(event)}>查看事件详情</button>}
      </li>)}</ul>
    </div>
  </EventSettingsDialog>;
}
