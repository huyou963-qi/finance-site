# Ownership & Supply Monitor — 完整实现

入口：`/equity/ownership?symbol=CRWV`，顶部「持股监控」。完整计算链已启用；证据不足时返回 null 和原因，不保证所有标的、所有字段都有值，也不把未知记为0。

## 单一事实源与本次新增语义

| 内容 | 唯一位置 | 血缘与重建 |
|---|---|---|
| SEC 请求、限速、重试、submissions 历史分页 | `equity/secEdgar.ts` | 从原有 SEC 调用收敛；财报、事件与ownership复用 |
| 申报索引 | 既有 `mds.sec_filing` / `writeSecFilingIndex` | issuer CIK + accession；不新建 filing 表 |
| Form 3/4/5 原始 XML、持仓观察、Table II证据、财报计划 | `SecFiling.ownershipData` | 原文URL、SHA-256、解析版本、解析时间；Form 4/A 原件与更正件都保留 |
| Table I 交易事实 | 既有 `mds.insider_transaction` / `ingestOwnershipDocument` | accession + lineIndex；`evidence` 保存证券、持有方式、所有共同申报人、逐行脚注与计划关联 |
| 人工裁定、起始持仓、流通股、角色和计划条款修订 | 新增 **`mds.ownership_review`** | 只追加 key+revision；这是来源不能唯一解析的语义证据，不复制原始交易。保存作者、来源、原文、可见日与录入时间 |
| 日线、20日ADV、拆股 | 既有 `equityPriceStore.ts` / `priceAdjustment.ts` | 只增加共享查询和`sharesAtDate`，无独立行情表、无重复复权算法 |
| FMP 流通股估计 | 既有 `fmpEquity.ts`扩展 / 同一证据writer | 使用floatShares，不使用freeFloat百分比或outstandingShares；首次抓到当天才变为可见 |
| 经济去重、持仓、供给与计划状态 | `ownershipEngine.ts` / `ownershipMonitor.ts` | 查询时由上述事实统一派生，不额外落汇总表 |
| 计划催化剂 | 既有`stockEvents.ts`及行情事件适配 | 复用同一计划事实/版本解析器；没有复制计划事件事实表 |

本项目是 PostgreSQL。没有采用之前讨论中的 MySQL 五表方案。

## 已实现功能

- Form 3/4/5、3/A/4/A/5/A及10-Q/10-K历史索引分页；按份事务提交、幂等重跑、XML缓存重解析、失败/截断覆盖标记。
- 共同申报人保留在一行证据里，不产生N倍交易。直接账户按CIK识别；间接持有仅在脚注明确指出单一直接持有实体时自动归一。DBA明确指同一实体时归一；无法证明的信托/关联链进入审核。
- 同值指纹是疑似重复线索。自动合并还要求同账户、同证券、同交易字段及脚注明确引用原accession；管理员可裁定merge/separate/replace/exclude，原行一直可审计。
- 4/A明确声明整份重述且可唯一定位原件时才整份替换；声明仅修正A/D码、其余不变时，唯一匹配后只替换方向错误的行；其他更正按行审核。不能凭“更晚的申报”覆盖全部历史。
- 每账户/每证券的持仓对账与曲线。优先使用核实的IPO/解禁/自选基准，其次首次披露持仓，再次明确标记的首笔交易前推算。没有基准时不声称是IPO以来的累计减持。
- 同日同份申报多个成交价共用期末余额时整组对账；断链显示散点并暂停比例，不能悄悄用插值补齐。
- 累计出售股数/基准股数、1−最近持仓/基准股数、留存率分开显示。授予、行权、代扣、赠予会改变持仓但不进入P/S出售分子。
- 90天净卖出/流通股、30天卖出/20日平均成交量。分子为已确认经济交易，覆盖或裁定不完整时只显示确认部分；流通股要求同证券、有日期、120日内有效。ADV要求覆盖、20根有效日线与不超过7日的新鲜度。
- ECD Inline XBRL计划采用/终止、数量及执行窗口；无标记文本保留候选。嵌套标签与日期时区均有回归测试。子维度数量只在同一人/同一明确计划、独立上下文、无父级总数时合并，父级与子级不双计。
- 计划上限、明确关联成交、剩余条件性上限、计划/对应账户持股。共享额度、未知生命周期、待裁定或无法归属成交时暂停剩余量；不预测实际成交日期。
- 管理员证据编辑、校验预览、追加版本、并发冲突检查，匿名/普通用户不能写。交易引用使用稳定`accession:lineIndex`，避免重建后UUID变化。
- 个股内部人面板复用确认交易结果；个股事件及行情事件显示计划披露和条件性窗口，披露日决定何时可见。

