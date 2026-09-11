# 日本内阁府 ESRI 季度 GDP：官方无密钥数据接入

## 1. 范围与复用检查

本批为日本官方源调研的 Agent C（C3）实施，41 条公开季度支出法序列；不依赖 ESTAT_APP_ID。不覆盖年度核算、生产法、收入法或部门账户，后续批次单独接入。

已搜索日本现有 jpov、FRED、e-Stat、provider catalog、seed registry 与发布包。已有 jpov_c02 名义 GDP 是未年率化季度值（2026Q1=169881.5、2025Q4=174196.2 十亿日元），与本批官方季调年率不是同口径，不替换、拼接或覆盖。既有底层没有 ESRI 多表历史修订解析器。

复用 Instrument、DataSource、DataSubscription、ReleasePackage、统一 dispatcher、runDataSubscription、upsertMacroObservations、MacroObservationVintage 及统一目录布局；不新增表、writer 或页面抓取链。新增能力仅为同一 ESRI 来源的 CSV 发现/解析模块，原始快照属于来源审计文件，不是平行事实库。

## 2. 口径与指标目录

全体 metadata.countryCode=JP，catalogKey/externalRefs.catalogKey=`mds:<instrumentCode>`，日期统一自然季度首日 UTC。代码前缀 `esri_jp_gdp_`。

| 源表 | 条数 | 口径与单位 | 日本目录节点 |
|---|---:|---|---|
| gaku-mk | 11 | 名义季调年率，十亿日元 | 国民经济 → GDP：支出法季调年率 |
| gaku-jk | 11 | 实际季调年率，2020 年链式价格，十亿日元 | 国民经济 → GDP：支出法季调年率 |
| def-qk | 8 | 季调平减指数，2020=100 | 通胀与价格 → GDP平减指数 |
| kiyo-jk | 11 | GDP 总项实际季调环比 %；分项为对实际 GDP 环比贡献，百分点 | 国民经济 → GDP：实际增长与贡献 |

11 个分项：GDP、私人最终消费、私人住宅投资、私人非住宅投资、私人库存变动、政府最终消费、公共固定资本形成、公共库存变动、净出口、出口、进口。平减指数不接库存变动与净出口三个没有官方有效值的分项。进口贡献直接使用官方已反向记号的值，不再次取负。实际链式量不可简单加总；不自行年率化、不推算同比、不把贡献百分点当增长率。

## 3.1 来源访问与抓取模板

来源入口：[国民经济计算（GDP统计）](https://www.esri.cao.go.jp/jp/sna/menu.html)。从 menu 最新季度发布链接发现 `qe<年份季度>_[12]/gdemenuja.html`，再发现当前目录 tables 下四个指定 CSV；只接受同源 https 链接、且每种表必须唯一。发布后文件名会改变，不固定某一期 URL。

2026-09-10 实测 `/robots.txt` 返回 HTTP 404，无可用 robots 规则；存档 `.data/jp-esri-gdp/robots.html` 是错误页，不应误报“已取得允许规则”。原日文条款路径此次也返回 404，改用 HTTP 200 的[内阁府英文使用条款](https://www.cao.go.jp/en/notice-e.html)：允许商业使用及数据复用，遵守来源标注，不冒充官方产品；未发现自动抓取禁令。此次仅访问公开统计 HTML/CSV，无登录、Cookie、付费或控制绕过。

请求带 30 秒超时；串行且间隔至少 5 秒。多指标共享 60 秒缓存及 pending promise，避免同一进程并发重复请求。一组冷缓存包含 menu、release、四 CSV，共六次请求。开发基于已存档 fixtures 离线，不循环访问来源试 parser。

CSV 是 Shift-JIS；第二行英文表名锁定口径，英文标题和子标题匹配分项而非只用列位。季度形如 `1994/ 1- 3.`、其后三季省略年份；要求从 1994Q1 连续到最新已结束季度。kiyo-jk 的 1994Q1 空白因无上一季而跳过，其他空值/乱码/非法数字全部失败。英语表名、年率脚注、2020 基期、列唯一性和连续季度均有防御断言，源改版不静默写入。

可重现 fixture：`src/lib/data/scheduler/jpEsriGdp/fixtures/`（4 CSV、menu、release）；同内容初始抓取留在 `.data/jp-esri-gdp/`。

## 4. 订阅与修订机制

Source ID `jp-esri-gdp`，agency `jp-esri`，adapterKind `REST_API`，provider `jp_esri_gdp`。统一发布包 `jp.esri.gdp` 覆盖 41 个成员；本批使用 `probe_interval` 每 168 小时探测，支持初值/二次值/年度修订持续发现。**当前不是精确发布时间调度**，正常最大新值发现延迟约一周；后续官方日历接入时升级发布包，不为成员建立独立日历。

每次解析1994年以来全部季调历史，不受增量 obsStart 截断，因为每次官方发布都可能回修此前季度。统一 writer 仅写入新值/改变值，最新事实与实际摄入时间的 vintage 在同一事务捕获；重复运行保持幂等。HTML/CSV 内容哈希命名与抓取 manifest 保存在 `.data/jp-esri-gdp/snapshots/`（可用 JP_ESRI_GDP_CACHE_DIR 配置），manifest 保留 fetchedAt、releaseUrl、每文件 URL 与 SHA-256；发布 URL 的 `_1/_2` 可追溯初值/二次值。

**历史 PIT 边界**：首次抓到的整段历史是本次可见的最新修订值，不声称是当年公布值，不倒填历史 availableAt，也不假称已收齐以往各版。旧期/新期发布快照按实际观察时刻留存；数值未变化的版本由原始快照追溯，不额外伪造数值修订。

seed 保留已有运营 nextRunAt/releaseRule；发布包 seed 统一成员规则。抓取失败沿用 FetchRun、backoff、滞后告警。没有新数值时 writer 返回 0 行改变。

## 5. 执行与重建

```powershell
npm run data:seed-jp-esri-gdp
npm run data:seed-release-packages
npm run data:sync-jp-esri-gdp
npm run data:verify-jp-esri-gdp -- --db
npx tsx --test src/lib/data/scheduler/jpEsriGdp/parser.test.ts
```

部署 registry 已包含此 catalog，标准 data:apply 可重建元数据；worker 或 sync 回填观测。目录用统一 taxonomy 确定以上三个子组，接入后须对 41 个 `mds:esri_jp_gdp_*` key 执行 sync-catalog-layout 的 dry-run 与正式同步。

## 6. 验证记录

离线三组测试通过：四表完整历史、发布/CSV 发现、无效表头/基期/年率脚注/数字/季度拒收。fixture 2026Q2 总项为名义季调年率 689219.1、实际季调年率 598950.5 十亿日元；平减 115.1；实际季调环比 0.4%。30 条非贡献序列各 130 季自 1994Q1，11 条增长/贡献序列各 129 季自 1994Q2，共 5319 点。

DB verify 检查 41 条的 source/provider、国家/目录 metadata、发布包、季度粒度、启用和下一运行时间、首末期、季度连续性与 vintage 覆盖。实际执行结果由批次交付记录补充；不得把尚未执行的 live 或目录检查标为完成。
