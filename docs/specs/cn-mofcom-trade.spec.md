# 中国外贸与外部部门（商务部转载海关统计）

## 覆盖与目录

- 目录：`中国 → 外贸与外部部门`，所有指标的 `catalogKey` 为 `mds:mofcom_cn_trade_*`。
- 全国货物进出口、出口、进口和贸易差额：当月值、当月同比、累计值、累计同比。
- 贸易方式：一般贸易、加工贸易和接口公布的其他方式，分别保存进出口当月/累计金额及官方同比。
- 国别（地区）：接口公开的主要伙伴，保存进出口累计金额及官方累计同比。
- 商品构成：商务部公开的 SITC 分类，保存出口/进口当月和累计金额及累计同比。

## 获取方式与合规（2026-08-08 调研）

- 主来源：`https://data.mofcom.gov.cn/datamofcom/front/` 的公开 JSON：`totalmonth/query`、`totaltrademethod/query`、`totalbycountry/query`、`composition/query`。网页明确标注绝对数来自中国海关总署。
- 商务部转载的月度人民币总值表例见用户提供的 [2026 年 5 月表](https://fdi.mofcom.gov.cn/come-datatongji-con.html?id=16843)；同一发布包亦公开重点商品量值表，例如 [出口重点商品](https://fdi.mofcom.gov.cn/come-datatongji-con.html?id=16859) 和 [进口重点商品](https://fdi.mofcom.gov.cn/come-datatongji-con.html?id=16865)。
- `data.mofcom.gov.cn/robots.txt` 对通用爬虫为 `Disallow: /`；任务所有者已明确授权抓取公开政府统计数据。因此仅调用网页自身公开 JSON，不登录、不规避验证；历史扫描串行限速为每秒最多一请求，日常更新只读取最新发布月且进程内缓存 24 小时。`fdi.mofcom.gov.cn/robots.txt` 返回 404。
- 货物**量**的完整稳定历史表不在上述结构化接口中；官方重点商品量值转载页有公开量值表，但其发布列表接口当前返回 5xx，不能安全地把易变的文章 ID 扫描器当生产依赖。本接入不伪造数量序列；待该官方列表恢复或海关提供稳定目录后，以独立 `mofcom_trade_quantity` 子模块接入。

## 调度、回填和故障处理

- `data:seed-mofcom-trade`：回填总额 2000 年以来历史；按月（2016 年以来）回填贸易方式、主要国别地区和商品构成。全过程幂等。该命令会持续约 7 分钟，必须在服务器后台运行，不能放在部署 SSH 会话中。
- `data:seed-mofcom-trade -- --latest-only`：仅拉取最新发布月，用于 `data:apply` 的部署快速模式，负责落最新定义、订阅和观测；不会替代一次性的全历史回填。
- `data:sync-mofcom-trade`：同一历史扫描的可重复修订回填命令。
- 日常 `data:worker` 通过 `mofcom_trade` adapter 只请求当前月；`cn.mofcom.trade` 发布包经 `data:sync-calendar` 对齐发布时间，未匹配时月度探测规则兜底。
- JSON 锚点/行集合为空或字段不可解析会抛错，由 `fetch_run` 记录 FAILED、指数退避并进入既有滞后告警。

## 验证

```bash
npx tsx --test src/lib/data/scheduler/mofcomTrade/client.test.ts
npm run data:verify-mofcom-trade -- --db
```
