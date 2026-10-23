# 黄金 COT 多空历史补齐与订阅验收

验收日期：2026-10-23（北京时间）。

## 原因

`seed-cot.ts` 与 `bulkImportCotHistory` 只回填最近 60 周，生产多头、空头因此从 2025-05-06 开始，各 76 周。增量 worker 从最新观测往前回读两个月捕获修订，不会自动发现更早的缺口。净持仓 `goldov_c06_mm_net` 是独立的历史导入序列，从 2009-09-01 开始，故表现不同。

生产自动调度正常：23 个品种的多空及黄金净持仓共 47 条订阅均启用、无错误。修复前黄金三条订阅最近四次均成功检查但没有新值，按 `SKIPPED` 记录；下次排期在未来。独立采集端 `/opt/finance-site-jp-data` 每五分钟运行 worker，COT 每十二小时探测。

## 代码修复

- 默认历史回填及冷启动改为 2006 年起的完整 Disaggregated Futures-and-Options Combined 数据，保留原来的 `weeksBack` 程序接口。
- Socrata 按 50,000 行分页，按报告日及唯一 id 排序；只请求所需字段。
- HTTP 或网络错误时使用 CFTC 官方年度档案；完整历史模式禁止降级成最新一期成功，缓存也区分完整历史与最新一期。
- 增量源端最新日期仅按匹配品种计算；没有匹配数据时明确失败。
- 新增 `--products=gold` 可只回填黄金。批量回填后从观测表读取实际最大日期，避免订阅缓存倒退。
- `data:verify-cot -- --db` 增加黄金多空对净持仓全部历史日期的覆盖和算术检查。

官方来源：[CFTC 历史压缩档案](https://www.cftc.gov/MarketReports/CommitmentsofTraders/HistoricalCompressed/index.htm)、[Socrata kh3c-gbw2](https://publicreporting.cftc.gov/resource/kh3c-gbw2.json)。始终使用分项期货与期权合并报告，不拼接 Legacy 或 Futures Only 口径。

## 执行结果

已在本地和香港生产库执行：

```bash
npm run data:seed-cot -- --bulk-only --products=gold
npm run data:verify-cot -- --db
```

生产多头、空头各 1,062 周，2006-06-13 至 2026-10-13；各新增 986 条，共 1,972 条。现存净持仓 894 周，2009-09-01 至 2026-10-13，全部重叠周满足多头减空头等于净持仓。

通过正式 `runDataSubscription` 入口再次执行黄金三条订阅，均为 `SKIPPED`（无新数据），`sourceLagDays=0`，新增和修订均为零。网站 `/api/data/macro?source=unified` 实测返回多头和空头各 1,062 点，首日 2006-06-13，最新日 2026-10-13。

采集脚本修复已应用到生产网站源码目录及独立调度器目录；未改页面和数据库 schema。源代码与验收文档随本次 COT 修复提交归档。

## 备份与验收证据

生产共享 `.data/audits/`：

- `cot-gold-before-2026-10-23.json`：修改前的三条仪器、全部观测及订阅快照。
- `cot-code-before-2026-10-23-*.tar`：网站及独立采集端的原脚本备份。
- `cot-gold-acceptance-2026-10-23.json`：三条订阅实际运行结果和网站 API 返回范围。

生产 `/opt/finance-site/logs/`：`cot-gold-repair-20261023.log`、`cot-gold-acceptance-20261023.log`。

回归测试覆盖超过 50,000 行分页、网络失败兜底、完整历史模式拒绝当前一期缓存、冷启动历史起点、逐品种最新日期与无匹配数据报错，共六项。
