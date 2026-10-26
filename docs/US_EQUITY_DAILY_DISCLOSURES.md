# 个股公告与财报每日批量更新

## 数据底层与范围

复用 `secEdgar.ts` 的 SEC transport、`writeSecFilingIndex` 的公告唯一写入入口、
`SecFiling` 唯一公告表，以及既有季度 extractor / snapshot writer / vintage writer。
不新增同义公告表或财务表。新增 SecFiling 字段只表达日批处理状态、重试时间和
从该公告提取的业绩附件证据；可从 SEC 日索引、submissions 和原文重建。

首版覆盖 equity_security 已登记 CIK 的公司，公告类型为 8-K、10-Q、10-K 及修订版。
外国发行人的 6-K/20-F、公司 IR 先于 SEC 的新闻稿、市场预期和 AI 摘要暂不纳入。
新闻稿仅展示原文摘录与附件，不将不确定的非 GAAP 数字写入标准三表。
首版只提取 EX-99 的 HTML 附件；PDF 等其他格式仍可通过公告原文的附件清单访问。

## 运行与调度

`npm run equity:sync-daily-disclosures` 每日一次，默认截至上一美东自然日，回看 7 天。
先下载日索引，再仅查询出现目标公告的 CIK 的 submissions。按 accession 去重；
已完成公告不再下载。待补齐/失败任务不限于回看窗口，持久化后持续按日重试。
完整财务数据仅在包含对应 accession 且 extractor 能产生对应版本时写入完成状态。
普通 8-K 仅入索引，不下载正文；每次最多深度处理 300 份财报/业绩公告，
单并发、任务间默认间隔 1 秒；超出部分持久排队，保留待处理。

参数：`--through=YYYY-MM-DD`、`--days=7`（最多 31）、`--symbols=AAPL,MSFT`、
`--max-filings=300`、`--delay-ms=1000`、`--dry-run`（仅计划，不访问外部源、不写库）。
失败和待补齐分别计数，失败以非零退出；日志记录缺失的日索引（节假日可能无文件），
后续回看会重试。停机超过窗口时，用 through/days 分段补跑，不将漏日视为完整覆盖。

cron 替换原周度任务，每日北京时间 19:15（美东 06:15/07:15）执行；沿用部署自动安装的 sector-history cron。
服务器 cron 必须支持 CRON_TZ；若不支持，按 docs/US_EQUITY_SECTOR_ANALYSIS.md 的
部署说明核对 cron 时区，改为服务器当地的固定时间（香港推荐每天 19:15，覆盖全年美东日终）。
数据库 advisory lock 防止手工和定时任务重叠；flock 防止同机 cron 重叠。
部署流程同样等待该 flock，避免日批运行中替换依赖；上线不在部署会话内发起外部抓取。

## 页面与验收

个股页顶部的最新公告卡片在桌面与手机显示相同入口、原文、附件摘录、入库时间和
完整三表状态，页面只读数据库，不轮询、不在此接口抓取 SEC。
财务数据到齐后，既有财务基本面 API 的季度、TTM、估值和行业聚合读取新快照。
新闻稿发布不等于完整三表已更新，HTTP 成功但无对应版本不能计为完成。

部署需要 `npm run db:migrate`。迁移只新增可空字段和处理索引，无历史财务重写。
首次上线回看窗口内已有公告同样纳入处理；历史公告无需全量重拉。
