# 美国贸易商品分项与伙伴国

本接入使用美国人口普查局 Census 的 FT-900 公开滚动历史 XLSX。商品细目与选定伙伴国为经季调序列；全伙伴国为未季调序列。均为**货物贸易 Census 口径月度名义金额**，不与既有 `BOPTEXP`/`BOPTIMP` 的 BOP 口径相加或直接对账。

| 维度 | 官方文件 | 字段 | 历史 | 目录位置 |
| --- | --- | --- | --- | --- |
| 出口最终用途细目 | [exports_enduse.xlsx](https://www.census.gov/foreign-trade/statistics/historical/exports_enduse.xlsx) | `DATE`、`ENDUSE`、`DESCRIPTION`、`VALUE` | 1994-01 起 | 美国 → 对外与汇率 → 贸易商品：出口·食品与饮料／工业原料·能源／工业原料·其他／资本品／汽车及零件／消费品／其他商品 |
| 进口最终用途细目 | [imports_enduse.xlsx](https://www.census.gov/foreign-trade/statistics/historical/imports_enduse.xlsx) | 同上 | 1994-01 起 | 美国 → 对外与汇率 → 对应的进口商品分组 |
| 选定伙伴国出口/进口 | [ctyseasonal.xlsx](https://www.census.gov/foreign-trade/statistics/country/ctyseasonal.xlsx) | `year`、`cty_code`、`cty_desc`、`EJAN`…`EDEC`、`IJAN`…`IDEC` | 2009-01 起 | 美国 → 对外与汇率 → 贸易伙伴：季调出口／进口 |
| 全伙伴国出口/进口 | [country.xlsx](https://www.census.gov/foreign-trade/balance/country.xlsx) | `year`、`CTY_CODE`、`CTYNAME`、`EJAN`…`EDEC`、`IJAN`…`IDEC` | 1985-01 起 | 美国 → 对外与汇率 → 贸易伙伴：未季调出口／进口，按官方国家代码所在大区分叶组 |

商品文件及选定伙伴国季调文件为美元原值，入库除以 1,000,000；全伙伴国未季调文件已是百万美元，直接入库。数据库单位统一为**百万美元**。伙伴国季调单元格的浮点尾数归一到 0.001 美元、未季调单元格归一到 1 美元精度，避免重复抓取产生虚假修订。只保存源直接公布的出口、进口金额，贸易差额与同比由图表计算。EU、CAFTA-DR、South/Central America、世界汇总与国际组织等区域或汇总项不作为国别序列入库。季调重点国与未季调全伙伴国保留为独立序列，不混接。

## 更新

- `data:seed-us-trade-detail` 幂等建立 Instrument、DataSubscription 与最新观测。`data:sync-us-trade-detail` 完整回读四份表并回填全部历史及修订。
- 新序列加入现有 `us.census.international_trade` 发布包，与 `BOPGSTB`、`BOPTEXP`、`BOPTIMP` 共用 FT-900 月度日历。执行 `data:seed-release-packages` 链接成员，`data:sync-calendar` 更新发布时刻，`data:worker` 按订阅运行。
- 每次 worker 抓取会完整回读滚动文件以捕获年度和历史修订；同一进程的一小时内共用下载和解析缓存，避免对每个分项重复请求 Census。源列变化、商品/国别缺失、叶组超过 48 条会使验证失败。
- hk 生产机访问四份 Census XLSX 实测均收到 Cloudflare 403。设置 `US_TRADE_DATA_DIR` 后，直连失败时从目录中同名的四份 Census 官方原始 XLSX 回退读取；文件不提交 Git。该回退不会自行刷新文件，需在每次 FT-900 发布后从可访问 Census 的环境下载并原子替换目录内文件，再执行 `data:sync-us-trade-detail`。未替换前生产数据停留在上次快照月份，不能视为已自动更新。
- `data:verify-us-trade-detail -- --db` 核对目录、发布包、订阅及最新观测与源表相同。部署时 `data:apply` 通过 registry 纳入新域。无新 migration，无新 API key。

来源说明：[Census 季调贸易历史表](https://www.census.gov/foreign-trade/statistics/historical/seas.html)、[Census 国别与商品数据](https://www.census.gov/foreign-trade/statistics/country/index.html)。
