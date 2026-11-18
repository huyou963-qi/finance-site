import type { DisclosureBatchHistory } from "@/lib/equity/disclosureBatchAdmin";

const statusLabels: Readonly<Record<string, string>> = {
  running: "运行中",
  success: "完成",
  partial: "部分完成",
  failed: "失败",
  timeout: "疑似超时或中断",
};

const clock = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

const dateTime = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", month: "numeric", day: "numeric",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function DisclosureBatchHistory({ history }: { history: DisclosureBatchHistory | null }) {
  const latestDay = history?.days.find(({ runs }) => runs.length > 0)?.date;
  return (
    <section className="rounded-xl border border-fs-border bg-fs-elevated p-4" aria-labelledby="sec-batch-heading">
      <h2 id="sec-batch-heading" className="text-base font-semibold">SEC 公告抓取与解析</h2>
      <p className="mt-1 text-sm text-fs-muted">
        最近 14 天的全范围批次，按北京时间归档。处理完成数含仅需建索引的普通公告。
      </p>
      {(history?.overdueSlot || history?.backlog) && (
        <ul className="mt-3 space-y-1 rounded-lg border border-fs-border bg-fs-bg p-3 text-sm" role="status">
          {history.overdueSlot && (
            <li><strong>运行逾期</strong>　{history.overdueSlot} 的计划批次已过 2 小时宽限，未找到对应运行记录。</li>
          )}
          {history.backlog && (
            <li><strong>持续积压</strong>　连续 {history.backlog.runs} 轮处理后仍有积压，最近一轮剩余 {history.backlog.remaining} 份。</li>
          )}
        </ul>
      )}
      {history === null ? (
        <p role="status" className="mt-3 text-sm text-fs-negative">批次记录暂时无法读取，请稍后刷新。</p>
      ) : (
        <ul className="mt-3 divide-y divide-fs-border">
          {history.days.map(({ date, runs }) => (
            <li key={date} className="py-1.5">
              {runs.length === 0 ? (
                <p className="flex flex-wrap items-center gap-x-3 py-2 text-sm">
                  <time dateTime={date} className="font-medium">{date}</time>
                  <span className="text-fs-muted">暂无运行记录</span>
                </p>
              ) : (
                <details open={date === latestDay}>
                  <summary className="cursor-pointer py-2 text-sm">
                    <time dateTime={date} className="font-medium">{date}</time>
                    <span className="ml-2 inline-flex flex-wrap gap-x-3 gap-y-1 text-fs-muted">
                      {runs.map((run) => (
                        <span key={run.id}>{clock.format(new Date(run.startedAt))} {statusLabels[run.status] ?? "状态未知"}</span>
                      ))}
                    </span>
                  </summary>
                  <ul className="space-y-2 pb-2">
                    {runs.map((run) => (
                      <li key={run.id} className="rounded-lg border border-fs-border p-3 text-sm">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                          <p className="font-medium">
                            {clock.format(new Date(run.startedAt))} 开始 · {statusLabels[run.status] ?? "状态未知"}
                          </p>
                          {run.finishedAt && (
                            <p className="text-xs text-fs-muted">{dateTime.format(new Date(run.finishedAt))} 结束</p>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-fs-muted">SEC 申报日（美东） {run.fromDay} 至 {run.throughDay}</p>
                        {run.finishedAt && run.status !== "failed" ? (
                          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                            <div><dt className="text-fs-muted">新增索引</dt><dd>{run.indexed}</dd></div>
                            <div><dt className="text-fs-muted">处理完成</dt><dd>{run.complete}</dd></div>
                            <div><dt className="text-fs-muted">待补齐</dt><dd>{run.pending}</dd></div>
                            <div><dt className="text-fs-muted">失败计数</dt><dd>{run.failed}</dd></div>
                            <div><dt className="text-fs-muted">剩余队列</dt><dd>{run.remaining}</dd></div>
                          </dl>
                        ) : (
                          <p className="mt-2 text-xs text-fs-muted">
                            已记录 {run.indexed} 条新增索引。
                            {run.status === "running" ? "处理统计将在批次结束时汇总。" : "本批次未完成处理统计。"}
                          </p>
                        )}
                        {run.failedCompanies > 0 && <p className="mt-2 text-xs text-fs-negative">索引发现未完成的申报主体 {run.failedCompanies} 个</p>}
                        {run.missingIndexes.length > 0 && (
                          <p className="mt-2 break-words text-xs text-fs-muted">
                            未取到日索引（含可能无索引的休市日） {run.missingIndexes.join("、")}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
