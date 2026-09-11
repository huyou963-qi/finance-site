# 美国 PPI（最终需求）— 已批准的接入规格

状态：`data-ready`（2026-09-11，用户直接批准）。

## 1. 范围与口径

本域只接入 BLS Producer Price Index 的 **Final Demand** 体系，和 BLS 新闻稿 Table A 一致；不再使用商品 PPI `WPU00000000`。每个图示分项保存两条 FRED 原始指数：

- 季调（SA）指数用于计算环比；这是 BLS Table A 的月度变化口径。
- 非季调（NSA）指数用于计算同比；headline 与核心的同比直接对应 Table A 末两列，其余分项可按同月指数计算同比。

不把变化率预先落成另一份事实表：变化率是同一原始指数的确定性视图，避免与源端修订脱节。

## 2. 复用与新增

`PPIFIS`（最终需求季调）已经由美国 CPI catalog 的 FRED 订阅维护，复用，不重复创建。其余 19 条为新增 FRED 订阅。

| Table A 分项 | SA / 环比 FRED | NSA / 同比 FRED |
|---|---|---|
| 最终需求 | `PPIFIS`（复用） | `PPIFID` |
| 除食品、能源和贸易服务（核心） | `WPSFD49116` | `WPUFD49116` |
| 商品总项 | `PPIDGS` | `PPIFDG` |
| 食品 | `PPIDFS` | `PPIFDF` |
| 能源 | `PPIDES` | `PPIFDE` |
| 商品除食品和能源 | `WPSFD413` | `WPUFD413` |
| 服务总项 | `PPIDSS` | `PPIFDS` |
| 贸易服务 | `PPITSS` | `PPIDTS` |
| 运输和仓储服务 | `PPIAWS` | `PPITAW` |
| 其他服务（服务除贸易、运输和仓储） | `PPITWS` | `PPITTW` |

逐条经 FRED 元数据核验：均为 BLS `Producer Price Index` release、月频、单位为指数；SA/NSA 与上表一致。时间序列为最新修订值，BLS 会修订近期月份，worker 的 FRED 拉取覆盖修订窗口。

## 3. 目录、调度与时间

- 目录：美国 → 通胀与价格 → PCE与PPI；一个月频末端共 20 条，低于 48 条上限。
- 发布包：`us.bls.ppi`，将全部 20 条按同一 BLS PPI 月报同步。
- 更新：FRED API（BLS 官方数据的 FRED 镜像），经济日历触发；不会访问香港已被 Akamai 拒绝的 BLS Public Data API。
- 2026-09-11 已发布 8 月数据；下一次为 **2026-10-15 20:30 北京时间**（BLS 公布 09:30?）

> 注：BLS 官方日历为 2026-10-15 08:30 ET，即北京时间 20:30；发布包在此时间后 3 分钟开始拉取，并在未追上源端时每 2 小时探测。

## 4. Agent B 交付证据

- [x] 复用门：`PPIFIS` 已有 FRED 订阅；旧 `goldov_c15_ppi_yoy` 已从生产库删除。
- [x] 属性核实：20 条 FRED series metadata 已逐条查验频率、单位、季调状态与最新观测。
- [x] 新 seed / verify / registry / FRED 目录 / 发布包。
- [ ] 香港部署后运行 `data:seed -- --catalog=ppi`、`data:seed-release-packages`、`data:sync-catalog-layout`、全量 FRED 回填与 `data:verify -- --catalog=ppi -- --db`。
