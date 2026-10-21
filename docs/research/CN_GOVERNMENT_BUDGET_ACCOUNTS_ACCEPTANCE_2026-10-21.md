# 中国财政第三、第四本账接入与更新机制验收

日期：2026-10-21（Asia/Shanghai）。范围：`D:\projects\finance-site` 当前环境配置的数据库；未部署、未登录生产服务器。本报告针对数据接入，不包含新增页面或模板。

## 数据结果

| 数据组 | 序列数 | 观测数 | 持续探测 |
|---|---:|---:|---:|
| 国资预算：全国 | 15 | 110 | 15 |
| 国资预算：中央 | 15 | 109 | 15 |
| 国资预算：地方 | 14 | 98 | 14 |
| 社保基金：全国 | 67 | 462 | 59 |
| 社保基金：中央 | 70 | 329 | 25 |
| 社保基金：地方 | 70 | 493 | 63 |
| 第三、第四本账合计 | **251** | **1,601** | **191** |
| 原两本账财政月报 | **88** | **10,268** | **88** |

年度决算可解析区间为2018—2025年，各分项起止不同；月报主序列区间2015-02—2026-08，年内累计口径。全部339条，共11,869个观测。60条最新表已不再单列的历史序列保留数据、暂停独立更新；不把源端缺值填成0。

第三、第四本账通过官方历史逐点比对，全国/中央/地方×8年共24组社保收支恒等式核对；2020年500亿元调入资金、统筹调剂及上下级补助分别接入，2025年中央社保与全国统筹结余分别处理，没有放宽数值误差掩盖口径差异。

## 原财政修复

- 修复2022留抵退税自然口径、旧年度科目和文案、预算完成率插入、绝对增减额、增长倍数、持平/微增/微降等解析。
- 分离当月与累计段落；全国一般公共预算收入2015年以来2—12月公布期无缺月，前两账总支出同月交集128期。1月合并披露不报假缺口。
- 全历史回填后，清理575个有原文证据的误值：561个当月误入累计，14个错子项误入总项。
- 清理前保存完整旧行、URL、原文标签/片段、金额。事务内按ID、日期和旧值比较删除；保留Instrument、订阅和版本账本。
- 执行审计：`.data/audits/mof-fiscal-period-repair-2026-10-21T11-59-47-688Z.json`，`applied=true`、`deleted=575`、`unresolved=0`。
- 再次只读预检：`.data/audits/mof-fiscal-period-repair-2026-10-21T12-04-55-283Z.json`，候选0、未决0、待覆盖修订0，证明重复执行不再删除或修订。

版本账本保留的是历史抓取记录，原先的误抓记录不代表有效的官方累计口径；本轮回填也不提供历史首发PIT。

## 更新链路实证

1. 原月报发布包从未匹配TE日历迁移为官方归档24h探测；订阅回读36个月修订窗口。年度决算每168h发现新年度并回读历史。
2. `data:worker -- --source=mof-fiscal --limit=1` 未加force，实际选取88条到期订阅，失败0；再次执行到期0。
3. 年度worker未加force，先处理181条、补充调整项后处理10条，均无失败；再次执行到期0。
4. 历史归档生命周期：将已有生育保险历史订阅临时入队，真实worker获取历史后自动暂停，第二次执行到期0；数据未改变。纯函数和runner回归测试另外覆盖新库“尚无历史→先启用引导→取得历史后归档”的分支。
5. 当前279条启用订阅均有lastSuccessAt、无lastError、nextRunAt在未来。无新值记SKIPPED，不伪造新增成功。
6. 同一批次源站HTTP或结构失败时共享拒绝结果，多个成员明确失败、独立退避；月报88成员只请求一次失败源，15分钟冷却后可恢复。年度模块也验证同源失败合并。
7. 自动/手动同步的probe成员保持独立排期，不再由首成员推进其他成员；包显示最早成员时间。经济日历与SAFE相关回归保持通过。

## 部署、目录与检查

- 统一seed/verify registry、发布包、provider dispatcher及taxonomy已登记；不改schema，无migration。
- 已提交到工作区的可用指标证据快照：`data/mof-budget-accounts-availability.json`。离线definitions-only实际运行成功，观测写入0，已有nextRunAt保留。
- 快速部署只落定义；新库历史停列项也会先由worker引导，再自动归档。完整维护模式执行原财政全历史同步及证据修复。
- 目录布局已dry-run并写入；15国全局检查未分配0、超48叶组0、非频率叶组0、频率错放0。新指标位于中国→财政与公共债务的业务子组。
- 最终全仓测试：1,141通过、0失败、1项Linux专属用例在Windows跳过；schema校验、lint与最终生产构建均通过，进程退出码0。

执行日志保存在 `.data/audits/cn-budget-verify-final-2026-10-21.log`、`cn-budget-build-final-2026-10-21.log`，逐指标机器清单为 `cn-budget-final-inventory-2026-10-21.json`。

## 环境限制

本机没有发现项目Windows计划任务；本次未安装新任务。仓库生产部署已配置每5分钟worker、每小时日历及独立cron检出同步，本轮只检查配置，没有登录生产验证实际cron。因而本次结论是**当前库数据及worker更新链路已验收**，不是“生产定时任务已上线并持续运行”。发布后仍需核查生产scheduler_invocation、fetch_run及cron日志。

## 逐指标清单

日期为观测所属期；年度用年首，月度用月首。订阅停用项显示“历史归档”，仍保留观测。下次探测列为UTC。

