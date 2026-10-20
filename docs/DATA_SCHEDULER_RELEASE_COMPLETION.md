# 发布包完成判定与源端转载延迟

## 原则

官方发布时刻只决定何时开始抓取，不证明 FRED 已转载本期。HTTP 200、SKIPPED、旧月份修订、`sourceLagDays=0` 和 `lastSuccessAt` 均不能单独证明已消费本期。

FRED 日历包需要包内全部可调度成员的源端更新证明；口径明确的月报还要收齐目标观测月。失败、未核验成员继续阻止推进。目录排除项、明确历史退役项和不可调度项沿用既有资格规则，不以“落后很久”自行认定退役。

## 源端更新证明

`fredAdapter` 在请求观测前读取 `/fred/series` 的 `last_updated`，随本轮结果写入成员 `releaseRule.sourceSync.sourcePublishedAt`；不得使用客户端抓取时间。接口依据：[FRED series API](https://fred.stlouisfed.org/docs/api/fred/series.html)。

元信息失败仍允许保存有效观测，但不生成完成证明；日志的 `sourceMetadata.publicationError` 记录原因。未来或无效时间不作为证明。旧版只有 `verifiedAt` 的 FRED 证明在升级后失效，由 worker 重新核验，不需要 migration 或改写观测。

复合指标取所有底层依赖的最早更新时间，缺一不可。源站快通道仍可先保存更新的值，但不代替 FRED 的更新证据。

同一包关联多个 FRED release（例如 FOMC/H.15、Treasury Bulletin/债务比率）时，另读 `/fred/series/release`，逐底层依赖保存 release ID 和更新时间。日历同步按各 ID 最近一次已发生发布分别核对，不要求 FOMC 目标利率在每次 H.15 日报后重新发布。缺失 release 身份或对应历史日历时保留待补抓。

FOMC 包内的 FEDFUNDS 是月均值，虽然归在每日 H.15 release 下，不能要求逐日重新发布。该成员明确检查上一完整月份和本月源端更新时间；DFEDTARU 仍按其自身 release 核对。频率例外须显式登记，不能从落后日期自动推断。

## 观测期契约

`src/lib/data/scheduler/releaseObservationPolicy.ts` 集中维护固定月报的 `MONTHLY_RELEASE_LAG`。例如 PPI 在 10 月发布 9 月，月差为 1；国际贸易/库存销售通常月差为 2。按包内月频成员最旧的 `lastObsDate` 检查，而非只看总项，跨年使用 UTC 月份运算。

FRED 的 release/dates 只给日期，现有日历约定时刻为美东 08:30。已独立证明目标月到齐的固定月报按发布日核对源更新时间，允许 ADP 等在约定时刻之前公布，避免“08:15 已取得完整新月但 08:30 门禁永远不放行”。未到目标月仍不能消费。

GDP 修订、周频、混合频率，以及发布日期可能在月内跨动的 JOLTS 不猜固定月差，使用源端更新证明。新增契约前确认整包成员的频率、发布对应期、预估/终值和历史退役状态。跨月延期、临时补发需要重新核对契约；持续待补抓应调查来源及口径，不应通过放宽阈值或停用缺失成员消除提示。

`sourcePublishedAt` 只表示 FRED 当次更新时间，不等于官方首发时间，不能据此声称有历史 PIT 数据。对于未知观测期的包，源端更新证明也不等于对全部数据语义的独立审计。

## 排期和运维

- 未消费本期时保留发布后的两小时重试，日历同步不能推到下期。
- 若旧代码已误推到下期，新代码会恢复两小时重试；不会每小时刷新就不断顺延重试。
- 护栏通过既有排期审计 `hold_pending_release` 暴露，不把待补抓伪装成已更新。
- `data:verify-ppi -- --db` 从 release 46 最近一次已发生发布推导目标期；无法取得日历则报错，不退回三个月宽松阈值。
- 按仓库正常部署流程发布，并由 `sync-cron-checkout.sh` 同步 cron 检出。无需数据库迁移、全域 seed 或手工改写所有 nextRunAt。

回归测试涵盖旧值无变化、旧期修订、部分分项到齐、源元信息失败、已有错误下月排期、跨年、源时区夏令时、复合依赖身份与多 release 包。PPI 事故及恢复记录见 [2026-10-20 调查报告](reports/US_PPI_SUBSCRIPTION_AUDIT_2026-10-20.md)。
