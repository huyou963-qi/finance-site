# 中国国家统计局 PMI 接入 Spec

## 1. 范围

- 制造业 PMI headline + 13 个分类指数；
- 非制造业商务活动指数 headline + 9 个分类指数；
- 新版国家数据 UUID/JSON 全历史幂等入库，月报 Excel 覆盖最近 13 个月；
- 发布包日历驱动后续月度更新。

不包含财新 PMI，也不把建筑业/服务业行业拆分表当作非制造业 PMI 分类指数。

## 2. 指标代码

- 已有图表 headline：`chov_c05_mfg_pmi`、`chov_c06_nm_pmi`；
- 制造业分项：`nbs_cn_mfg_*`；
- 非制造业分项：`nbs_cn_non_mfg_*`；
- 完整列映射见 `src/lib/data/scheduler/nbsPmi/catalog.ts`。

## 3. 获取方案

kind: `web_scrape_new`（C3，官方 JSON 历史 + Excel 首发双通道）。

### 3.1 调研记录

- 官方目录：<https://www.stats.gov.cn/sj/zxfb/>
- 页面结构：目录中定位标题「中国采购经理指数运行情况」→ 正文「相关数据表」→ `P*.xls`。
- 2026-07 fixture：`.data/nbs-pmi-sample.xls`（仅本地留存，不提交）。
- Excel 结构：`制造业`、`非制造业` 两个 sheet；首个表首列为 Excel 日期，分别含 14、10 个指标列，连续 13 个月。
- 历史接口：`/dg/website/publicrelease/web/external/stream/esData`，按目录 CID + indicator UUID POST；制造业从 2005-01、非制造业从 2007-01 起。
- 日期规则：Excel serial 经 `XLSX.SSF.parse_date_code` 解析并归一至 UTC 月首。
- JSON 日期规则：`YYYYMMMM`（如 `202607MM`）归一至 UTC 月首。
- 数值规则：源值已经是百分比指数，原值入库，合法范围 `[0,100]`。
- 脆弱点：sheet 名、表头列名、连续月份、值域；任一异常必须 throw。
- legacy `data.stats.gov.cn/easyquery`：2026-08 返回 HTTP 403，不作为生产依赖；新版 `/dg/website/.../stream/esData` 实测 HTTP 200。
- robots：`www.stats.gov.cn/robots.txt` 与 `data.stats.gov.cn/robots.txt` 均返回 404，没有可执行的 Disallow 规则。
- 条款：国家统计局 Terms of Service 明确允许下载和使用统计数据；使用时注明国家统计局来源。
- 频率：生产 worker 由月度发布包触发；同轮 24 条订阅共享 60 秒缓存，不重复请求附件。

## 4. 历史与更新

- `npm run data:sync-nbs-pmi -- --fixture=.data/nbs-pmi-sample.xls`：离线 fixture；
- `npm run data:sync-nbs-pmi`：新版 JSON 回填完整历史，再用最新月报 Excel 覆盖最近 13 个月；
- headline 复用 China Overview 既有代码；制造业历史起于 2005-01，非制造业起于 2007-01，个别后增分项按官方实际起点保留；
- worker 对空序列自动走全历史接口，稳态增量只抓月报 Excel；同轮结果缓存避免 24 条订阅重复请求；
- 发布包 `cn.nbs.pmi` 以 `china manufacturing pmi` / `nbs manufacturing pmi` 匹配日历，排除财新、S&P Global、flash；
- 日历不可用时按 economic-calendar fallback 定期探测。

## 5. Metadata

- `source`: 国家统计局
- `fetchAcquisition.method`: `nbs_pmi_official_xls`
- `fetchAcquisition.methodLabel`: `scripts/data-worker/sync-nbs-pmi.ts`
- `scrape.provider`: `nbs_pmi`
- `bootstrapOnly`: `false`

## 6. 验证

- [x] fixture 输出 24 条序列，制造业 14 + 非制造业 10；
- [x] fixture 最新 headline 与一个分项人工核对一致；
- [x] 删除必需列后 parser 会 throw；
- [x] live 抓取成功，重复同步 `upserted=0`；
- [x] 每条分项至少 100 个观测且值域 `[0,100]`；
- [x] `data:sync-calendar` fallback 生效（本次 TE 日历返回 0 事件）；
- [x] `data:sync-one` 命中 `nbs_pmi` adapter。

## 7. 关键来源

- 国家统计局月度发布页及其“相关数据表”附件；
- [国家统计局 Terms of Service](https://www.stats.gov.cn/english/nbs/200701/t20070104_59236.html)；
- [国家统计局 PMI 指标说明](https://www.stats.gov.cn/zs/tjws/zytjzbqs/cgzlzs/)。