## 数据与时间边界

窗口包含首尾日期，交易日选窗、申报日控制可见性；覆盖表示已处理指定since之后索引中发现的申报，不保证SEC没有迟报或未报。同步中发生失败不宣称完整。

历史视图是“截至该日披露、使用当前核实结果重建”，**不是冻结审计版本的严格PIT回测**。审核同时保留availableAt与createdAt，可导出审计；不要将当前人工知识用于无前视回测。SEC更新通常有延迟，最新一天不是实时逐笔。

Form 4中P/S可能是市场或私下交易。checkbox是申报层面的10b5-1标记，不能给多行申报中的所有交易自动贴同一计划；只有行脚注明确关联才绑定计划。未标记为计划交易不等于已证明有主观卖出意图。

持仓按证券和实际账户分开。Table II的期权/可转换持仓保留在申报证据中，不与流通普通股混加，也不将同一行权的两条腿重复计入供给。创始人的Class A持仓比例不能冒称全部Class A+B持仓比例。持仓基准为0或断链时不展示百分比。

主页面最多读取50,000交易行、20,000文档、10,000证据版本；超限明确停用完整比例。SQL只取文档投影，避免把原始XML全部传进计算与浏览器。导出的报告和审核账本用途不同。

## 迁移、同步和部署

```bash
npm run db:migrate
npm run quant:sync-form4 -- --symbols=CRWV --since=2025-01-01
npm run equity:sync-prices -- --symbols=CRWV
npm run equity:verify-ownership -- --symbol=CRWV
```

本次migration：`20260905160000_ownership_supply_evidence`。其他环境必须先`npm run db:migrate`。Schema已变更时生产构建会更新Prisma客户端。

首次同步后每天运行同一命令；已有XML按解析版本跳过或本地重解析，历史发现保留分页完整性。`--max-filings=N`为调试上限，**会标记不完整**；`--plans-only`只处理计划财报，不覆盖已有Form4覆盖状态；`--force`从SEC重取。整批非零退出表示有失败。建议与其他SEC批量任务串行，进程内限速不代表多进程总限速。

现有日线同步单独运行，查询页面不触发SEC抓取。部署沿项目现有GitHub Actions流程；本次未修改生产部署或擅自启动服务器计划任务。日常调度可将上述命令接入既有运维计划；不要运行另一套抓取器。

FMP访问权限不足或接口失败时保留已核实分母。管理员可在“证据审核→流通股分母”录入带公开来源的数值；不能用总股本、无日期网页值或猜测值填充。

## 审核账本导出/重建

```bash
npm run equity:ownership-evidence -- --export=ownership-evidence.json --symbol=CRWV
npm run equity:ownership-evidence -- --import=ownership-evidence.json
npm run equity:ownership-evidence -- --import=ownership-evidence.json --apply --author=operator
```

导入默认仅校验；`--apply`幂等追加，冲突中止，不覆盖旧版本。先从SEC重建申报，再导入证据账本。证据键在同一语义事实的修订之间保持一致。

流通股示例格式（数字仅用于格式说明，不可作为真实数据导入）：

```json
{"symbol":"EXAMPLE","key":"float:source:date","expectedRevision":0,"payload":{"kind":"float","security":"common stock","date":"2026-08-01","shares":1000},"sourceUrl":"https://example.org/official-disclosure","quote":"Replace with the actual published share-float evidence.","availableAt":"2026-08-02"}
```

## 验证

核心测试覆盖联合申报、同值非重复、DBA归一、审计合并、部分/整份更正、未来信息隔离、缺失与过期分母、拆股、共同期末余额、对账断链、计划终止与重叠、Inline XBRL嵌套、日期时区及输入校验。全站门禁仍使用`npm run verify:quick`与`npm run build`。

官方来源：[SEC EDGAR开发说明](https://www.sec.gov/about/developer-resources)、[SEC 10b5-1披露规则说明](https://www.sec.gov/resources-small-businesses/small-business-compliance-guides/insider-trading-arrangements-and-related-disclosures)、[SEC ECD taxonomy](https://xbrl.sec.gov/ecd/2026/ecd-taxonomy-guide-2026-03-16.pdf)。
