# 日本景气循环与劳动力核心指标

本批仅接入五个全国月度核心指标：内阁府 ESRI 的先行、一致、滞后 CI（2020=100），总务省统计局劳动调查的完全失业率（季调），以及厚生劳动省一般职业介绍状况的有效求人倍率（含兼职一般、季调）。不接入地区、性别、年龄、行业或职业维度。

| 代码 | 官方源 | 历史起点 | 更新方式 |
|---|---|---:|---|
| `esri_jp_ci_leading` / `coincident` / `lagging` | ESRI [景气动向指数](https://www.esri.cao.go.jp/en/stat/di/di-e.html) | 1985-01 | 每 24 小时探测固定官方工作簿，完整回读 |
| `jp_stat_lfs_unemployment_rate_sa` | 统计局 [劳动调查长期时序](https://www.stat.go.jp/data/roudou/2.html) / e-Stat | 1953-01 | 每 24 小时探测官方长期表，完整回读 |
| `jp_mhlw_active_job_openings_ratio_sa` | 厚劳省 [一般职业介绍状况](https://www.mhlw.go.jp/toukei/list/114-1.html) / e-Stat | 1963-01 | 每 24 小时探测官方长期表，完整回读 |

CI 的当前基期为 2020=100。完全失业率与求人倍率使用来源明确发布的季调值，不能由未季调数值自行计算。三个来源均可能回溯修订，因此同步总是回读全历史；入库版本账本只记录抓取时点可见值，不是历史首发值。

接线清单：将 `jp_cycle_labor` 加入 worker adapter dispatcher；在统一 seed registry 注册 `seed-jp-cycle-labor.ts`，在 `releasePackageCatalog.ts` 建 `jp.cycle_labor.monthly` 包并映射 ESRI 景气指数、劳动调查和一般职业介绍状况的官方发布日；在 `globalCatalogTaxonomy.ts` 放置 CI 于“国民经济／景气循环”，两项劳动力指标于“人口与就业／劳动力市场”；随后运行 seed、release-package seed、catalog layout、sync 和 `verify-jp-cycle-labor -- --db`。
