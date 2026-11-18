# 美国消费监测：首批22条指标与入库验收

状态：`data-ready`（生产数据与订阅验收通过；应用部署走GitHub Actions）。本轮只完成首批数据底座，不代表完整消费分类、归因模型或预测系统已经完成。未新增页面、客户入口或系统模板。

## 固定选型

先用月度名义PCE的总量、耐用品、非耐用品、服务回答大类结构问题；实际消费与价格、收入就业、资产负债与信用共18条直接复用既有域。本批22条之外的细分服务、零售分项、收入恒等式及分布数据进入后续分批选型，不自动展开完整BEA表。56条只是此前的盘点候选，不是选用指标数。

| 用途 | FRED ID | 生产库接入前 | 最终目录（美国以下） | 订阅更新 |
|---|---|---|---|---|
| 名义总消费 | PCE | 无 | 国民经济 > 消费与国内需求（月频） | FRED API；us.bea.personal_income |
| 名义耐用品 | PCEDG | 无 | 同上 | 同上 |
| 名义非耐用品 | PCEND | 无 | 同上 | 同上 |
| 名义服务 | PCES | 无 | 同上 | 同上 |
| 实际消费总量/耐用品/服务 | PCEC96、PCEDGC96、PCESC96 | 已有3条，复用 | 同上 | 原us.bea.personal_income |
| 实际可支配收入/储蓄率 | DSPIC96、PSAVERT | 已有2条，复用 | 同上 | 原us.bea.personal_income |
| 零售与餐饮总额/零售贸易（不含餐饮服务） | RSAFS、RSXFS | 已有2条，复用 | 同上 | 原us.bls.retail_sales，月度经济日历（历史包ID保留，来源为Census） |
| PCE总/核心价格指数 | PCEPI、PCEPILFE | 已有2条，复用 | 通胀与价格 > PCE与PPI（月频） | 原us.bea.pce，月度经济日历 |
| 非农/时薪/工时 | PAYEMS、CES0500000003、AWHNONAG | 已有3条，复用 | 劳动力市场 > 就业与工资（月频） | 原us.bls.employment_situation，月度经济日历 |
| 居民净财富 | TNWBSHNO | 已有，复用 | 金融条件与银行 > 居民资产负债与偿债（季频） | 原us.frb.z1_household，168小时probe |
| 偿债率 | TDSP | 已有，复用 | 同上 | 原us.frb.household_dsr，168小时probe |
| 消费信贷/循环信贷 | TOTALSL、REVOLSL | 已有2条，复用 | 金融条件与银行 > 居民消费信贷（月频） | 原us.frb.g19_consumer_credit，72小时probe |
| 银行口径信用卡拖欠/净核销率 | DRCCLACBS、CORCCACBS | 已有2条，复用 | 金融条件与银行 > 资产质量（季频） | 原us.frb.chargeoff_delinquency，168小时probe |

四条新序列均为BEA NIPA 2.8.5、月频、十亿美元、季调折年值（SAAR），从1959-01开始。已逐条核对FRED公开页面：[PCE](https://fred.stlouisfed.org/series/PCE)、[PCEDG](https://fred.stlouisfed.org/series/PCEDG)、[PCEND](https://fred.stlouisfed.org/series/PCEND)、[PCES](https://fred.stlouisfed.org/series/PCES)。不能用季度PCDG/PCND替代月度PCEDG/PCEND，也不能用季度PCEC直接除月度分项。

## 数据流与更新

复用sourceId=fred、fredAdapter、统一限频器、runDataSubscription、MacroObservation和版本账本。新身份使用sched_fred_<ID>与fred:<ID>，不建新数据源、表或适配器。

四条序列挂既有us.bea.personal_income发布包，继承包级经济日历与nextRunAt。已有日历同步任务每小时维护发布包，现有worker每5分钟处理到期订阅；新序列revisionLookback=2400个月，覆盖1959年以来全部历史，以捕获基准修订。手动完整回填也走统一writer及fetch_run日志，并保留包的未来排期，不改变18条已有订阅。

目录同时注册FRED_US_ITEMS和既有taxonomy，并以22条key为范围定向同步MacroCatalogLayout；保留其他国家、指标与管理员布局，使用updatedAt乐观锁防止覆盖并发编辑，叶组最多48条。生产修改前目录及订阅快照保存在.data/consumer-monitor/production-selected-before.json。现有通用sync-catalog-layout只补未分类指标，不能修复已错分的零售，因此本次使用调用相同目录构建器的定向校正脚本。

## 计算边界

名义占比和名义增长贡献仅在既有公式层计算；四条同月金额须满足PCE≈PCEDG+PCEND+PCES，允许官方一位小数舍入误差。实际链式金额不可直接相加；GDP增长贡献不是对PCE增长的贡献。当前缺少实际非耐用品和官方分项PCE贡献时，不冒充完整实际增长归因。不把占比、增速、信号或模型输出入库。

## 可重复命令

```powershell
npm run data:seed -- --catalog=consumer-structure
npm run data:sync-consumer-structure
npm run data:layout-consumer-structure             # 只预览
npm run data:layout-consumer-structure -- --apply  # 定向同步22条目录位置
npm run data:verify -- --catalog=consumer-structure --db
npm run data:verify-consumer-structure -- --db --live
```

verify同时检查22条原始身份、单位、频率、非空观测、唯一且正确的实际持久化目录、订阅启用、非空下次排期、成功记录及发布包成员；四条新序列另检查连续全历史、版本账本、FRED全历史逐值比对和名义恒等式。.data/consumer-monitor/selected-22-verified.json记录逐项验收时间、覆盖范围、目录和排期。

## 本次最终验收

生产库22条全部通过，四条新序列共3252条观测及3252条版本，历史覆盖1959-01—2026-09。FRED逐值核验通过，813个月名义恒等式最大误差0.1十亿美元。新四条下次排期2026-11-25 13:33 UTC（北京时间21:33）。逐项记录见[22条生产库验收](research/US_CONSUMER_MONITOR_SELECTED_22.md)。原18条的观测数、发布包和下次排期不变；非本批指标目录归属未变。代码部署后执行下列线上目录验收，部署状态以GitHub Actions与线上结果为准。

验证补充：原有verify-consumer-balance --db、verify-us-retail-sales --db均通过；相关11项单测、限定范围TypeScript检查及修改文件ESLint通过。生产服务器既有cron已核实：worker每5分钟，日历同步每小时；没有新建调度入口。RSXFS按FRED官方定义为零售贸易，非剔除汽车。
