# 美国 PPI 9 月未更新：订阅机制调查（2026-10-20）

## 结论

香港生产库 20 条最终需求 PPI 订阅全部启用，但实际最新观测均为 2026-08-01。调查时从香港逐条请求 FRED，20/20 HTTP 200，全部已返回 2026-09-01 的观测。问题位于发布后补抓及完成判定；未发现序列 ID 错误或订阅停用。

本次仅调查，未修改生产订阅、观测、排期或部署代码。

> 后续用户授权修复，处理结果见文末“修复与恢复”。上述描述为最初调查阶段状态。

## 更新链路

- 20 条原始指数：10 条季调（供模板计算环比），10 条非季调（供模板计算同比），见 ppiFredSeedCatalog.ts；PPIFIS 由 CPI seed 维护，其余由 seed-ppi 维护。
- 统一绑定 us.bls.ppi 发布包，日历使用 FRED release 46；releaseTemplate 中 calendarProvider=tradingeconomics 为通用配置字段，实际 calendarMatch.source=fred_release。
- 每小时日历刷新；worker 每 5 分钟选取到期订阅。
- 发布后延迟 3 分钟抓取；原计划无新值时 2 小时探测。只有没有可用 calendarMatch 时，才用每月 10–28 日每 12 小时的 fallback。
- FRED adapter 回读最新观测前 3 个月以接收修订；存原始指数，变换留在模板。

## 线上证据（以下均为北京时间）

BLS 在 2026-10-15 20:30 发布 9 月 PPI：
https://www.bls.gov/news.release/archives/ppi_10152026.htm

- 首次排期 10-15 20:33，实际约 20:37–20:39 抓取；日志返回最新期 8 月。
- 20:38:00 排期审计 calendar_catch_up_missed_release，尝试补抓。
- 第二轮约 20:46–20:47 抓取；20 条最新运行全部 SKIPPED、rowsUpserted=0，latestObs=2026-08-01。
- 20:47:06 排期审计 calendar_matched，把整包从本轮补抓点推进到 11-13 21:33。
- 10-20 调查时该整包及全部成员仍排在 11-13 21:33，之后没有新的成员抓取日志。
- 实际 macro_observation 逐条读取确认停在 8 月，排除仅 lastObsDate 缓存过旧。
- 香港直接请求 FRED 全部返回 9 月；例如 PPIFIS=159.78、PPIFID=159.613、WPSFD49116=144.255（均为指数水平）。这些是调查时当前源值，不能当作历史首发版本。

逐项原始证据保存在本机 `.data/ppi-production-audit-20261020.jsonl`，含订阅 ID、实际库最新观测、源最新观测及最后运行记录。

## 根因

1. runSubscription.ts 用“源端最新日期 == 本地最新日期”判定 sourceCaughtUp。发布后 FRED 当时仍回 8 月，两边同为 8 月也会被视为追平，并触发日历刷新；这并不证明 9 月已到库。
2. 正常 SKIPPED 也会更新 lastSuccessAt。packageScheduleGuard.ts 的 releaseConsumed 在缺少 sourceSync 证明时退化为“发布后跑过就算完成”；当次线上成员目前均无 sourceSync。当前源码虽会补写 sourceSync，但其证明仍只核对源/库一致，单独靠它不能解决源端滞后。
3. packageRunState.ts 已对美国 CPI 和部分中国月度包设置 requiredMonthlyObservation，但没有覆盖 us.bls.ppi。因此没有“10 月发布须收齐 9 月观测”的门禁。
4. 日历匹配下一期后，fallback 不再参与；本应保留的 2 小时补抓被下一期排期覆盖，于是一直等待 11 月。
5. verify-ppi.ts 只检查最近 3 个月，10 月验收允许 7 月及以后；8 月旧值仍可通过，不能发现本次漏更。

现有日志能证明当时请求返回旧期，不能据此精确确认 FRED 首次提供全部 9 月分项的时刻。

