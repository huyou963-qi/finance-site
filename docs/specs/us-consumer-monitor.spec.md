# 美国消费监测 Spec：首批22条

状态：`data-ready`。首批选型固定为22条；先查既有库，必要缺口沿用现有连接器入库，逐项验证持久化目录、发布包和订阅。

## 1. 范围

首批只实现名义PCE三大类结构与18条既有驱动指标的数据底座。22条固定清单、用途、来源、单位、频率、目录和发布包见[实施与验收](../US_CONSUMER_MONITOR.md)。不批量接入完整BEA表，不新建页面、模板或客户入口。

## 2. 复用门

2026-11-18直接查询生产Instrument、MacroObservation、DataSubscription、发布包和持久化MacroCatalogLayout：18条已存在，enabled=true且nextRunAt非空，保留原始ID、源、观测、订阅及发布包。四条名义月度PCE/PCEDG/PCEND/PCES不存在；另按名称查重，未发现对应旧指标。季度PCEC保留在原GDP域，不用于月度占比分母。

## 3. 缺口标准接入

仅新增PCE、PCEDG、PCEND、PCES：BEA/FRED、月度、十亿美元、SAAR、1959-01起。复用fredAdapter与统一writer；身份sched_fred_<ID>；us.bea.personal_income同源发布包，economic_calendar，revisionLookback=2400个月。不建新源、独立调度链路或派生指标。

## 4. 目录

新四条为美国 > 国民经济 > 消费与国内需求（月频）。既有18条逐项确认并定向修复落错主题的位置；FRED静态目录、taxonomy、持久化布局同时一致，末端最多48条。保留非本批指标及其他国家布局，不全量覆盖。

## 5. 后续边界

本批不是完整消费分类/实际增长贡献/收入恒等式/分布压力模型。后续每一批仍执行同一复用门；USED-INDICATORS中已有图表直接引用，不重复建立模板。名义占比/增长率等只在既有公式层计算；实际链价金额不可相加，GDP贡献不代替PCE贡献。

## 6. 验收

- [x] 生产库22条逐项查重，18条复用、4条必要缺口。
- [x] 四条FRED公开元数据核对，频率和单位无猜测。
- [x] 现有FRED源、发布包、统一seed/verify registry和静态目录接线。
- [x] 全历史回填与版本账本、FRED逐值比对、名义恒等式。
- [x] 22条实际持久化目录与运行订阅最终自检。
- [x] 没有新增页面、入口或上线模板。


生产库最终验收：[逐项22条结果](../research/US_CONSUMER_MONITOR_SELECTED_22.md)。新增静态目录条目的生产选择器展示须在代码部署后复核；不宣称完整消费分析体系已完成。
