# 美国行业 Regime 阶段 H：生产自动化与连续监控

日期：2026-08-14  
协议：`stage-h-v1`

## 结论

阶段 H 完成 A–H 工程路线的最后一段：ALFRED 增量版本、月度信号冻结、到期评分、heartbeat 和告警已形成一个可日常运行且不可回写历史结果的闭环。它不改变阶段 F 模型，也不提高统计证据等级。

## 复用的数据底层

- FRED/ALFRED：`scheduler/adapters/fredAdapter.ts` + 全局 rate limiter；
- 版本写入：`appendMacroObservationVintages`；
- Regime：`quant/macroRegime.ts`；
- 因子：`FactorSectorSnapshot` 共享读取层；
- 行情：`equityPriceStore.ts`；
- 通知：scheduler `slackNotify.ts` / `operationalNotify.ts`，复用 `DATA_LAG_*` 配置。

新增 heartbeat 文件不是第二套数据事实库，只记录“组合运维任务最后是否成功运行”这一此前不存在的操作事实。

首次上线时，旧快表中的当前值可能早于 Vintage writer 启用。系统只在真实执行时刻追加 `stage_h_bootstrap` 当前投影，不将这些值倒填到历史发布日期。该投影继续经过同一个 `appendMacroObservationVintages`，并保留来源和语义 metadata。

## 运行口径

```bash
npm run equity:run-sector-regime-stage-h
npm run equity:monitor-sector-regime-stage-h -- --dry-run
npm run equity:verify-sector-stage-h -- --run
```

生产 cron：`scripts/ops/finance-site-sector-regime.cron`。部署只安装定义；日常拉取在 cron 中执行并用 `flock` 防重入。

## 首次实库验收

- 运行时间：2026-08-14；
- 输入登记/当前版本覆盖/当前值匹配：7/7、7/7、7/7；
- ALFRED 官方历史：5/5 个适用预测输入；
- 一次性当前锚点：6 条（含 2 个 ISM 输入），总版本行 51,823；
- 冻结快照：33 条行业期限判断，信号哈希无漂移；
- 到期缺价：0；监控告警：0。

## ISM 边界

ISM 官方日历可以证明 Manufacturing 在每月第一个工作日、Services 在第三个工作日 10:00 ET 发布；当前/上月页面可人工复核报告。但官方报告许可禁止未经授权的下载、归档与派生时间序列，因此没有实现历史 scraper。后续若取得许可，必须接入现有 Source Adapter 与统一 Vintage writer。

## 证据状态

- 过程完整性：B；
- 统计推断：C；
- 已冻结 cohort：继续自然累积；
- 正式复评：至少 36 个独立月度冻结信号；
- 复评前：不得调整门槛、模型或历史阶段标签。
