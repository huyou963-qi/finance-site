# 个股管理层指引

## 状态与入口

管理层指引沿用个股研究页的 `markets` 权限，接口执行相同检查。概览展示最近一次披露中可确认的指引（优先营收、毛利率、EPS，最多三个不同指标）。报表展示完整指引、期间筛选、原文、历次版本及兑现对照。桌面与手机使用同一组件。

## 数据流与存储

- 沿用每日财报公告摄入，不在用户访问时请求外部站点或写库。
- `SecFiling.earningsRelease.managementGuidance` 保存 `{parserVersion, records}`，与该 accession 的原文附件共同保存；不同公告各有一份记录，后续更新不覆盖旧公告。
- 现有 JSONB 已能容纳按公告归档的结构化指引，因此本期不增加 Prisma 表或 migration。以后需要全市场筛选时再增加索引投影，不必改变事实来源。
- 旧公告读取时由同一纯函数从附件重新投影，避免旧 parser 版本长期滞留；可用下述脚本物化。解析版本、语法与计算在 `src/lib/equity/managementGuidance.ts`。
- 原附件纯文本上限从 20,000 提高为 160,000 字符，避免后部 Outlook 丢失；旧截断记录需显式重新抓取。保留最多五份附件和每公告最多 100 条指引。
- `/api/equity/stocks/[symbol]/guidance` 返回前校验功能权限，未开放返回 404，权益受限返回 403；响应 private/no-store，详细错误仅写服务端日志。

## 解析和比较边界

支持营收、毛利率、稀释 EPS、营业费用/利润、资本开支、经营/自由现金流和净杠杆；支持点值、区间、约数、单侧上下限、金额相对浮动和毛利率基点浮动。明确的 GAAP/non-GAAP 配对分别解析。

财季和全年分开；FY 财年标签不转换为自然年日期。仅原文明确披露截止日才保存日期。目标财期、单位、币种、口径无法确认或多指标混合句无法可靠分解时，保留原文并显示待确认；不靠猜测填数。安全港、调节表及历史报表区域不继承 Outlook 上下文。

同指标、同财期/截止日、同口径的公告组成版本链；只比较前一不同披露日的版本。单侧上下限不计算中值。撤回会停止对应指标的数值展示；同公告冲突数值显示待确认。资本开支增加只描述变化，不判定利好。

同一公告里的正文、CFO 附件及重复表格只计一个历史版本；正文区间与表格中值一致时保留完整区间，真实矛盾则标为待确认，不将重复呈现误算为多次调整。

EPS 按当次披露的每股口径列示，未核实拆股基准时不自动计算上调/下调；公司自定义指标在定义尚未核对时同样只列原始版本，不自动计算可比增幅。

兑现使用目标期结束前最后一个版本，撤回或无法确认的更新阻止沿用旧数值。第一期仅对照已明确截止日的季度 GAAP 营收、毛利率和经营现金流，采用库内最早可核验财报版本（不承诺为公司首发新闻稿）。不将最新重述值冒充首发值，不将基本 EPS 当稀释 EPS。全年及公司定义的自由现金流、杠杆、调整后 EPS 暂仅展示原文，不自动评分。需补充精确口径和完整实际值后再扩展。

公告覆盖只包含已收录附件；当前每日流程主要采集 8-K Item 2.02 财报公告。电话会口头指引、IR 网站独立指引、未采集的 6-K/其他 8-K 不保证覆盖。空结果表述为“当前收录公告中未识别”，不表述为“公司未提供”。

## 历史回填与核查

先只读检查（无需外部请求）：

```powershell
npm run equity:backfill-guidance -- --symbols=NVDA,AAPL,MSFT --limit=30
```

对已有附件落结构化记录：

```powershell
npm run equity:backfill-guidance -- --symbols=NVDA,AAPL,MSFT --limit=30 --apply
```

补抓缺失或旧 20,000 字符截断的财报附件并保存：

```powershell
npm run equity:backfill-guidance -- --symbols=NVDA,AAPL,MSFT --limit=30 --fetch-missing --apply
```

指定股票时默认处理 20 份，可显式设置 `--limit`；`--all-covered` 则使用与每日财报任务相同的覆盖名单，**没有全局数量截断**，按 CIK 去重，多个股类共用一份公告。不提供有效名单或连接到空库时直接报错，不能输出“0 条成功”冒充完成。

全覆盖历史流程：

```powershell
npm run equity:backfill-guidance -- --all-covered --discover --fetch-missing --apply --concurrency=3 --through=2026-11-17 --report=.data/guidance-backfill/history.jsonl
npm run equity:verify-guidance -- --strict --through=2026-11-17 --discovery-report=.data/guidance-backfill/history.jsonl --report=.data/guidance-backfill/audit.json
```