| code | 指标 | 观测数 | 首期 | 末期 | 订阅 | 下次探测（UTC） |
|---|---|---:|---|---|---|---|
| mof_cn_budget_central_capital_capital_injection | 中国：中央国资预算国有企业资本金注入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:43.481Z |
| mof_cn_budget_central_capital_carry_in | 中国：中央国资预算上年结转收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:41.399Z |
| mof_cn_budget_central_capital_carry_out | 中国：中央国资预算结转下年支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:45.565Z |
| mof_cn_budget_central_capital_dividend | 中国：中央国资预算股息红利收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:39.312Z |
| mof_cn_budget_central_capital_expenditure | 中国：中央国有资本经营支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:41.912Z |
| mof_cn_budget_central_capital_liquidation | 中国：中央国资预算清算收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:40.371Z |
| mof_cn_budget_central_capital_other | 中国：中央国资预算其他国有资本经营预算收入（年度决算） | 7 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:40.884Z |
| mof_cn_budget_central_capital_other_expenditure | 中国：中央国资预算其他国有资本经营预算支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:44.515Z |
| mof_cn_budget_central_capital_profit | 中国：中央国资预算利润收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:38.782Z |
| mof_cn_budget_central_capital_public_subsidy | 中国：中央国资预算国有企业公益性补贴（年度决算） | 1 | 2025-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:43.997Z |
| mof_cn_budget_central_capital_reform | 中国：中央国资预算解决历史遗留问题及改革成本支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:42.970Z |
| mof_cn_budget_central_capital_revenue | 中国：中央国有资本经营收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:38.251Z |
| mof_cn_budget_central_capital_social_supplement | 中国：中央国资预算国有资本经营预算补充社保基金支出（年度决算） | 5 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:42.445Z |
| mof_cn_budget_central_capital_transfer | 中国：中央国资预算产权转让收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:39.845Z |
| mof_cn_budget_central_capital_transfer_out | 中国：中央国资预算国有资本经营预算调出资金（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:45.035Z |
| mof_cn_budget_central_social_acc_balance | 中国：中央社会保险基金年末滚存结余（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:50.754Z |
| mof_cn_budget_central_social_balance | 中国：中央社会保险基金本年收支结余（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:49.195Z |
| mof_cn_budget_central_social_employee_medical_acc_balance | 中国：中央职工基本医疗保险基金年末滚存结余（年度决算） | 3 | 2019-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.539Z |
| mof_cn_budget_central_social_employee_medical_balance | 中国：中央职工基本医疗保险基金本年收支结余（年度决算） | 4 | 2018-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.425Z |
| mof_cn_budget_central_social_employee_medical_expenditure | 中国：中央职工基本医疗保险基金支出（年度决算） | 4 | 2018-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.221Z |
| mof_cn_budget_central_social_employee_medical_interest | 中国：中央职工基本医疗保险基金利息收入（年度决算） | 4 | 2018-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.823Z |
| mof_cn_budget_central_social_employee_medical_premium | 中国：中央职工基本医疗保险基金保险费（缴费）收入（年度决算） | 4 | 2018-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.644Z |
| mof_cn_budget_central_social_employee_medical_revenue | 中国：中央职工基本医疗保险基金收入（年度决算） | 4 | 2018-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.120Z |
| mof_cn_budget_central_social_employee_medical_subsidy | 中国：中央职工基本医疗保险基金财政补贴收入（年度决算） | 4 | 2018-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.744Z |
| mof_cn_budget_central_social_enterprise_pension_acc_balance | 中国：中央企业职工基本养老保险基金年末滚存结余（年度决算） | 6 | 2019-01-01 | 2024-01-01 | 历史归档 | 2026-10-21T08:49:55.496Z |
| mof_cn_budget_central_social_enterprise_pension_balance | 中国：中央企业职工基本养老保险基金本年收支结余（年度决算） | 7 | 2018-01-01 | 2024-01-01 | 历史归档 | 2026-10-21T08:49:55.354Z |
| mof_cn_budget_central_social_enterprise_pension_expenditure | 中国：中央企业职工基本养老保险基金支出（年度决算） | 7 | 2018-01-01 | 2024-01-01 | 历史归档 | 2026-10-21T08:49:55.181Z |
| mof_cn_budget_central_social_enterprise_pension_interest | 中国：中央企业职工基本养老保险基金利息收入（年度决算） | 7 | 2018-01-01 | 2024-01-01 | 历史归档 | 2026-10-21T08:49:55.782Z |
| mof_cn_budget_central_social_enterprise_pension_investment | 中国：中央企业职工基本养老保险基金委托投资收益（年度决算） | 5 | 2018-01-01 | 2022-01-01 | 历史归档 | 2026-10-21T08:49:55.899Z |
| mof_cn_budget_central_social_enterprise_pension_premium | 中国：中央企业职工基本养老保险基金保险费（缴费）收入（年度决算） | 7 | 2018-01-01 | 2024-01-01 | 历史归档 | 2026-10-21T08:49:55.598Z |
| mof_cn_budget_central_social_enterprise_pension_revenue | 中国：中央企业职工基本养老保险基金收入（年度决算） | 7 | 2018-01-01 | 2024-01-01 | 历史归档 | 2026-10-21T08:49:55.071Z |
| mof_cn_budget_central_social_enterprise_pension_subsidy | 中国：中央企业职工基本养老保险基金财政补贴收入（年度决算） | 4 | 2018-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.707Z |
| mof_cn_budget_central_social_expenditure | 中国：中央社会保险基金支出（小计，不含全国统筹调剂）（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:47.640Z |
| mof_cn_budget_central_social_expenditure_total | 中国：中央社会保险基金支出合计（含调剂及补助）（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:58:24.733Z |
| mof_cn_budget_central_social_injury_acc_balance | 中国：中央工伤保险基金年末滚存结余（年度决算） | 4 | 2019-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:51.804Z |
| mof_cn_budget_central_social_injury_balance | 中国：中央工伤保险基金本年收支结余（年度决算） | 5 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:50.239Z |
| mof_cn_budget_central_social_injury_expenditure | 中国：中央工伤保险基金支出（年度决算） | 5 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:48.682Z |
| mof_cn_budget_central_social_injury_interest | 中国：中央工伤保险基金利息收入（年度决算） | 4 | 2018-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.857Z |
| mof_cn_budget_central_social_injury_premium | 中国：中央工伤保险基金保险费（缴费）收入（年度决算） | 5 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:53.368Z |
| mof_cn_budget_central_social_injury_revenue | 中国：中央工伤保险基金收入（年度决算） | 5 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:47.124Z |
| mof_cn_budget_central_social_interest | 中国：中央社会保险基金利息收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:54.914Z |
| mof_cn_budget_central_social_investment | 中国：中央社会保险基金委托投资收益（年度决算） | 5 | 2018-01-01 | 2022-01-01 | 历史归档 | 2026-10-21T08:49:55.884Z |
| mof_cn_budget_central_social_lower_subsidy | 中国：中央社会保险基金补助下级支出（年度决算） | 2 | 2020-01-01 | 2022-01-01 | 历史归档 | 2026-10-21T08:57:20.283Z |
| mof_cn_budget_central_social_maternity_balance | 中国：中央生育保险基金本年收支结余（年度决算） | 1 | 2018-01-01 | 2018-01-01 | 历史归档 | 2026-10-21T08:53:46.237Z |
| mof_cn_budget_central_social_maternity_expenditure | 中国：中央生育保险基金支出（年度决算） | 1 | 2018-01-01 | 2018-01-01 | 历史归档 | 2026-10-21T08:53:46.151Z |
| mof_cn_budget_central_social_maternity_interest | 中国：中央生育保险基金利息收入（年度决算） | 1 | 2018-01-01 | 2018-01-01 | 历史归档 | 2026-10-21T08:53:46.530Z |
| mof_cn_budget_central_social_maternity_premium | 中国：中央生育保险基金保险费（缴费）收入（年度决算） | 1 | 2018-01-01 | 2018-01-01 | 历史归档 | 2026-10-21T08:53:46.401Z |
| mof_cn_budget_central_social_maternity_revenue | 中国：中央生育保险基金收入（年度决算） | 1 | 2018-01-01 | 2018-01-01 | 历史归档 | 2026-10-21T08:53:46.054Z |
| mof_cn_budget_central_social_pooling_balance | 中国：中央全国统筹调剂资金本年收支结余（年度决算） | 1 | 2025-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:58:26.836Z |
| mof_cn_budget_central_social_pooling_interest | 中国：中央全国统筹调剂资金利息收入（年度决算） | 1 | 2025-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:58:26.304Z |
| mof_cn_budget_central_social_pooling_paid | 中国：中央社保下拨地方统筹调剂资金（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:58:25.788Z |
| mof_cn_budget_central_social_pooling_received | 中国：中央社保地方上缴/上解统筹调剂资金（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:58:25.261Z |
| mof_cn_budget_central_social_premium | 中国：中央社会保险基金保险费（缴费）收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:52.320Z |
| mof_cn_budget_central_social_public_pension_acc_balance | 中国：中央机关事业单位基本养老保险基金年末滚存结余（年度决算） | 7 | 2019-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:51.287Z |
| mof_cn_budget_central_social_public_pension_balance | 中国：中央机关事业单位基本养老保险基金本年收支结余（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:49.711Z |
| mof_cn_budget_central_social_public_pension_expenditure | 中国：中央机关事业单位基本养老保险基金支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:48.156Z |
| mof_cn_budget_central_social_public_pension_interest | 中国：中央机关事业单位基本养老保险基金利息收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:55.443Z |
| mof_cn_budget_central_social_public_pension_premium | 中国：中央机关事业单位基本养老保险基金保险费（缴费）收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:52.838Z |
| mof_cn_budget_central_social_public_pension_revenue | 中国：中央机关事业单位基本养老保险基金收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:46.595Z |
| mof_cn_budget_central_social_public_pension_subsidy | 中国：中央机关事业单位基本养老保险基金财政补贴收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:54.398Z |
| mof_cn_budget_central_social_resident_medical_acc_balance | 中国：中央城乡居民基本医疗保险基金年末滚存结余（年度决算） | 2 | 2020-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.551Z |
| mof_cn_budget_central_social_resident_medical_balance | 中国：中央城乡居民基本医疗保险基金本年收支结余（年度决算） | 2 | 2020-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.444Z |
| mof_cn_budget_central_social_resident_medical_expenditure | 中国：中央城乡居民基本医疗保险基金支出（年度决算） | 2 | 2020-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.233Z |
| mof_cn_budget_central_social_resident_medical_interest | 中国：中央城乡居民基本医疗保险基金利息收入（年度决算） | 2 | 2020-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.835Z |
| mof_cn_budget_central_social_resident_medical_premium | 中国：中央城乡居民基本医疗保险基金保险费（缴费）收入（年度决算） | 2 | 2020-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.655Z |
| mof_cn_budget_central_social_resident_medical_revenue | 中国：中央城乡居民基本医疗保险基金收入（年度决算） | 2 | 2020-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.130Z |
| mof_cn_budget_central_social_resident_medical_subsidy | 中国：中央城乡居民基本医疗保险基金财政补贴收入（年度决算） | 2 | 2020-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.756Z |
| mof_cn_budget_central_social_resident_pension_acc_balance | 中国：中央城乡居民基本养老保险基金年末滚存结余（年度决算） | 3 | 2019-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.511Z |
| mof_cn_budget_central_social_resident_pension_balance | 中国：中央城乡居民基本养老保险基金本年收支结余（年度决算） | 4 | 2018-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.376Z |
| mof_cn_budget_central_social_resident_pension_expenditure | 中国：中央城乡居民基本养老保险基金支出（年度决算） | 4 | 2018-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.196Z |
| mof_cn_budget_central_social_resident_pension_interest | 中国：中央城乡居民基本养老保险基金利息收入（年度决算） | 4 | 2018-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.795Z |
| mof_cn_budget_central_social_resident_pension_investment | 中国：中央城乡居民基本养老保险基金委托投资收益（年度决算） | 2 | 2020-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.917Z |
| mof_cn_budget_central_social_resident_pension_premium | 中国：中央城乡居民基本养老保险基金保险费（缴费）收入（年度决算） | 4 | 2018-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.614Z |
| mof_cn_budget_central_social_resident_pension_revenue | 中国：中央城乡居民基本养老保险基金收入（年度决算） | 4 | 2018-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.092Z |
| mof_cn_budget_central_social_resident_pension_subsidy | 中国：中央城乡居民基本养老保险基金财政补贴收入（年度决算） | 4 | 2018-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.719Z |
| mof_cn_budget_central_social_revenue | 中国：中央社会保险基金收入（小计，不含全国统筹调剂）（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:46.081Z |
| mof_cn_budget_central_social_revenue_total | 中国：中央社会保险基金收入总计（含调剂及补助）（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:58:24.208Z |
| mof_cn_budget_central_social_subsidy | 中国：中央社会保险基金财政补贴收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:53.883Z |
| mof_cn_budget_central_social_transfer_in | 中国：中央社会保险基金调入资金（年度决算） | 1 | 2020-01-01 | 2020-01-01 | 历史归档 | 2026-10-21T08:57:20.275Z |
| mof_cn_budget_central_social_unemployment_acc_balance | 中国：中央失业保险基金年末滚存结余（年度决算） | 3 | 2019-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.575Z |
| mof_cn_budget_central_social_unemployment_balance | 中国：中央失业保险基金本年收支结余（年度决算） | 4 | 2018-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.469Z |
| mof_cn_budget_central_social_unemployment_expenditure | 中国：中央失业保险基金支出（年度决算） | 4 | 2018-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.274Z |
| mof_cn_budget_central_social_unemployment_interest | 中国：中央失业保险基金利息收入（年度决算） | 4 | 2018-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.870Z |
| mof_cn_budget_central_social_unemployment_premium | 中国：中央失业保险基金保险费（缴费）收入（年度决算） | 4 | 2018-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.683Z |
| mof_cn_budget_central_social_unemployment_revenue | 中国：中央失业保险基金收入（年度决算） | 4 | 2018-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:49:55.155Z |
| mof_cn_budget_local_capital_capital_injection | 中国：地方国资预算国有企业资本金注入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:00.641Z |
| mof_cn_budget_local_capital_carry_in | 中国：地方国资预算上年结转收入（年度决算） | 4 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:59.084Z |
| mof_cn_budget_local_capital_carry_out | 中国：地方国资预算结转下年支出（年度决算） | 5 | 2019-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:02.710Z |
| mof_cn_budget_local_capital_dividend | 中国：地方国资预算股息红利收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:57.021Z |
| mof_cn_budget_local_capital_expenditure | 中国：地方国有资本经营支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:59.601Z |
| mof_cn_budget_local_capital_liquidation | 中国：地方国资预算清算收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:58.054Z |
| mof_cn_budget_local_capital_other | 中国：地方国资预算其他国有资本经营预算收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:58.569Z |
| mof_cn_budget_local_capital_other_expenditure | 中国：地方国资预算其他国有资本经营预算支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:01.667Z |
| mof_cn_budget_local_capital_profit | 中国：地方国资预算利润收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:56.505Z |
| mof_cn_budget_local_capital_public_subsidy | 中国：地方国资预算国有企业公益性补贴（年度决算） | 1 | 2025-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:01.154Z |
| mof_cn_budget_local_capital_reform | 中国：地方国资预算解决历史遗留问题及改革成本支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:00.126Z |
| mof_cn_budget_local_capital_revenue | 中国：地方国有资本经营收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:55.976Z |
| mof_cn_budget_local_capital_transfer | 中国：地方国资预算产权转让收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:57.538Z |
| mof_cn_budget_local_capital_transfer_out | 中国：地方国资预算国有资本经营预算调出资金（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:02.183Z |
| mof_cn_budget_local_social_acc_balance | 中国：地方社会保险基金年末滚存结余（年度决算） | 7 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:15.684Z |
| mof_cn_budget_local_social_balance | 中国：地方社会保险基金本年收支结余（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:11.563Z |
| mof_cn_budget_local_social_employee_medical_acc_balance | 中国：地方职工基本医疗保险基金年末滚存结余（年度决算） | 7 | 2019-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:17.789Z |
| mof_cn_budget_local_social_employee_medical_balance | 中国：地方职工基本医疗保险基金本年收支结余（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:13.614Z |
| mof_cn_budget_local_social_employee_medical_expenditure | 中国：地方职工基本医疗保险基金支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:09.494Z |
| mof_cn_budget_local_social_employee_medical_interest | 中国：地方职工基本医疗保险基金利息收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:30.234Z |
| mof_cn_budget_local_social_employee_medical_premium | 中国：地方职工基本医疗保险基金保险费（缴费）收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:21.936Z |
| mof_cn_budget_local_social_employee_medical_revenue | 中国：地方职工基本医疗保险基金收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:05.341Z |
| mof_cn_budget_local_social_employee_medical_subsidy | 中国：地方职工基本医疗保险基金财政补贴收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:26.104Z |
| mof_cn_budget_local_social_enterprise_pension_acc_balance | 中国：地方企业职工基本养老保险基金年末滚存结余（年度决算） | 7 | 2019-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:16.197Z |
| mof_cn_budget_local_social_enterprise_pension_balance | 中国：地方企业职工基本养老保险基金本年收支结余（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:12.075Z |
| mof_cn_budget_local_social_enterprise_pension_expenditure | 中国：地方企业职工基本养老保险基金支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:07.939Z |
| mof_cn_budget_local_social_enterprise_pension_interest | 中国：地方企业职工基本养老保险基金利息收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:28.678Z |
| mof_cn_budget_local_social_enterprise_pension_investment | 中国：地方企业职工基本养老保险基金委托投资收益（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:32.853Z |
| mof_cn_budget_local_social_enterprise_pension_premium | 中国：地方企业职工基本养老保险基金保险费（缴费）收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:20.398Z |
| mof_cn_budget_local_social_enterprise_pension_revenue | 中国：地方企业职工基本养老保险基金收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:03.750Z |
| mof_cn_budget_local_social_enterprise_pension_subsidy | 中国：地方企业职工基本养老保险基金财政补贴收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:24.545Z |
| mof_cn_budget_local_social_expenditure | 中国：地方社会保险基金支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:07.420Z |
| mof_cn_budget_local_social_expenditure_total | 中国：地方社会保险基金支出合计（含调剂及补助）（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:58:27.874Z |
| mof_cn_budget_local_social_injury_acc_balance | 中国：地方工伤保险基金年末滚存结余（年度决算） | 7 | 2019-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:18.833Z |
| mof_cn_budget_local_social_injury_balance | 中国：地方工伤保险基金本年收支结余（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:14.640Z |
| mof_cn_budget_local_social_injury_expenditure | 中国：地方工伤保险基金支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:10.520Z |
| mof_cn_budget_local_social_injury_interest | 中国：地方工伤保险基金利息收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:31.283Z |
| mof_cn_budget_local_social_injury_premium | 中国：地方工伤保险基金保险费（缴费）收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:22.960Z |
| mof_cn_budget_local_social_injury_revenue | 中国：地方工伤保险基金收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:06.393Z |
| mof_cn_budget_local_social_injury_subsidy | 中国：地方工伤保险基金财政补贴收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:27.131Z |
| mof_cn_budget_local_social_interest | 中国：地方社会保险基金利息收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:28.162Z |
| mof_cn_budget_local_social_investment | 中国：地方社会保险基金委托投资收益（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:32.337Z |
| mof_cn_budget_local_social_maternity_balance | 中国：地方生育保险基金本年收支结余（年度决算） | 1 | 2018-01-01 | 2018-01-01 | 历史归档 | 2026-10-21T08:53:46.952Z |
| mof_cn_budget_local_social_maternity_expenditure | 中国：地方生育保险基金支出（年度决算） | 1 | 2018-01-01 | 2018-01-01 | 历史归档 | 2026-10-21T08:53:46.874Z |
| mof_cn_budget_local_social_maternity_interest | 中国：地方生育保险基金利息收入（年度决算） | 1 | 2018-01-01 | 2018-01-01 | 历史归档 | 2026-10-21T08:53:47.292Z |
| mof_cn_budget_local_social_maternity_premium | 中国：地方生育保险基金保险费（缴费）收入（年度决算） | 1 | 2018-01-01 | 2018-01-01 | 历史归档 | 2026-10-21T08:53:47.118Z |
| mof_cn_budget_local_social_maternity_revenue | 中国：地方生育保险基金收入（年度决算） | 1 | 2018-01-01 | 2018-01-01 | 历史归档 | 2026-10-21T08:53:46.782Z |
| mof_cn_budget_local_social_maternity_subsidy | 中国：地方生育保险基金财政补贴收入（年度决算） | 1 | 2018-01-01 | 2018-01-01 | 历史归档 | 2026-10-21T08:53:47.197Z |
| mof_cn_budget_local_social_pooling_paid | 中国：地方社保上缴/上解统筹调剂资金（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:58:28.923Z |
| mof_cn_budget_local_social_pooling_received | 中国：地方社保中央下拨统筹调剂资金（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:58:28.392Z |
| mof_cn_budget_local_social_premium | 中国：地方社会保险基金保险费（缴费）收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:19.872Z |
| mof_cn_budget_local_social_public_pension_acc_balance | 中国：地方机关事业单位基本养老保险基金年末滚存结余（年度决算） | 7 | 2019-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:17.260Z |
| mof_cn_budget_local_social_public_pension_balance | 中国：地方机关事业单位基本养老保险基金本年收支结余（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:13.103Z |
| mof_cn_budget_local_social_public_pension_expenditure | 中国：地方机关事业单位基本养老保险基金支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:08.982Z |
| mof_cn_budget_local_social_public_pension_interest | 中国：地方机关事业单位基本养老保险基金利息收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:29.708Z |
| mof_cn_budget_local_social_public_pension_premium | 中国：地方机关事业单位基本养老保险基金保险费（缴费）收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:21.421Z |
| mof_cn_budget_local_social_public_pension_revenue | 中国：地方机关事业单位基本养老保险基金收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:04.801Z |
| mof_cn_budget_local_social_public_pension_subsidy | 中国：地方机关事业单位基本养老保险基金财政补贴收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:25.590Z |
| mof_cn_budget_local_social_resident_medical_acc_balance | 中国：地方城乡居民基本医疗保险基金年末滚存结余（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:18.318Z |
| mof_cn_budget_local_social_resident_medical_balance | 中国：地方城乡居民基本医疗保险基金本年收支结余（年度决算） | 6 | 2020-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:14.128Z |
| mof_cn_budget_local_social_resident_medical_expenditure | 中国：地方城乡居民基本医疗保险基金支出（年度决算） | 6 | 2020-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:10.006Z |
| mof_cn_budget_local_social_resident_medical_interest | 中国：地方城乡居民基本医疗保险基金利息收入（年度决算） | 6 | 2020-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:30.767Z |
| mof_cn_budget_local_social_resident_medical_premium | 中国：地方城乡居民基本医疗保险基金保险费（缴费）收入（年度决算） | 6 | 2020-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:22.448Z |
| mof_cn_budget_local_social_resident_medical_revenue | 中国：地方城乡居民基本医疗保险基金收入（年度决算） | 6 | 2020-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:05.867Z |
| mof_cn_budget_local_social_resident_medical_subsidy | 中国：地方城乡居民基本医疗保险基金财政补贴收入（年度决算） | 6 | 2020-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:26.617Z |
| mof_cn_budget_local_social_resident_pension_acc_balance | 中国：地方城乡居民基本养老保险基金年末滚存结余（年度决算） | 7 | 2019-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:16.730Z |
| mof_cn_budget_local_social_resident_pension_balance | 中国：地方城乡居民基本养老保险基金本年收支结余（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:12.586Z |
| mof_cn_budget_local_social_resident_pension_expenditure | 中国：地方城乡居民基本养老保险基金支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:08.467Z |
| mof_cn_budget_local_social_resident_pension_interest | 中国：地方城乡居民基本养老保险基金利息收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:29.194Z |
| mof_cn_budget_local_social_resident_pension_investment | 中国：地方城乡居民基本养老保险基金委托投资收益（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:33.371Z |
| mof_cn_budget_local_social_resident_pension_premium | 中国：地方城乡居民基本养老保险基金保险费（缴费）收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:20.910Z |
| mof_cn_budget_local_social_resident_pension_revenue | 中国：地方城乡居民基本养老保险基金收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:04.264Z |
| mof_cn_budget_local_social_resident_pension_subsidy | 中国：地方城乡居民基本养老保险基金财政补贴收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:25.062Z |
| mof_cn_budget_local_social_revenue | 中国：地方社会保险基金收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:03.222Z |
| mof_cn_budget_local_social_revenue_total | 中国：地方社会保险基金收入总计（含调剂及补助）（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:58:27.355Z |
| mof_cn_budget_local_social_subsidy | 中国：地方社会保险基金财政补贴收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:24.019Z |
| mof_cn_budget_local_social_unemployment_acc_balance | 中国：地方失业保险基金年末滚存结余（年度决算） | 7 | 2019-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:19.359Z |
| mof_cn_budget_local_social_unemployment_balance | 中国：地方失业保险基金本年收支结余（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:15.158Z |
| mof_cn_budget_local_social_unemployment_expenditure | 中国：地方失业保险基金支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:11.049Z |
| mof_cn_budget_local_social_unemployment_interest | 中国：地方失业保险基金利息收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:31.818Z |
| mof_cn_budget_local_social_unemployment_premium | 中国：地方失业保险基金保险费（缴费）收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:23.488Z |
| mof_cn_budget_local_social_unemployment_revenue | 中国：地方失业保险基金收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:06.908Z |
| mof_cn_budget_local_social_unemployment_subsidy | 中国：地方失业保险基金财政补贴收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:56:27.646Z |
| mof_cn_budget_local_social_upper_subsidy | 中国：地方社会保险基金上级补助收入（年度决算） | 2 | 2020-01-01 | 2022-01-01 | 历史归档 | 2026-10-21T08:57:20.355Z |
| mof_cn_budget_national_capital_capital_injection | 中国：全国国资预算国有企业资本金注入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:05.131Z |
| mof_cn_budget_national_capital_carry_in | 中国：全国国资预算上年结转收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:03.038Z |
| mof_cn_budget_national_capital_carry_out | 中国：全国国资预算结转下年支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:07.190Z |
| mof_cn_budget_national_capital_dividend | 中国：全国国资预算股息红利收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:00.964Z |
| mof_cn_budget_national_capital_expenditure | 中国：全国国有资本经营支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:03.553Z |
| mof_cn_budget_national_capital_liquidation | 中国：全国国资预算清算收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:02.009Z |
| mof_cn_budget_national_capital_other | 中国：全国国资预算其他国有资本经营预算收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:02.523Z |
| mof_cn_budget_national_capital_other_expenditure | 中国：全国国资预算其他国有资本经营预算支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:06.159Z |
| mof_cn_budget_national_capital_profit | 中国：全国国资预算利润收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:00.450Z |
| mof_cn_budget_national_capital_public_subsidy | 中国：全国国资预算国有企业公益性补贴（年度决算） | 1 | 2025-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:05.647Z |
| mof_cn_budget_national_capital_reform | 中国：全国国资预算解决历史遗留问题及改革成本支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:04.599Z |
| mof_cn_budget_national_capital_revenue | 中国：全国国有资本经营收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:54:59.924Z |
| mof_cn_budget_national_capital_social_supplement | 中国：全国国资预算国有资本经营预算补充社保基金支出（年度决算） | 5 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:04.066Z |
| mof_cn_budget_national_capital_transfer | 中国：全国国资预算产权转让收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:01.494Z |
| mof_cn_budget_national_capital_transfer_out | 中国：全国国资预算国有资本经营预算调出资金（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:06.674Z |
| mof_cn_budget_national_social_acc_balance | 中国：全国社会保险基金年末滚存结余（年度决算） | 7 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:20.086Z |
| mof_cn_budget_national_social_balance | 中国：全国社会保险基金本年收支结余（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:15.950Z |
| mof_cn_budget_national_social_employee_medical_acc_balance | 中国：全国职工基本医疗保险基金年末滚存结余（年度决算） | 7 | 2019-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:22.169Z |
| mof_cn_budget_national_social_employee_medical_balance | 中国：全国职工基本医疗保险基金本年收支结余（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:18.018Z |
| mof_cn_budget_national_social_employee_medical_expenditure | 中国：全国职工基本医疗保险基金支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:13.879Z |
| mof_cn_budget_national_social_employee_medical_interest | 中国：全国职工基本医疗保险基金利息收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:34.585Z |
| mof_cn_budget_national_social_employee_medical_premium | 中国：全国职工基本医疗保险基金保险费（缴费）收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:26.287Z |
| mof_cn_budget_national_social_employee_medical_revenue | 中国：全国职工基本医疗保险基金收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:09.769Z |
| mof_cn_budget_national_social_employee_medical_subsidy | 中国：全国职工基本医疗保险基金财政补贴收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:30.450Z |
| mof_cn_budget_national_social_enterprise_pension_acc_balance | 中国：全国企业职工基本养老保险基金年末滚存结余（年度决算） | 7 | 2019-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:20.612Z |
| mof_cn_budget_national_social_enterprise_pension_balance | 中国：全国企业职工基本养老保险基金本年收支结余（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:16.465Z |
| mof_cn_budget_national_social_enterprise_pension_expenditure | 中国：全国企业职工基本养老保险基金支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:12.341Z |
| mof_cn_budget_national_social_enterprise_pension_interest | 中国：全国企业职工基本养老保险基金利息收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:33.044Z |
| mof_cn_budget_national_social_enterprise_pension_investment | 中国：全国企业职工基本养老保险基金委托投资收益（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:37.190Z |
| mof_cn_budget_national_social_enterprise_pension_premium | 中国：全国企业职工基本养老保险基金保险费（缴费）收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:24.745Z |
| mof_cn_budget_national_social_enterprise_pension_revenue | 中国：全国企业职工基本养老保险基金收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:08.229Z |
| mof_cn_budget_national_social_enterprise_pension_subsidy | 中国：全国企业职工基本养老保险基金财政补贴收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:28.885Z |
| mof_cn_budget_national_social_expenditure | 中国：全国社会保险基金支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:11.827Z |
| mof_cn_budget_national_social_injury_acc_balance | 中国：全国工伤保险基金年末滚存结余（年度决算） | 7 | 2019-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:23.195Z |
| mof_cn_budget_national_social_injury_balance | 中国：全国工伤保险基金本年收支结余（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:19.046Z |
| mof_cn_budget_national_social_injury_expenditure | 中国：全国工伤保险基金支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:14.922Z |
| mof_cn_budget_national_social_injury_interest | 中国：全国工伤保险基金利息收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:35.622Z |
| mof_cn_budget_national_social_injury_premium | 中国：全国工伤保险基金保险费（缴费）收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:27.330Z |
| mof_cn_budget_national_social_injury_revenue | 中国：全国工伤保险基金收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:10.798Z |
| mof_cn_budget_national_social_injury_subsidy | 中国：全国工伤保险基金财政补贴收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:31.493Z |
| mof_cn_budget_national_social_interest | 中国：全国社会保险基金利息收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:32.531Z |
| mof_cn_budget_national_social_investment | 中国：全国社会保险基金委托投资收益（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:36.677Z |
| mof_cn_budget_national_social_maternity_balance | 中国：全国生育保险基金本年收支结余（年度决算） | 1 | 2018-01-01 | 2018-01-01 | 历史归档 | 2026-10-21T08:53:45.492Z |
| mof_cn_budget_national_social_maternity_expenditure | 中国：全国生育保险基金支出（年度决算） | 1 | 2018-01-01 | 2018-01-01 | 历史归档 | 2026-10-21T08:53:45.412Z |
| mof_cn_budget_national_social_maternity_interest | 中国：全国生育保险基金利息收入（年度决算） | 1 | 2018-01-01 | 2018-01-01 | 历史归档 | 2026-10-21T08:53:45.798Z |
| mof_cn_budget_national_social_maternity_premium | 中国：全国生育保险基金保险费（缴费）收入（年度决算） | 1 | 2018-01-01 | 2018-01-01 | 历史归档 | 2026-10-21T08:53:45.649Z |
| mof_cn_budget_national_social_maternity_revenue | 中国：全国生育保险基金收入（年度决算） | 1 | 2018-01-01 | 2018-01-01 | 历史归档 | — |
| mof_cn_budget_national_social_maternity_subsidy | 中国：全国生育保险基金财政补贴收入（年度决算） | 1 | 2018-01-01 | 2018-01-01 | 历史归档 | 2026-10-21T08:53:45.725Z |
| mof_cn_budget_national_social_premium | 中国：全国社会保险基金保险费（缴费）收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:24.232Z |
| mof_cn_budget_national_social_public_pension_acc_balance | 中国：全国机关事业单位基本养老保险基金年末滚存结余（年度决算） | 7 | 2019-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:21.656Z |
| mof_cn_budget_national_social_public_pension_balance | 中国：全国机关事业单位基本养老保险基金本年收支结余（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:17.503Z |
| mof_cn_budget_national_social_public_pension_expenditure | 中国：全国机关事业单位基本养老保险基金支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:13.366Z |
| mof_cn_budget_national_social_public_pension_interest | 中国：全国机关事业单位基本养老保险基金利息收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:34.070Z |
| mof_cn_budget_national_social_public_pension_premium | 中国：全国机关事业单位基本养老保险基金保险费（缴费）收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:25.771Z |
| mof_cn_budget_national_social_public_pension_revenue | 中国：全国机关事业单位基本养老保险基金收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:09.255Z |
| mof_cn_budget_national_social_public_pension_subsidy | 中国：全国机关事业单位基本养老保险基金财政补贴收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:29.925Z |
| mof_cn_budget_national_social_resident_medical_acc_balance | 中国：全国城乡居民基本医疗保险基金年末滚存结余（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:22.680Z |
| mof_cn_budget_national_social_resident_medical_balance | 中国：全国城乡居民基本医疗保险基金本年收支结余（年度决算） | 6 | 2020-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:18.532Z |
| mof_cn_budget_national_social_resident_medical_expenditure | 中国：全国城乡居民基本医疗保险基金支出（年度决算） | 6 | 2020-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:14.408Z |
| mof_cn_budget_national_social_resident_medical_interest | 中国：全国城乡居民基本医疗保险基金利息收入（年度决算） | 6 | 2020-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:35.111Z |
| mof_cn_budget_national_social_resident_medical_premium | 中国：全国城乡居民基本医疗保险基金保险费（缴费）收入（年度决算） | 6 | 2020-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:26.804Z |
| mof_cn_budget_national_social_resident_medical_revenue | 中国：全国城乡居民基本医疗保险基金收入（年度决算） | 6 | 2020-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:10.286Z |
| mof_cn_budget_national_social_resident_medical_subsidy | 中国：全国城乡居民基本医疗保险基金财政补贴收入（年度决算） | 6 | 2020-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:30.966Z |
| mof_cn_budget_national_social_resident_pension_acc_balance | 中国：全国城乡居民基本养老保险基金年末滚存结余（年度决算） | 7 | 2019-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:21.128Z |
| mof_cn_budget_national_social_resident_pension_balance | 中国：全国城乡居民基本养老保险基金本年收支结余（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:16.978Z |
| mof_cn_budget_national_social_resident_pension_expenditure | 中国：全国城乡居民基本养老保险基金支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:12.854Z |
| mof_cn_budget_national_social_resident_pension_interest | 中国：全国城乡居民基本养老保险基金利息收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:33.556Z |
| mof_cn_budget_national_social_resident_pension_investment | 中国：全国城乡居民基本养老保险基金委托投资收益（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:37.721Z |
| mof_cn_budget_national_social_resident_pension_premium | 中国：全国城乡居民基本养老保险基金保险费（缴费）收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:25.257Z |
| mof_cn_budget_national_social_resident_pension_revenue | 中国：全国城乡居民基本养老保险基金收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:08.742Z |
| mof_cn_budget_national_social_resident_pension_subsidy | 中国：全国城乡居民基本养老保险基金财政补贴收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:29.411Z |
| mof_cn_budget_national_social_revenue | 中国：全国社会保险基金收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:07.707Z |
| mof_cn_budget_national_social_revenue_total | 中国：全国社会保险基金收入总计（含调剂及补助）（年度决算） | 2 | 2020-01-01 | 2021-01-01 | 历史归档 | 2026-10-21T08:57:20.228Z |
| mof_cn_budget_national_social_subsidy | 中国：全国社会保险基金财政补贴收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:28.359Z |
| mof_cn_budget_national_social_transfer_in | 中国：全国社会保险基金调入资金（年度决算） | 1 | 2020-01-01 | 2020-01-01 | 历史归档 | 2026-10-21T08:57:20.241Z |
| mof_cn_budget_national_social_unemployment_acc_balance | 中国：全国失业保险基金年末滚存结余（年度决算） | 7 | 2019-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:23.707Z |
| mof_cn_budget_national_social_unemployment_balance | 中国：全国失业保险基金本年收支结余（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:19.572Z |
| mof_cn_budget_national_social_unemployment_expenditure | 中国：全国失业保险基金支出（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:15.436Z |
| mof_cn_budget_national_social_unemployment_interest | 中国：全国失业保险基金利息收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:36.150Z |
| mof_cn_budget_national_social_unemployment_premium | 中国：全国失业保险基金保险费（缴费）收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:27.843Z |
| mof_cn_budget_national_social_unemployment_revenue | 中国：全国失业保险基金收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:11.312Z |
| mof_cn_budget_national_social_unemployment_subsidy | 中国：全国失业保险基金财政补贴收入（年度决算） | 8 | 2018-01-01 | 2025-01-01 | 启用 | 2026-10-28T08:55:32.019Z |
| mof_cn_fiscal_agriculture_amount | 中国：财政收支：农林水支出累计额 | 124 | 2015-05-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:36.835Z |
| mof_cn_fiscal_agriculture_yoy | 中国：财政收支：农林水支出累计同比 | 124 | 2015-05-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:36.565Z |
| mof_cn_fiscal_consumption_tax_amount | 中国：财政收支：国内消费税累计额 | 111 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:21.537Z |
| mof_cn_fiscal_consumption_tax_yoy | 中国：财政收支：国内消费税累计同比 | 111 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:38.508Z |
| mof_cn_fiscal_corporate_income_tax_amount | 中国：财政收支：企业所得税累计额 | 111 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:44.205Z |
| mof_cn_fiscal_corporate_income_tax_yoy | 中国：财政收支：企业所得税累计同比 | 111 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:23.409Z |
| mof_cn_fiscal_culture_amount | 中国：财政收支：文化旅游体育与传媒支出累计额 | 128 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:36.003Z |
| mof_cn_fiscal_culture_yoy | 中国：财政收支：文化旅游体育与传媒支出累计同比 | 128 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:28.593Z |
| mof_cn_fiscal_debt_interest_amount | 中国：财政收支：债务付息支出累计额 | 117 | 2016-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:40.142Z |
| mof_cn_fiscal_debt_interest_yoy | 中国：财政收支：债务付息支出累计同比 | 117 | 2016-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:37.674Z |
| mof_cn_fiscal_deed_tax_amount | 中国：财政收支：契税累计额 | 108 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:41.523Z |
| mof_cn_fiscal_deed_tax_yoy | 中国：财政收支：契税累计同比 | 108 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:31.057Z |
| mof_cn_fiscal_education_amount | 中国：财政收支：教育支出累计额 | 128 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:41.246Z |
| mof_cn_fiscal_education_yoy | 中国：财政收支：教育支出累计同比 | 128 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:35.722Z |
| mof_cn_fiscal_environment_amount | 中国：财政收支：节能环保支出累计额 | 110 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:35.165Z |
| mof_cn_fiscal_environment_yoy | 中国：财政收支：节能环保支出累计同比 | 110 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:39.065Z |
| mof_cn_fiscal_environmental_tax_amount | 中国：财政收支：环境保护税累计额 | 93 | 2018-04-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:22.613Z |
| mof_cn_fiscal_environmental_tax_yoy | 中国：财政收支：环境保护税累计同比 | 82 | 2019-04-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:30.507Z |
| mof_cn_fiscal_export_tax_refund_amount | 中国：财政收支：出口退税累计额 | 111 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:22.071Z |
| mof_cn_fiscal_export_tax_refund_yoy | 中国：财政收支：出口退税累计同比 | 109 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:34.363Z |
| mof_cn_fiscal_farmland_occupation_tax_amount | 中国：财政收支：耕地占用税累计额 | 108 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:31.895Z |
| mof_cn_fiscal_farmland_occupation_tax_yoy | 中国：财政收支：耕地占用税累计同比 | 108 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:28.313Z |
| mof_cn_fiscal_fund_expenditure_amount | 中国：财政收支：全国政府性基金预算支出累计额 | 128 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:43.941Z |
| mof_cn_fiscal_fund_expenditure_central_amount | 中国：财政收支：中央政府性基金预算本级支出累计额 | 119 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:34.630Z |
| mof_cn_fiscal_fund_expenditure_central_yoy | 中国：财政收支：中央政府性基金预算本级支出累计同比 | 119 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:26.133Z |
| mof_cn_fiscal_fund_expenditure_local_amount | 中国：财政收支：地方政府性基金预算支出累计额 | 128 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:33.003Z |
| mof_cn_fiscal_fund_expenditure_local_yoy | 中国：财政收支：地方政府性基金预算支出累计同比 | 128 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:37.113Z |
| mof_cn_fiscal_fund_expenditure_yoy | 中国：财政收支：全国政府性基金预算支出累计同比 | 128 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:39.331Z |
| mof_cn_fiscal_fund_revenue_amount | 中国：财政收支：全国政府性基金预算收入累计额 | 128 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:22.879Z |
| mof_cn_fiscal_fund_revenue_central_amount | 中国：财政收支：中央政府性基金预算收入累计额 | 125 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:25.845Z |
| mof_cn_fiscal_fund_revenue_central_yoy | 中国：财政收支：中央政府性基金预算收入累计同比 | 125 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:30.776Z |
| mof_cn_fiscal_fund_revenue_local_amount | 中国：财政收支：地方政府性基金预算本级收入累计额 | 128 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:24.765Z |
| mof_cn_fiscal_fund_revenue_local_yoy | 中国：财政收支：地方政府性基金预算本级收入累计同比 | 128 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:23.144Z |
| mof_cn_fiscal_fund_revenue_yoy | 中国：财政收支：全国政府性基金预算收入累计同比 | 128 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:25.566Z |
| mof_cn_fiscal_general_expenditure_amount | 中国：财政收支：全国一般公共预算支出累计额 | 128 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:40.422Z |
| mof_cn_fiscal_general_expenditure_central_amount | 中国：财政收支：中央一般公共预算本级支出累计额 | 126 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:39.863Z |
| mof_cn_fiscal_general_expenditure_central_yoy | 中国：财政收支：中央一般公共预算本级支出累计同比 | 126 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:24.491Z |
| mof_cn_fiscal_general_expenditure_local_amount | 中国：财政收支：地方一般公共预算支出累计额 | 124 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:37.949Z |
| mof_cn_fiscal_general_expenditure_local_yoy | 中国：财政收支：地方一般公共预算支出累计同比 | 124 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:39.597Z |
| mof_cn_fiscal_general_expenditure_yoy | 中国：财政收支：全国一般公共预算支出累计同比 | 128 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:36.284Z |
| mof_cn_fiscal_general_revenue_amount | 中国：财政收支：全国一般公共预算收入累计额 | 128 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:40.981Z |
| mof_cn_fiscal_general_revenue_central_amount | 中国：财政收支：中央一般公共预算收入累计额 | 128 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:27.219Z |
| mof_cn_fiscal_general_revenue_central_yoy | 中国：财政收支：中央一般公共预算收入累计同比 | 128 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:26.670Z |
| mof_cn_fiscal_general_revenue_local_amount | 中国：财政收支：地方一般公共预算本级收入累计额 | 117 | 2016-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:26.938Z |
| mof_cn_fiscal_general_revenue_local_yoy | 中国：财政收支：地方一般公共预算本级收入累计同比 | 117 | 2016-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:42.858Z |
| mof_cn_fiscal_general_revenue_yoy | 中国：财政收支：全国一般公共预算收入累计同比 | 128 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:42.316Z |
| mof_cn_fiscal_health_amount | 中国：财政收支：卫生健康支出累计额 | 128 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:41.786Z |
| mof_cn_fiscal_health_yoy | 中国：财政收支：卫生健康支出累计同比 | 128 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:29.942Z |
| mof_cn_fiscal_import_vat_consumption_amount | 中国：财政收支：进口货物增值税、消费税累计额 | 111 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:27.496Z |
| mof_cn_fiscal_import_vat_consumption_yoy | 中国：财政收支：进口货物增值税、消费税累计同比 | 111 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:33.833Z |
| mof_cn_fiscal_land_appreciation_tax_amount | 中国：财政收支：土地增值税累计额 | 108 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:24.215Z |
| mof_cn_fiscal_land_appreciation_tax_yoy | 中国：财政收支：土地增值税累计同比 | 108 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:34.099Z |
| mof_cn_fiscal_land_transfer_expenditure_amount | 中国：财政收支：国有土地使用权出让收入相关支出累计额 | 113 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:29.677Z |
| mof_cn_fiscal_land_transfer_expenditure_yoy | 中国：财政收支：国有土地使用权出让收入相关支出累计同比 | 113 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:43.407Z |
| mof_cn_fiscal_land_transfer_revenue_amount | 中国：财政收支：国有土地使用权出让收入累计额 | 113 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:45.012Z |
| mof_cn_fiscal_land_transfer_revenue_yoy | 中国：财政收支：国有土地使用权出让收入累计同比 | 113 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:27.766Z |
| mof_cn_fiscal_nontax_revenue_amount | 中国：财政收支：非税收入累计额 | 117 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:42.051Z |
| mof_cn_fiscal_nontax_revenue_yoy | 中国：财政收支：非税收入累计同比 | 117 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:33.286Z |
| mof_cn_fiscal_personal_income_tax_amount | 中国：财政收支：个人所得税累计额 | 111 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:28.860Z |
| mof_cn_fiscal_personal_income_tax_yoy | 中国：财政收支：个人所得税累计同比 | 111 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:21.227Z |
| mof_cn_fiscal_property_tax_amount | 中国：财政收支：房产税累计额 | 106 | 2016-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:32.725Z |
| mof_cn_fiscal_property_tax_yoy | 中国：财政收支：房产税累计同比 | 106 | 2016-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:23.949Z |
| mof_cn_fiscal_resource_tax_amount | 中国：财政收支：资源税累计额 | 106 | 2016-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:33.567Z |
| mof_cn_fiscal_resource_tax_yoy | 中国：财政收支：资源税累计同比 | 106 | 2016-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:38.785Z |
| mof_cn_fiscal_science_amount | 中国：财政收支：科学技术支出累计额 | 120 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:40.702Z |
| mof_cn_fiscal_science_yoy | 中国：财政收支：科学技术支出累计同比 | 120 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:44.746Z |
| mof_cn_fiscal_securities_stamp_tax_amount | 中国：财政收支：证券交易印花税累计额 | 108 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:35.443Z |
| mof_cn_fiscal_securities_stamp_tax_yoy | 中国：财政收支：证券交易印花税累计同比 | 108 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:44.472Z |
| mof_cn_fiscal_social_security_amount | 中国：财政收支：社会保障和就业支出累计额 | 128 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:30.225Z |
| mof_cn_fiscal_social_security_yoy | 中国：财政收支：社会保障和就业支出累计同比 | 128 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:32.161Z |
| mof_cn_fiscal_stamp_tax_amount | 中国：财政收支：印花税累计额 | 106 | 2016-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:43.675Z |
| mof_cn_fiscal_stamp_tax_yoy | 中国：财政收支：印花税累计同比 | 106 | 2016-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:29.126Z |
| mof_cn_fiscal_tariff_amount | 中国：财政收支：关税累计额 | 111 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:28.033Z |
| mof_cn_fiscal_tariff_yoy | 中国：财政收支：关税累计同比 | 111 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:21.803Z |
| mof_cn_fiscal_tax_revenue_amount | 中国：财政收支：税收收入累计额 | 124 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:32.442Z |
| mof_cn_fiscal_tax_revenue_yoy | 中国：财政收支：税收收入累计同比 | 124 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:38.228Z |
| mof_cn_fiscal_transport_amount | 中国：财政收支：交通运输支出累计额 | 114 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:26.404Z |
| mof_cn_fiscal_transport_yoy | 中国：财政收支：交通运输支出累计同比 | 114 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:25.297Z |
| mof_cn_fiscal_urban_community_amount | 中国：财政收支：城乡社区支出累计额 | 128 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:25.030Z |
| mof_cn_fiscal_urban_community_yoy | 中国：财政收支：城乡社区支出累计同比 | 128 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:43.140Z |
| mof_cn_fiscal_urban_land_use_tax_amount | 中国：财政收支：城镇土地使用税累计额 | 108 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:29.409Z |
| mof_cn_fiscal_urban_land_use_tax_yoy | 中国：财政收支：城镇土地使用税累计同比 | 108 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:34.894Z |
| mof_cn_fiscal_urban_maintenance_tax_amount | 中国：财政收支：城市维护建设税累计额 | 106 | 2016-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:22.335Z |
| mof_cn_fiscal_urban_maintenance_tax_yoy | 中国：财政收支：城市维护建设税累计同比 | 105 | 2016-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:31.615Z |
| mof_cn_fiscal_vat_amount | 中国：财政收支：国内增值税累计额 | 111 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:42.581Z |
| mof_cn_fiscal_vat_yoy | 中国：财政收支：国内增值税累计同比 | 111 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:37.392Z |
| mof_cn_fiscal_vehicle_purchase_tax_amount | 中国：财政收支：车辆购置税累计额 | 108 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:31.339Z |
| mof_cn_fiscal_vehicle_purchase_tax_yoy | 中国：财政收支：车辆购置税累计同比 | 108 | 2015-02-01 | 2026-08-01 | 启用 | 2026-10-22T08:52:23.683Z |