## 建议处理

- 恢复数据：通过现有发布包同步入口强制同步这 20 条，回读修订窗口，并检查每条实际最新期为 2026-09；避免手写新闻稿百分比到指数序列。
- 持久修复：将 us.bls.ppi 纳入发布期门禁。10 月这轮全部成员至少到 9 月才允许消费本期；SKIPPED、历史修订、sourceLagDays=0 都不能越过门禁。未到齐保留 2 小时重试，不能推进至 11 月。
- 增加回归：8 月源/库一致、只修订旧月、部分成员到 9 月、全部成员到 9 月四种情况；verify 使用已发布目标期而非仅 3 个月宽松阈值。

## 修复与恢复

后续已按用户指示实现系统性修复（代码尚需走仓库发布流程）：

- 所有 FRED 日历发布包增加逐成员源端更新证明。先读 `/fred/series` 的 `last_updated`，再拉观测；抓取时间、无变化运行时间和旧版“源库一致”证明不再能代替 FRED 更新证明。API 参见 https://fred.stlouisfed.org/docs/api/fred/series.html 。
- 源端时间缺失、无效、晚于核验时间，或早于本轮发布时刻时保持待补抓。元信息失败仍可保存成功取得的观测，日志记录缺失证明，不丢数据。
- 复合指标取全部底层依赖更新时间的最小值；保留既有源站快通道，但快通道不会凭空生成 FRED 更新证明。
- 多 release 包逐底层序列保存自身 release ID，并使用各自的最近发布时刻核验，避免 FOMC 目标利率因 H.15 日报触发而永久待补抓。完整运维约定见 [发布包完成判定](../DATA_SCHEDULER_RELEASE_COMPLETION.md)。
- `releaseObservationPolicy.ts` 集中登记口径明确的月报：PPI/CPI、就业/ADP、进出口价格、工业/产能、零售、住房、PCE/个人收入，以及滞后两个月的贸易/库存销售、Case-Shiller、消费信贷等。按包内所有符合条件的月频成员最旧观测检查，年度及已登记历史退役成员不强加月频义务。
- GDP 等修订发布、周频、混合频率包不强套上月目标；仍要求每个 FRED 成员取得源端更新证明。JOLTS 日期可跨月且同月可能有两次发布，未配置固定月差，使用通用源端证明。
- 未消费的本期保留两小时重试；发现曾误排到下一期的包会自动恢复重试。旧版 sourceSync 需要 worker 重新核验，不直接信任。
- `verify-ppi --db` 改读 release 46 的最近已发生发布，校验该发布所对应上月，无法确认日历则明确失败，不再退回三个月宽松阈值。

已通过香港原有 `syncReleasePackage(us.bls.ppi)` 在 worker/calendar 双锁下恢复数据：20 条成功，新增 20 个 9 月观测，回读窗口修订 80 行，失败 0。全部成员 lastObsDate=2026-09-01，lastError=null。已收齐本期后下次排在 2026-11-13 21:33 北京时间合理。日志在本机 `.data/ppi-production-recovery-20261020.log`。

边界：月差契约适用于常规发布安排；未来出现跨月延期或口径调整时应更新该发布包的目标期契约，不能为了让任务变绿而忽略缺失成员。未知口径保持待补抓并通过 `hold_pending_release` 审计暴露。FRED last_updated 仅证明当次源端更新，不是官方历史首发时间或完整 PIT 证据。

最终验证：`npm run verify:commit` 完成，完整套件 1084 项通过、0 失败、1 项平台相关跳过，Prisma schema、ESLint 与 Next.js 生产构建通过；最终补充的局部回归 32 项全部通过。验证日志在本机 `.data/ppi-final-verify-commit.log` 和 `.data/ppi-final-targeted-tests.log`。香港实测 PPIFIS、FEDFUNDS、DFEDTARU 的 last_updated / release ID 与新机制假设一致。本次未部署调度器代码，也未修改数据库 schema。
