# 美伊油价与柴油短缺监测：数据底座与模板

更新时间：2026-10-04。

## 结论

定时任务中的可持续、可授权基础指标已经接入宏观库。数据库只保存来源直接发布的价格、库存、流量、利用率和运输指数；裂解价差、4 周均值、同比、周变动、季节偏离等仍在模板层计算。AIS 暗船、实时海湾出口、STS 转运、LNG 船数与安全事件没有稳定的公开授权数值序列，继续留在新闻/事件监测，不写进宏观库。

生产库在接入前已有 WTI、Cass 货运与 BTS 铁路序列；Brent、纽约港 ULSD、全国零售 ULSD、BTS 货运/卡车指数和 EIA WPSR 五条基础序列是本批补齐项。本地开发库已完成 seed、完整历史回填、发布包链接和 DB verify；云端部署仍以 `npm run data:apply` 从 Git 重建为准。

## 指标清单

| 观察层 | catalog key | 来源 / 频率 / 单位 | 发布包与更新 | 目录 |
|---|---|---|---|---|
| WTI 现货 | `fred:DCOILWTICO` | EIA/FRED；日；美元/桶 | `us.eia.spot_prices`；6h probe | 通胀与价格 > 通胀预期与能源 |
| Brent 现货 | `fred:DCOILBRENTEU` | EIA/FRED；日；美元/桶 | `us.eia.spot_prices`；6h probe | 同上 |
| 纽约港 ULSD | `fred:DDFUELNYH` | EIA/FRED；日；美元/加仑 | `us.eia.spot_prices`；6h probe | 同上 |
| 纽约港常规汽油代理 | `fred:DGASNYH` | EIA/FRED；日；美元/加仑 | `us.eia.spot_prices`；6h probe | 同上 |
| 全美公路 ULSD 零售价 | `fred:GASDESLSW` | EIA/FRED；周；美元/加仑 | `us.eia.gasoline_diesel`；12h probe | 同上 |
| 馏分油总库存 | `mds:eia_wpsr_wdistus1` | EIA WPSR XLS；周；千桶 | `us.eia.weekly_petroleum_status`；12h probe、整表回读 | 同上 |
| 0–15 ppm ULSD 库存 | `mds:eia_wpsr_wd0st_nus_1` | EIA WPSR XLS；周；千桶 | 同上 | 同上 |
| 馏分油 Product Supplied | `mds:eia_wpsr_wdiupus2` | EIA WPSR XLS；周；千桶/日 | 同上 | 同上 |
| 炼厂产能利用率 | `mds:eia_wpsr_wpuleus3` | EIA WPSR XLS；周；% | 同上 | 同上 |
| SPR 库存 | `mds:eia_wpsr_wcsstus1` | EIA WPSR XLS；周；千桶 | 同上 | 同上 |
| BTS 货运 TSI | `fred:TSIFRGHT` | BTS/FRED；月；2000=100，季调 | `us.bts.rail_freight`；72h probe | 国民经济 > 物流与出行 |
| 卡车货运量 | `fred:TRUCKD11` | BTS/FRED；月；2015=100，季调 | `us.bts.rail_freight`；72h probe | 同上 |
| Cass Shipments / Expenditures | `fred:FRGSHPUSM649NCIS` / `fred:FRGEXPUSM649NCIS` | Cass/FRED；月 | `us.cass.freight_index`；72h probe | 同上 |
| BTS 铁路车皮 / 联运 | `fred:RAILFRTCARLOADSD11` / `fred:RAILFRTINTERMODALD11` | BTS/FRED；月，季调 | `us.bts.rail_freight`；72h probe | 同上 |

`DGASNYH` 是纽约港常规汽油的可持续公开代理，不冒充连续 NYH RBOB 现货。若以后展示 3-2-1 裂解价差，模板必须明确标注 proxy。

## 内置模板

系统模板“原油与柴油短缺监测”位于全球 > 专题，并使用六图布局；桌面端和手机端共用同一可发现入口与权限逻辑。

1. 原油价格：WTI 与 Brent。
2. 成品油裂解：`42 × DDFUELNYH − DCOILWTICO`，单位美元/桶，只在展示层计算。
3. 库存：馏分油总库存与 0–15 ppm ULSD 库存，千桶按 `0.001` 显示为百万桶。
4. 炼厂：产能利用率。
5. 需求 / 货运：馏分油 Product Supplied 周值与最近四个有效周点的移动均值，配 BTS TSI 与 Cass Shipments；千桶/日按 `0.001` 显示为百万桶/日。
6. 政策缓冲：SPR 库存，按百万桶显示。

模板不把单周库存下降直接解释为短缺。更强的短缺组合信号是：库存下降、裂解价差走阔、炼厂利用率或供给受限，并由需求/货运层确认；SPR 是原油端政策缓冲，不等于商业成品油库存。

## 更新与运维

```bash
npm run data:seed-eia-energy-prices
npm run data:verify-eia-energy-prices -- --db
npm run data:seed-cass-freight-index
npm run data:verify-cass-freight-index -- --db

npm run data:seed -- --catalog=eia-wpsr
npm run data:sync-eia-wpsr
npm run data:seed-release-packages
npm run data:verify -- --catalog=eia-wpsr
```

EIA WPSR 适配器校验 OLE/BIFF 文件头、`Contents` / `Data 1`、`Sourcekey`、周五日期、严格递增、合理值域和声明的最新日期。调度执行时每次完整回读对应工作簿并交给统一 upsert，从而捕捉历史修订。

网页、AIS 与运输协会来源的授权判断和不入库理由见 [US_IRAN_OIL_DIESEL_WEB_SOURCE_AUDIT.md](research/US_IRAN_OIL_DIESEL_WEB_SOURCE_AUDIT.md)。
