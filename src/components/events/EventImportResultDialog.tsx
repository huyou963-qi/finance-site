"use client";

import type { MarketEventDto } from "@/lib/data/marketEvents";
import type { EventImportReceipt, LocalEventPack } from "@/lib/equity/localEventPacks";
import { describeImportedBatch } from "@/lib/chart/eventImportResults";
import type { EventViewFilterState } from "@/lib/chart/eventViewFilters";
import type { selectChartEvents } from "@/lib/chart/eventSelection";
import { EventSettingsDialog } from "./EventSettingsDialog";
import { useTr } from "@/i18n/TextProvider";

export function EventImportResultDialog({ receipt, packs, symbol, filters, from, to, projection, onClose, onManage, onDetail }: {
  receipt: EventImportReceipt; packs: LocalEventPack[]; symbol: string; filters: EventViewFilterState;
  from: string; to: string; projection: ReturnType<typeof selectChartEvents>["chartProjection"];
  onClose: () => void; onManage: () => void; onDetail?: (event: MarketEventDto) => void;
}) {
  const tr = useTr();
  const batch = describeImportedBatch(receipt, packs, symbol, filters, from, to);
  const chartStatus = { candidate: tr("已通过图表筛选"), merged: tr("与同一事件合并显示"), disabled: tr("本类上图开关已关闭"), hidden_marker: tr("此事件已单独设置为不上图") };
  return <EventSettingsDialog title={tr("本次导入结果")} onClose={onClose}>
    <div className="w-full space-y-3 text-xs">
      <p className="break-words"><strong>{receipt.packName}</strong></p>
      <p>{tr("新增")} {receipt.added} {tr("· 更新")} {receipt.updated} {tr("· 未变")} {receipt.unchanged}</p>
      <p>{tr("本次提交")} {receipt.externalIds.length} {tr("条，当前条件下可见")} {batch.visible} {tr("条。")}{receipt.otherPackIds > 0 ? tr("另有 {otherPackIds} 个 ID 在其他包出现，其他包未被改动。", { otherPackIds: receipt.otherPackIds }) : ""}</p>
      <details><summary className="min-h-9 cursor-pointer leading-9">{tr("导入明细")}</summary><p>{tr("包 ID：")}{receipt.packId} {tr("· 原有未提交事件保留")} {receipt.retained}</p><p>{tr("当前资产")} {symbol} · {from} {tr("至")} {to}</p></details>
      {batch.pack ? <p>{tr("包范围：")}{batch.pack.target === "all-assets" ? tr("全部资产") : batch.pack.symbols?.join("、")} · {batch.pack.enabled ? tr("已启用") : tr("已停用（重导保留原开关）")}</p> : <p role="status">{tr("此事件包已被删除。")}</p>}
      {batch.missing > 0 && <p role="status">{tr("本次记录有")} {batch.missing} {tr("条当前未找到，请检查事件包是否被修改或删除。")}</p>}
      <button className="min-h-10 rounded border border-fs-border px-2" onClick={onManage}>{tr("管理事件包")}</button>
      <ul className="space-y-2">{batch.rows.map(({ event, reasons, visible }) => <li key={event.id} className="space-y-1 rounded border border-fs-border p-2">
        <p><time>{event.occurredAt.slice(0, 10)}</time> · {event.title}</p>
        <p className={visible ? "text-fs-accent-text" : "text-fs-muted"}>{visible ? tr("可见 · {v0}", { v0: projection[event.id] ? chartStatus[projection[event.id].status] : tr("等待事件集合更新") }) : tr("未显示：{v0}", { v0: reasons.join("；") })}</p>
        {onDetail && <button className="min-h-9 text-fs-accent-text" onClick={() => onDetail(event)}>{tr("查看事件详情")}</button>}
      </li>)}</ul>
    </div>
  </EventSettingsDialog>;
}
