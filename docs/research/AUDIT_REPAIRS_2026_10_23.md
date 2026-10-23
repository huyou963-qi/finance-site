# 2026-10-23 官方源审计问题修复

## 生产处理与根因

| 范围 | 原因 | 本轮生产处理 | 防复发代码 |
|---|---|---|---|
| MORTGAGE15US / MORTGAGE30US | 24h探测在10月22日09:55 UTC执行，早于PMMS每周四美东12:00发布，下一次空等24h；不是连接器报错 | 既有FRED连接器写入10月22日6.68/7.32；成员与包改6h | seed与发布包规则统一6h；保留假日/夏令时及镜像到达的不确定性，不承诺秒级 |
| STLFSI4 | 10月22日09:35 UTC检查在官方13:55 UTC更新前；旧元数据把周五观测周误写为固定下周二发布 | 写入10月16日-0.6328及13条历史修订；6h探测 | 更正说明，成员与包同为6h |
| 波兰NV.IND.TOTL.ZS | 名称漏含建筑业 | 名称与单位%更正，不缩放值 | 官方定义标签及离线审计seed |
| 南非GC.DOD.TOTL.GD.ZS | 中央政府误写泛政府 | 明确中央政府债务总额/%；不改变源ID和观测 | 同上 |
| RECPROUSM156N | 官方Percent误标分数 | 单位改%，0.62仍为0.62%，不乘100 | 原catalog与离线seed一致 |
| 房地产个人按揭/利用外资 | 原表续行不重复单位，解析器退为“原表单位” | 单位明确亿元；官方复核7678/4 | 只为已知资金续行继承亿元，不盲猜未知单位 |
| 办公楼同比 | 解析器虽已拆父项，旧生产名称/来源键未迁移 | 原ID保留，来源键及名称明确商品房待售面积：办公楼，9月-0.6 | 离线定义seed迁移，测试区分投资-21与待售-0.6 |
| Census7740 | 旧Ethiopia身份1993年6月结束，滚动表混有其后整年零占位，旧观测仍残留 | 进/出口各54条严格为0且晚于官方边界的快表行已在本机备份后清理；保留1993-06进口2.5/出口7.2及全部版本审计记录 | 官方截止过滤已有；补生命周期元数据，停订/nextRunAt=null，seed不复活 |
| Census7370 | 已结束的Western Sahara历史系列，被误当当期需要追更 | 独立官方XLSX确认2020-12进口0.010825；保持归档，不借后继身份延长 | 有明确边界，生命周期元数据 |
| Census5080/5160 | 当前Schedule C无此身份；旧零行不能证明精确停用月 | 进出口均停订，保留全部历史，明确exact_end_period_unconfirmed；不拼接5081/其他国家 | 独立于精确截止表的历史身份集合；API、worker、发布包入口统一拦截；parser不再生成无日期证据的零序列 |

## 官方证据

- PMMS每周四12:00 ET，假日可能提前周三：https://www.freddiemac.com/pmms
- STLFSI4实际更新与修订：https://fred.stlouisfed.org/series/STLFSI4
- WDI定义：https://data.worldbank.org/indicator/NV.IND.TOTL.ZS 与 https://data.worldbank.org/indicator/GC.DOD.TOTL.GD.ZS
- 衰退概率：https://fred.stlouisfed.org/series/RECPROUSM156N
- 国家统计局2026年9月房地产表：https://www.stats.gov.cn/sj/zxfb/202610/t20261019_1965615.html
- Census当前身份：https://www.census.gov/foreign-trade/schedules/c/countrycodes.html
- Census历史：https://www.census.gov/foreign-trade/balance/c7740.html / c7370.html
- 官方未季调工作簿：https://www.census.gov/foreign-trade/balance/country.xlsx

## 边界与验证

生产修复在worker与calendar双锁内完成；所有新增/修订数字由现有连接器/统一writer写入，没有将AI提取数值直接写库。元数据修复未缩放原观测，房地产重跑0新增0修改且保持成员/包原日历。Census清理只删已备份的108个明确ID的零快表行，非零保护与数量核对失败即停止；追加版本账本保留，准确反映过去曾捕获的错误记录，不将其称为官方有效历史。

5080、5160的历史金额与精确结束期仍未独立确认，不能宣称13条全部数值已确认有效。7370精确值已确认，审计账本采用附加勘误，不重复ACK或增加500/日覆盖计数。报告、证据、备份只在本机/对话，不上传香港。

本PR是防复发源码变更；生产数据/配置修复已完成，但这些源码变更在合并部署前尚未上线。下一次旧版部署可能重写定义/规则，需合并部署本PR完成持久化。
