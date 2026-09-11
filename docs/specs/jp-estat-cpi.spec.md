# 日本 CPI：e-Stat 官方 2025 基期指数

状态：implementation-ready，2026-09-10 官方 API 核验完成；数据库验收由 verify 输出确定。

## 范围与复用

全国与东京区部，各接总项、除生鲜食品、除生鲜食品及能源、10 大类，共 26 条月度未季调指数。
既有 `jpov_c09_cpi_yoy` / `jpov_c10_cpi_mom` 是同比与环比，不与本批指数重复；本批不另建同比、环比或计算链。
复用 `estat-jp` DataSource、共享 eStat/client 与 eStatAdapter、runDataSubscription、统一宏观 writer、MacroObservation 及实际抓取版本账本。新增仅 catalog、编排脚本、目录与发布包配置，不新增表和 HTTP 客户端。

## 官方证据与选择条件

`getStatsList(statsCode=00200573)` 返回最新 2025 基期表 `0004052037`，更新 2026-08-28。
官方页面：https://www.e-stat.go.jp/dbview?sid=0004052037

`getMetaInfo` 仅四个维度：tab、cat01、area、time。固定 `cdTab=1`（指数），全国 `cdArea=00000`，东京区部 `cdArea=13100`。

| 指标 | cdCat01 |
|---|---|
| 总项 | 0001 |
| 除生鲜食品 | 0161 |
| 除生鲜食品及能源 | 0178 |
| 食品 | 0002 |
| 居住 | 0045 |
| 水电燃气 | 0054 |
| 家具及家务用品 | 0060 |
| 服装及鞋类 | 0082 |
| 医疗保健 | 0107 |
| 交通通信 | 0111 |
| 教育 | 0118 |
| 文化娱乐 | 0122 |
| 其他杂项 | 0145 |

月度时间类为 level 4，如 `2026000707`=2026-07；同表含年平均、财政年度及季度，必须按 frequency=M 排除，不能截前八位解析。
源指数 VALUE 和 tab 类均没有 @unit；展示单位「指数（2025=100）」明确来自官方表名，不能把它伪装成 API 的 unit 字段。
全国总项全历史 API 返回 791 行混频数据，抽样 1970-01=27、2026-07=102。历史直接来自此 2025 基期官方表，不使用旧基期表拼接或自行重定基。

## 目录、订阅与修订

code 为 `jp_estat_cpi_2025_{national|tokyo}_{item}`；位于日本统一物价主题下，分全国 CPI 与东京 CPI 两个末端组，各 13 条。
发布包 `jp.sbj.cpi` / `jp.sbj.tokyo_cpi` 对应各自发布时间，初始安全探测间隔为 72 小时，后续官方日历精确映射由共享调度处理；不能把东京速报当成全国数据。
共享 adapter 每次重读全历史以捕获官方修订；只追加真实抓取时点版本，不能声称历史首发 PIT。东京最新月可能是速报，下次更新修订同一时期。

## 验收

`npx tsx scripts/data-worker/seed-jp-estat-cpi.ts`

`npx tsx scripts/data-worker/sync-jp-estat-cpi.ts`

`npx tsx scripts/data-worker/verify-jp-estat-cpi.ts --db`

verify 检查全部固定分类码、单位/频率、订阅启用、包归属、观测数量、月度连续性、新鲜度与数值范围。
脱敏官方 fixtures 位于 `scripts/data-worker/fixtures/jp-estat-cpi/`。禁止保存带 Application ID 的原始参数或 URL。
