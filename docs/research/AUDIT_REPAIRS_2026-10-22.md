# 2026-10-22 有效性审计修复

本文件描述待审查代码，不表示已经部署或生产回填成功。

## 根因与修复

- Census 7370 西撒哈拉、7740 旧埃塞俄比亚：官方国家历史分别止于 2020-12、1993-06；将截止期纳入现有生命周期表。seed 停止调度，解析器拒绝截止期后的占位尾部；不会把其他合法零值国家误删。
- 4790 旧南斯拉夫、7320 旧苏丹：已有正确截止期。生产清理必须使用现有 `repair-census-placeholders.ts` 的 dry-run/digest 审核路径，保存备份在本机，禁止删除版本账本。此变更不自动删除任何生产行。
- WALCL/TREAST 两条 Overview：数值原本是百万美元，改单位标签而不是把数值再缩放。
- 日本 FS.AST.DOMS.GD.ZS：金融部门包含非银行机构，改银行部门名称，不换指标、不改值。
- UMCSENT：FRED 按授权延迟一个月。明确标记延迟镜像，保留合法订阅，不将源端授权延迟误当连接器故障。
- FRED：HTTP 200 非 JSON 原先在重试循环外抛错；现在在共享传输层验证克隆响应，按原有有限次数重试，保留原响应供调用方解析。4xx 不重试，取消信号立即终止，无显式信号的请求有 30 秒超时；错误不包含 URL、响应体或密钥。
- BTS 运输四项：FRED 镜像落后于原机构，不能靠重试迫使镜像发布。改走同一 BTS 官方结构化数据集的四个独立季调字段；保留既有 Instrument、图表 alias 和发布包，统一 writer 入库，72 小时探测，完整回读修订；seed 不重置现有 nextRunAt 或启用状态。

## 官方证据

- https://www.census.gov/foreign-trade/balance/c7370.html
- https://www.census.gov/foreign-trade/balance/c7740.html
- https://www.census.gov/foreign-trade/balance/c4790.html
- https://www.census.gov/foreign-trade/balance/c7320.html
- https://api.worldbank.org/v2/indicator/FS.AST.DOMS.GD.ZS?format=json
- https://fred.stlouisfed.org/series/WALCL
- https://fred.stlouisfed.org/series/TREAST
- https://fred.stlouisfed.org/series/UMCSENT （授权延迟说明）
- https://data.bts.gov/Research-and-Statistics/Transportation-Services-Index-and-Seasonally-Adjus/bw6n-ddqk

2026-10-22 原始 BTS API 核对：8 月 TSI 134.4、铁路车皮 990805、铁路联运箱量 1244306、卡车指数 112.8；7 月修订分别为 134.9、993056、1256914、113.2。字段分别为 tsi_freight、rail_frt_carloads_d11、rail_frt_intermodal_d11、truck_d11，日期字段 obs_date。

此前两条铁路“未确认”现已通过原始结构化来源确认存在落后及历史修订。ATA 9 月先行值不是 BTS 8 月数值，不能混入 BTS 序列；本次不引入 ATA 付费报告或绕过 AAR 防护。

实测：新连接器从本机获取 320 个月的 TSI，最新 2026-08=134.4；香港直接请求同一官方 API 返回 HTTP 200。不需要通过群晖隧道。

## 上线与复核边界

先 PR/CI，部署仍使用现有保护 worker 的发布流程。执行 audited-definitions、cass-freight-index 和 Census seed 时保留系统模板；确认包成员链接。生产重跑使用现有 worker lock 和 preserveNextRunAt，核对四个字段最新期与修订值；失败必须保留 FAILED，不得将一次尝试当恢复。清理 Census 仅删除人工审核后的零占位尾部，遇非零立即停止。
