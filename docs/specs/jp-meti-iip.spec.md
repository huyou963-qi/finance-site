# 日本 METI 工业生产、出货与库存

## 1. 范围与复用

本批接入 2020 基期、矿工业总项、季节调整后的四条月度指数。复用统一 `DataSource`、`DataSubscription`、`runDataSubscription`、`upsertMacroObservations` 及 `MacroObservationVintage`，不新增事实表。现有 e-Stat API adapter 需要 Application ID；本批使用同机构公开的整份时序 Excel，封装一个共享文件 client 和纯 parser，不另做页面级抓取器。历史日本 Overview 导入不提供这一官方可持续更新链，不能用来源与基期不明的旧值拼接本批时序。

## 2. 指标与目录

全部归入 **日本 → 国民经济 → 工业生产、出货与库存**（四条，低于末组 48 条上限）。`catalogKey` 为 `mds:<instrumentCode>`，`countryCode=JP`，`catalogCategory=国民经济`，taxonomy 按 `meti_jp_iip_` 前缀归位。

| instrumentCode | 官方 sheet | 中文含义 | 单位 |
|---|---|---|---|
| meti_jp_iip_production_sa | 生産 | 工业生产指数（季调） | 指数（2020=100） |
| meti_jp_iip_shipments_sa | 出荷 | 工业出货指数（季调） | 同上 |
| meti_jp_iip_inventories_sa | 在庫 | 工业库存指数（季调） | 同上 |
| meti_jp_iip_inventory_ratio_sa | 在庫率 | 工业库存率指数（季调） | 同上 |

库存率也是指数，不能显示成百分比。所有值均为官方指数水平，不推算同比或环比。

## 3. 来源与结构

- [e-Stat 官方表](https://www.e-stat.go.jp/stat-search/files?layout=dataset&stat_infid=000040172363)，[官方 Excel](https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040172363&fileKind=0)。无需认证。
- 已存档 `.data/jp-meti-iip/list.html` 显示该表属于「2020年基準時系列データ（2018年１月～）」、标题「業種別／月次／季節調整済指数」，`data-release_count=59`、更新日 2026-08-31。这是重复发布的完整时序文件，并非固定在某一个月的公告。未来基期切换必须重新核对表号和定义；不得自动拼接新基期。
- 原始样本 `.data/jp-meti-iip/sa.xlsx`；提交的最小 fixture 位于 `src/lib/data/scheduler/jpMetiIip/fixtures/headlines.xlsx`，保留四个官方 headline 行与表头供离线回归。
- 第一行须同时包含 sheet 名、`季節調整済指数【月次】` 和 `2020＝100.0`。在 `品目番号/品目名称` 表头之后，唯一选取 `1000000000 + 鉱工業`，不能误取上一行的十位时序编码。
- 第四列起为 `YYYYMM` 或 `p YYYYMM`，`p` 表示初值；UTC 月首为观测期。2018-01 起逐月连续，拒绝未来月份、重复月份、缺失值、基期变化和四个分项尾期不一致。

### 3.1 许可与限频

2026-09-10 核对 [e-Stat 使用条款](https://www.e-stat.go.jp/terms-of-use)：允许复制、公开传输、翻译及商业使用，要求注明出处和加工。metadata 已标注 METI/e-Stat 来源及中文标签翻译。`.data/jp-meti-iip/estat-robots.html` 不禁止 `/stat-search/` 文件下载路径。METI 站直连样本未提供可解析统计内容，本接入只访问上述公开 e-Stat 分发文件，不绕过站点访问控制。

请求超时 30 秒，最小间隔 5 秒，同进程共享 pending 请求和 60 秒缓存。一个工作簿覆盖四条订阅，正常每 72 小时探测，失败交由公共 scheduler 退避。

## 4. 订阅与修订

`sourceId=jp-meti-iip`，`adapterKind=REST_API`，`scrape.provider=jp_meti_iip`，发布包 `jp.meti.iip`。订阅与包均为 `probe_interval:72h`；本批未接官方日历解析，不声称按精确首发时刻同步。metadata 三件套及 known 状态齐备。

每次读取 2018 年以来完整历史，忽略增量窗口，以覆盖季调历史修订。统一 writer 仅写新增或值发生变化的点；`runDataSubscription` 在全部 unchanged 时记 SKIPPED，因此保留全历史不会把空转误算为更新。原文件按 SHA-256 存 `.data/jp-meti-iip/snapshots/`，`latest.json` 记录 URL、抓取时点及 parserVersion。初值标记保留于原工作簿；当前事实表没有逐点初值状态列，不能假称该状态已结构化入库。

最新值与版本同事务写入；版本 `availableAt` 是实际抓取时间。此次回填不是历史 vintage 还原，不代表 2018 年当时可见的数值。

## 5. 运维命令

```powershell
npm run data:seed-jp-meti-iip
npm run data:seed-release-packages
npm run data:sync-jp-meti-iip
npm run data:verify-jp-meti-iip -- --db
npm run data:sync-one -- meti_jp_iip_production_sa
npm run data:sync-catalog-layout -- --keys=mds:meti_jp_iip_production_sa,mds:meti_jp_iip_shipments_sa,mds:meti_jp_iip_inventories_sa,mds:meti_jp_iip_inventory_ratio_sa --dry-run
```

目录 dry-run 后同命令去掉 `--dry-run` 写入持久化布局。`data:apply` 通过统一 seed/verify registry 纳入本批。恢复可用 `sync --fixture=<原文件路径>`，正常运行使用 live 文件。

## 6. 验证记录

2026-09-10 live sync：四条各 103 点，2018-01—2026-07，共 412 点与 412 个实际抓取时点版本。末月生产 104.7、出货 103.5、库存 98.1、库存率 104.7；均与原始文件一致。2026-07 在工作簿标记为 p 初值。

离线测试覆盖真实值、初值、锚点/基期/代码缺失、无效月份、未来日期、缺失值、重复日期、不同分项尾期不一致、历史修订完整保留。DB verify 检查 metadata、发布包链接、72 小时订阅、连续历史和 150 天新鲜度界限。构建与目录实际归位由主任务统一验证。

实际验收：5 项离线测试通过；4 条 DB verify 全通过；同一官方文件重跑四条均 `upserted=0, unchanged=103, vintagesCaptured=0`；经真实 dispatcher 的 `data:sync-one -- meti_jp_iip_production_sa` 返回 `status=skipped, sourceLagDays=0, rowsUpserted=0`。seed 重跑幂等且保留已有 nextRunAt。
