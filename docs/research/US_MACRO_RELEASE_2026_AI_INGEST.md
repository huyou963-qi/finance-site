# 2026美国宏观发布 · AI Skill补录结果

执行日期：2026-10-12，Asia/Shanghai。按用户要求更新现有`.cursor/skills/market-event-ingest/`，采用公开历史发布稿、调查报告和当日报道检索，不采购API、不新增宏观数据库或调度器。

## 本批结果

窗口按发布日期：2026-01-01—2026-10-12。生成96条事件：89次数据发布、6次FOMC、1次Jackson Hole；数据发布中270个分项有实际值和具体调查预期。香港现有import正式导入：新增92、更新4、错误0；重跑dry-run新增0，更新96。

| 报告族 | 次数 | 说明 |
|---|---:|---|
| CPI/核心CPI | 9 | 2025-12至2026-08数据；9月数据尚未发布，不填实际 |
| 就业报告 | 10 | 非农、失业率、时薪等；前值/修订单列 |
| ADP月报 | 10 | 仅月报，不混入周度初步估计 |
| ISM制造业 | 10 | 2025-12至2026-09 |
| ISM服务业 | 10 | 同上；不同调查机构明确保存 |
| PCE与个人收支 | 10 | 包含1月22日延期报告；未核实核心预期的分项保留缺失 |
| PPI | 10 | 包含1月14日延期报告 |
| 零售 | 10 | 包含1月14日延期报告 |
| GDP | 10 | 1月更新估计及Q4/Q1/Q2不同估计阶段，不倒填后续版本 |
| FOMC | 6 | 已有4次合并补充；无完整调查的决议保留定性预期背景 |
| Jackson Hole | 1 | 主席正式讲话；没有虚构数值一致预期 |

这不是全部TE两星/三星事件的穷尽覆盖。初请/续请、JOLTS、消费者调查、住房、耐用品、工业生产、工资成本、区域联储和拍卖等扩展族尚未在本批补录，后续沿用同一Skill补齐。

## 证据与口径

实际值与独立官方历史材料对照：BLS CPI/就业/PPI归档、BEA当次PCE/GDP发布、Census当次零售PDF、ADP正式新闻稿；ISM使用既有PR Newswire adapter/parser读取官方新闻稿，不增加平行抓取链。

一致预期以CME公开刊载的Econoday报告为主要来源，缺失报告由明确引用Reuters/FactSet等调查的 contemporaneous 报道补充。First Trust公开报告引用的市场一致预期保留来源与“调查统计量未说明”限制。不同调查不平均拼接，例如2026-10-02非农本批使用Econoday85,000，Reuters调查90,000不是同一口径。

事件正文和payload保存实际、预期、原始差值、分项、前值、修订和两类来源。所有分项是事件展示证据，不写成MacroObservation派生序列。没有补造consensusAsOf，使用historical-report证据分支，只展示原始差值，不宣称严格发布前PIT，也不伪造标准化评分。

89次数据发布使用精确时刻；Jackson Hole只确认日期，保留DATE。已有FOMC合并沿用旧事件身份和现有时间精度。

全部96条关联XAUUSD、GLD、GC=F、DX-Y.NYB、^TNX、TLT、IEF、SPY、QQQ、DIA、IWM。关联表示研究相关性，不给所有资产固定利好/利空方向。

## 文件与验证

- 事件包：`.data/ingest/US-macro-release-2026-01-01_2026-10-12.json`（Git忽略）。
- 逐次发布覆盖账本：`.data/ingest/US-macro-release-2026-coverage.json`。
- 香港包：`/opt/finance-site/.data/ingest/US-macro-release-2026-01-01_2026-10-12.json`。
- 4条旧FOMC备份：`/root/deploy-bak/us-macro-events-20261012-before.jsonl`。
- Skill新增模式及参考、JSON schema、证据消费端和详情分项展示已更新；业务代码尚未部署。在线已有事件列表/图表可读取新数据，专门研究视图的最新历史证据展示仍需正常代码发版。
- Skill frontmatter、引用文件与schema通过Node YAML/JSON检查；bundled Python quick_validate因缺PyYAML不能运行，未改用户Python环境。
- 本地与香港ingest校验通过；生产SQL核对89次数据发布/270分项；现有`/api/events/for-chart?symbol=XAUUSD`返回96条，其中89条macro.release。
- 17项相关单测、变更文件lint和生产build通过。

后续检索应先对账本批externalId，不重复生成。这次只导入事件数据，没有部署或修改香港业务源码、调度配置、数据库schema。
