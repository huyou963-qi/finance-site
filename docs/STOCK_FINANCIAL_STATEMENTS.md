# 个股三张报表（标准化科目模板）

个股页「财务基本面 → 报表」展示利润表、资产负债表、现金流量表。2026-11 起由 15 个科目扩为 143 个标准化科目（利润表 51、资产负债表 71、现金流量表 21）的并集模板，覆盖一般企业、银行、保险、券商、REIT 五种报表格式。

## 数据底层（复用，不新增事实表）

- 来源：SEC companyfacts，与原快照同一次下载、同一套季度推导（`pickFlowQuarterSeries` 的累计差分与候选择优、`pickInstantSeries`），不增加请求。
- 模板：`src/lib/equity/statementTemplate.ts`（科目代码、中文名、所属报表与分组、计量方式，客户端可用）；取数标签：`src/lib/equity/statementLineTags.ts`（仅服务端）。
- 存储：`mds.equity_fundamental_snapshot.lines`（JSONB，`{科目代码: 数值}`，无数据不写键）。营收、净利润、EPS、资产总计等 13 个原有独立列保持不变（含逐公司口径修正），模板里标为 `headline`，页面直接读这些列。
- 写入：`upsertQuarterlyFundamentals` 经 `planQuarterlyWrite`。`lines` 总是来自同一次完整提取，普通写入整体替换该季科目（规则调整后不残留旧科目）；`--fill-missing` 只补库里没有的科目；调用方不提供 `lines` 时原样保留。
- 每日公告批次与 `equity:sync-fundamentals` 都走同一提取器，新财报入库时自动带上全部科目。

## 取数规则

- 并集模板：一般工商业、银行、保险、券商、REIT 的常见科目都在模板里；某公司在所选期间完全没有数据的科目整行隐藏，不按行业硬分模板。
- 只用含义唯一、可跨公司比较的 US-GAAP 标准标签；每个标签都在 SEC frames 接口核实过确有申报数据。发行人自定义标签（如 IBKR 的应付客户款）不猜。
- 加权平均股数只收直接披露的季度，不由「全年 − 九个月」差分；每股数值与加权股数随原 EPS 的拆股因子统一归一。
- 申报净利息收入的公司，`InterestExpense` 视为经营性利息支出，归入「利息支出（经营）」，与同额标签不重复列示；证券利息（`InvestmentIncomeInterest`）属经营性利息收入的组成，不再列为「利息收入（营业外）」。
- 行业科目（2026-11 第三步）：银行的存放同业、买入返售、贷款总额/净额、计息与无息存款、卖出回购、存款利息支出；券商的借入/借出证券、应收经纪商、卖出未购入证券、投行与自营收入；保险的净承保保费、应收保费与分保、递延保单获取成本及摊销、未决赔款准备、未到期保费、保户投资款、独立账户；REIT 的房地产原值与累计折旧、有担保/无担保债务、购置/开发/出售房地产现金流。均用 SEC frames 核实过申报量；银行贷款余额标签 frames 计数偏低，已在 USB、PNC、JPM、BAC 的 companyfacts 中核实。
- 投资损益放在「利润」组：一般企业的投资损益是营业外项目，不当作收入。
- 年度视图：发生额与每股数四季相加（缺任一季留空），期末余额取第四季末，加权股数取四季平均。
- 部分明细来自附注（如递延所得税资产），不一定与合计逐项相加；页面有提示。现金流出项以负数显示。

## 报表格式（行业模板）

`detectStatementProfile` 按公司最近 8 期自己披露的科目判定：保险（保费、未决赔款、递延保单获取成本、保户投资款）→ 银行（存款且有贷款/净利息收入/拨备）→ 券商（隔离客户资金、应收客户/经纪商、借入证券）→ REIT（投资性房地产）→ 一般企业。不用 SIC：行业代码常年不更新，库里也没有，按披露判定无需额外请求或存储。18 家抽样公司（含 JPM、USB、PNC、WFC、GS、SCHW、TRV、MET、IBKR、O、PLD）全部判定合理；GS、SCHW 为银行控股公司，归银行。

格式只影响利润表排序：本行业科目排在本组最前，其他行业科目排后（银行读作 利息收入 → 利息支出 → 净利息收入 → 拨备 → 非利息收入 → 营业收入）。资产负债表与现金流量表保持固定顺序。页面在报表切换旁显示「报表格式：银行」等标签。

