# 中国金融监管总局银行业监管统计 Spec

状态：已接入（Agent C / C3，官网静态目录 JSON + 官方 Excel）  
机构：国家金融监督管理总局（NFRA）  
官方入口：<https://www.nfra.gov.cn/cn/view/pages/tongjishuju/tongjishuju.html>

## 结论与范围

金融监管总局持续公布银行业月度、季度统计。官网目前主要有五组银行表：

1. 银行业金融机构总资产、总负债（月度，境内口径）；
2. 银行业金融机构资产负债（季度，法人口径）；
3. 商业银行主要监管指标（季度）；
4. 商业银行主要监管指标分机构类（季度）；
5. 普惠型小微、普惠型涉农贷款（季度）。

本批接入 42 条全国汇总核心序列：月度银行业总资产、总负债及各自同比 4 条，以及季度商业银行主要监管指标 38 条。它覆盖规模、资产质量、流动性、盈利、资本和市场风险，是判断银行体系量、价、风险与缓冲垫的最小完备集合。

分机构资产负债、分机构监管、普惠金融以及季度法人口径资产负债保留为后续扩展，不能与本批月度“境内口径”混拼或替代。保险偿付能力和金融控股公司表不属于本银行业域。

## 指标组

| 组 | 数量 | 主要指标 |
|---|---:|---|
| 银行业规模 | 4 | 总资产、总负债及同比 |
| 商业银行资产质量 | 15 | 正常/关注/不良及三类不良贷款余额和占比、贷款损失准备、拨备覆盖率、贷款拨备率 |
| 商业银行流动性 | 5 | 流动性比例、人民币存贷比、超额备付金率、LCR、NSFR |
| 商业银行盈利 | 6 | 本年累计净利润、ROA、ROE、净息差、非息收入占比、成本收入比 |
| 商业银行资本 | 11 | 各层资本净额、三类风险加权资产、底线后 RWA、三档资本充足率、杠杆率 |
| 商业银行市场风险 | 1 | 累计外汇敞口头寸比例 |

金额按官方原始精度存为“亿元”；比例单元格由 Excel 小数乘 100 存为“%”。月度观测日为月初；季度观测日为季度首日。新闻稿只用于交叉校验，不作为事实源。

## 数据链与更新

- `StatisticalAgency`: `cn-nfra`
- `DataSource`: `nfra-banking-statistics`
- `Instrument`: `nfra_cn_*`
- `fetchAcquisition.method`: `nfra_official_excel`
- adapter：`fetchSubscriptionIncremental` → `nfraBankingAdapter` → 官网静态栏目 JSON → 详情 JSON → xls/xlsx → 通用 `upsertMacroObservations`
- 发布包：`cn.nfra.bank-assets-monthly`、`cn.nfra.bank-supervision-quarterly`
- 官方无固定预告日历，两包均使用 `probe_interval=24h`；工作簿和栏目请求有 60 秒模块缓存，单次网络请求超时 30 秒并限速。
- 当前年度附件在同一 `docId`/URL 上继续追加新月或新季度，因此每次探测按观测日期幂等 upsert，不能只按文档 ID 去重。
- 安全结构化回填起点：月表当前内置 2024 年起年度归档；季度主要监管表 2021 年起。更早材料存在旧格式或图片/PDF，未经独立校验不拼入当前序列。

## 目录树

国家“中国”下统一顶层 `金融条件与银行`：

- `银行业规模与结构（月频）`
- `商业银行资产质量（季频）`
- `商业银行流动性（季频）`
- `商业银行盈利能力（季频）`
- `商业银行资本与市场风险（季频）`

每个叶节点不超过 48 条。映射由 `globalCatalogTaxonomy.ts` 的 `nfra_cn_` 规则生成，不依赖管理端手工拖拽。

## 口径断点与约束

- 月度资产负债为境内口径；季度监管表为商业银行法人汇总口径。
- 2019 年起邮储纳入商业银行合计和大型商业银行；2020 年起金融资产投资公司、2023 年起理财公司纳入资产负债表相应汇总。
- 2024Q1 起《商业银行资本管理办法》施行，资本指标与此前不完全可比。
- LCR、NSFR仅覆盖资产规模 2000 亿元以上商业银行。
- 净利润是本年累计值，不得当作单季流量。
- Parser 只读声明的表头、季度/月度列和指标行；缺锚点、重复行、无有效期间或异常比例均失败，不扫描隐藏残留单元格。

## 运行与验证

```bash
npm run data:seed -- --catalog=nfra-banking
npm run data:sync-nfra-banking
npm run data:seed-release-packages
npm run data:sync-catalog-layout -- --keys=nfra_cn_banking_total_assets,nfra_cn_commercial_bank_npl_ratio
npm run data:verify -- --catalog=nfra-banking -- --db
```

底层复用：现有 Agency/DataSource/Instrument/DataSubscription、发布包调度、fetch run、vintage/观测 writer、目录 taxonomy；未新增事实表、平行 writer、复权或派生计算链。