`--discover` 读取 SEC submissions 的 recent 和所有相关历史分页，复用统一公告 writer，默认从各公司已有季度财报的最早截止日开始；该公司无季度记录则从 2005-01-01 开始。可用 `--from=YYYY-MM-DD` 显式覆盖。只接入明确标记 Item 2.02 的 8-K/8-K/A，不把一般公告或其他公司的公告当成业绩公告。

长批次应显式传入同一个 `--through`（例如本次为 `2026-11-17`），表示最后一个已结束的美东日期；索引、附件、检查点和独立核查均使用这个截止日，避免跨日后不断扩大的新公告使“历史完成”成为移动目标。`--through` 不接受未结束的美东日期。

`--report` 保存逐公司索引发现检查点和逐公告处理回执，旁边的 `.summary.json` 原子更新当前进度。使用同一报告路径重跑会跳过已经完整发现的索引分页；公告则以库内解析版本及来源状态为准跳过，不依靠日志盲目跳过。旧截断原文不判定为完整，失败和并发更新会保留为待重试，不改每日任务状态或原财报事实。

`--concurrency=1–3` 可并行等待不同公司响应，所有请求（含重试）仍共用 250ms 启动间隔，不提高每进程每秒最多 4 次的请求预算。显式设置 `--limit` 时强制单工，避免并行越过数量上限；日常网站任务默认仍为原串行模式。

历史采集从 SEC filing index 请求 EX-99 系列 HTML 或 TXT 附件。联合申报方目录中的链接必须指向同一 accession，并保留 SEC 索引给出的真实附件 URL。采集器记录 `no_eligible_attachment` 表示当前规则未找到适用的附件。仅补已有原文时无需外部请求。`--retry-unavailable --fetch-missing` 专项重试旧解析版本的无附件记录。指定股票时可搭配 `--accessions` 定点重跑库内公告。

解析器 v4 只将明确指向指标和财期的财务指引撤回写入版本链。例外或范围无法确定的语句仍保留在附件原文。多个指标分别报价的句子可拆分解析，明确标注年度和金额单位的指引表可按该单位换算。页面按当前解析器读取附件，库内抽取版本可按批次刷新。

独立核查按同一覆盖名单统计：应处理公告数、当前解析版本已处理数、截断/缺失数、可用数值与待确认原文数、缺 CIK 代码；提供 discovery 报告时还逐 CIK 核对历史起点是否已完整发现。无公告、无 CIK、无适用附件分别列明，不能混同“公司不提供指引”。

维护任务可用 `scripts/equity/run-guidance-backfill.py` 驱动已打包的 worker/verifier：一次性运行、最多三次恢复重试，后续尝试降为单工；只有严格核查证明每个有效 CIK 的历史发现完整且待处理数为零，才写 `.completion.json` 的 `status: complete`。403 会记录为访问阻塞，不更换身份或绕过；磁盘可用空间低于 3 GiB 时停止当前 worker 并记录 `blocked_disk`。该维护进程不注册 cron，不发布网页功能，完成后自行退出。保护条件与完成判据可用 `python scripts/equity/test-guidance-runner.py` 验证。

2026-11-18 启动回填时覆盖名单有 4,221 个代码、3,364 个有效 CIK。随后按官方资料核验了四个主档缺口：

- VMRK：Vivmark Residential，CIK 0000906107，[SEC 发行人主档](https://www.sec.gov/edgar/browse/index.html?cik=906107)。
- SKYD：Skydance Corporation，CIK 0002041610，[SEC 10-Q 封面](https://www.sec.gov/Archives/edgar/data/2041610/000204161026000067/R1.htm)。
- VYLR：Vylor Inc.，CIK 0002128626，[SEC 注册文件](https://www.sec.gov/Archives/edgar/data/2128626/000119312526458647/d182384ds3asr.htm)。只收本发行人披露，不把原母公司 Corteva 的指引套给分拆公司。
- 2602335D：CUSIP 436CVR021，在[基金官方持仓](https://www.ftportfolios.com/Retail/Etf/EtfHoldings.aspx?Print=Y&Ticker=MDEV)列为 TPG Inc. (CVR)，不属于普通股财报研究对象；保留原持仓/指数记录，在公司基本面覆盖名单中明确排除。

前三项保存在 `securityIdentitySupplements.ts`，与旧 SEC 宇宙快照合并，由现有 `equity:seed-us-universe` 幂等补主档；可以加 `--symbols=VMRK,SKYD,VYLR` 仅补三条，不复制旧代码的股价、市值或财报值。历史起点按同 CIK 的已有季度记录取最早值。名单随现有项目覆盖规则变化，最终统计以独立核查报告为准。

测试：`npx tsx --test src/lib/equity/managementGuidance.test.ts src/lib/access/featureCatalog.test.ts`；日批和附件回归同时覆盖 `dailyDisclosures.test.ts` 与 `basicEarningsBrief.test.ts`。