## 页面

一次显示一张表（三个切换按钮带科目数），最新一期在最左，桌面与手机共用同一组件 `StockStatementsTable.tsx`。手机端隐藏科目数、收窄科目列，表格在框内横向滚动，页面无横向溢出。

## 覆盖范围：美股公众流通市值前 3000（第四步）

基本面覆盖 = 已有季度快照 ∪ 标普 500（带 GICS）∪ `index_constituent` 各指数最新成分。小盘部分不用罗素 2000 名单：FTSE Russell 成分数据需授权，ETF 持仓文件只是近似且条款未核实。改为自建名单 `US_TOP3000`：

- 指标：各公司 10-K 封面的公众流通市值 `dei:EntityPublicFloat`（SEC 事实，可追溯到申报，无需下载股价）。每年在公司第二财季末测一次，因此名单**每年 6 月重建一次**（与罗素年度重组同节奏）；一年内新上市、尚无 10-K 的公司在下次重建时进入。
- 资格：`equity_security` 中有 CIK 的交易所上市证券；排除 Nasdaq Trader 证券目录标记为 ETF 的代码；须为仍在申报的 US-GAAP 公司（15 个月内有 10-Q/10-K 事实，IFRS 外国申报人不在内）；18 个月内有 10-K 公众流通市值。
- 排名按 CIK（同一公司多股类合并），取前 3000，名单写入该公司全部上市股类。页面对外称「美股公众流通市值前 3000」，不称罗素指数。
- 只收普通股：证券须在 Nasdaq Trader 目录中，且名称为普通股、普通单位、ordinary shares 或 shares of beneficial interest；权证、单位、权利、优先股、存托凭证、票据不单独覆盖（2026-11 实测排除 1,469 个此类代码）。
- 公众流通市值量级纠错：申报值超过 6 万亿美元、超过总资产 200 倍、或同时超过总资产 20 倍且超过正权益 150 倍时视为申报人量级错误，依次除以 1,000、1,000,000 取第一个合理值并在报告中列出（2026-11 归档 20 家，如 Cabot 申报 4.4e15、Trustmark 9.6e11）。
- 构建：`npm run equity:build-fundamentals-universe -- --facts-zip=.data/sec-bulk/companyfacts.zip`（先出报告，`--apply` 才写库），规则与单测在 `fundamentalsUniverse.ts`。2026-11-09 结果：3,000 家公司 / 3,024 个代码，第 1,000 名约 39 亿美元、第 3,000 名约 6,800 万美元；与标普 500 合并后覆盖 3,229 个代码。
- 核查：`npm run equity:verify-fundamentals-coverage`（只读）报告每家公司季度深度、最新财季与滞后（最新财季距今超过 200 天），滞后或无数据占比超阈值时非零退出，可挂在日批之后告警。

## 历史回填

第 1～3 步的科目补全与第四步的历史补全是同一个动作（同一份 companyfacts、同一提取器与 writer），合并为一次离线回填：在开发机下载 SEC 全量归档（约 1.4 GB，每周更新；**不要在生产机下载或解压**），`sync-fundamentals` 加 `--facts-zip` 从归档读取，不访问 data.sec.gov、不加请求间隔：

```bash
curl -H "User-Agent: <name> <email>" -o .data/sec-bulk/companyfacts.zip https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip
npm run equity:sync-fundamentals -- --period-type=Q --quarters=70 --facts-zip=.data/sec-bulk/companyfacts.zip   --symbols-file=.data/sec-bulk/universe-<日期>.symbols.txt --resume-log=.data/sec-bulk/backfill.log
```

`--facts-zip` 只替换数据来源（`fetchSecCompanyFacts` 的 `load` 参数，前身合并逻辑共用），其余与联网路径完全一致。逐公司联网重跑也可以（每家一次请求）：

```bash
npm run equity:sync-fundamentals -- --period-type=Q --quarters=70 --symbols-file=<名单> --resume-log=<日志>
```

存储估算：每季约 1.4 KB，3,000 家 × 70 季约 0.3 GB。生产回填按既有预算分批（串行、低优先级，与日批 flock 互斥）。
