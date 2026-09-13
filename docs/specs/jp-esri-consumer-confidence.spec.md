# 日本内阁府消费者信心指标接入 Spec

状态：`data-ready`

## 范围与复用

官方源为内阁府 ESRI Consumer Confidence Survey 的固定长期时序 XLSX `shouhi2.xlsx`。复用已有 `jpov_c15_consumer_conf_sa` 作为总指数编码并接管其订阅；新增生活状况、收入增长、就业环境、耐用品购买时机四条构成指数。前月差是水平值的派生计算，不重复入库；资产价值不是总指数构成项，本批不纳入。

## 口径

- 二人以上家庭；季节调整值；单位为指数；月频展示。
- 历史从 1982-06 开始，2004-03及以前原调查为季度；之后进入月度观测。
- 2013-04调查方式改为邮寄、2018-10改为邮寄与在线并用，官方注明存在断点，数据不做人为接续。
- 固定官方工作簿随每月发布整表更新，抓取器每次全历史重读并通过统一 vintage writer 留存实际抓取时点修订。

## 指标

| code | 指标 |
|---|---|
| `jpov_c15_consumer_conf_sa` | 消费者态度指数 |
| `esri_jp_consumer_conf_livelihood_sa` | 生活状况 |
| `esri_jp_consumer_conf_income_growth_sa` | 收入增长 |
| `esri_jp_consumer_conf_employment_sa` | 就业环境 |
| `esri_jp_consumer_conf_durable_goods_sa` | 耐用品购买时机 |

## 获取、合规与调度

- 发布页：<https://www.esri.cao.go.jp/en/stat/shouhi/shouhi-e.html>
- 文件：<https://www.esri.cao.go.jp/en/stat/shouhi/shouhi2.xlsx>
- 日程：<https://www.esri.cao.go.jp/en/stat/stat-schedule-e.html>
- 内阁府采用日本政府网站使用条款；只低频读取公开静态统计文件，保存SHA-256和最小来源元数据并注明来源。
- 首批使用24小时 `probe_interval`；官方月度日程页已确认，待统一日本官方日历 provider 完成后升级为发布事件驱动。
- 发布包：`jp.esri.consumer_confidence`；目录：`日本/国民经济/消费者信心（月频）`。

## 验证

- [x] 5条均从同一官方SA长期表读取，未存前月差。
- [x] fixture解析首期1982-06、最新2026-08，每条357点。
- [x] 缺少选定列时解析器报错。
- [ ] 本机 seed/sync/DB verify。
- [x] 统一worker分发、发布包和目录重建。
- [ ] 香港生产抽查。
