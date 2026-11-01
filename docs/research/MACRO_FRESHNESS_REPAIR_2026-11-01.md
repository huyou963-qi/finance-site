# 2026-11-01 宏观新鲜度审计修复

原始证据：[Actions #12](https://github.com/huyou963-qi/finance-site/actions/runs/41292394469)，2026-11-01 17:20 北京时间开始复核，6,669 个可见指标、166 条 critical、29 条 warning。问题数不等于指标数。

## 分类与处理

| 范围 | 原始严重问题 | 处理 |
|---|---:|---|
| 财政第三、第四本账 | 60 | 已成功回填的历史项，metadata 明确 historicalOnly + archiveAfterBootstrap，订阅按既定政策停用；改为单列 archive，仍要求真实历史存在 |
| 世界银行 | 46 | 23 个国家/指标组合的完整官方历史重查无数值，或 API 明确返回已删除/归档；从当前目录下线空入口，保留 Instrument、订阅及所有历史，记录排期审计 |
| 美国 Census 贸易 | 43 | 22 个旧身份的停用告警与16个遗留失败属于历史序列；其余5个活跃稀疏贸易伙伴需通过官方 NSA 工作簿独立验证后恢复正常抓取 |
| FRED | 9 | 6个临时抓取故障通过正常连接器重试；IEASAD 的调度、空库、源端领先三个问题通过历史回填与归档处理 |
| 无订阅 | 7 | 3个 MacroRegime 目录投影产生6个误报，改查真实 mds.macro_regime 字段及日期；COMEX库存为已记录的授权数据限制，单列 licensed |
| 日本求人倍率 | 1 | e-Stat 每月更换文件ID导致404；从官方目录精确发现长期表3，保留全国、含兼职、季调口径 |

原29条 warning：世界银行23条 never_fetched、IEASAD 1条 never_fetched、Census 4条订阅末期缓存偏移、COMEX 1条无订阅缓存比较。修复真实抓取并按生命周期区分，不通过清空错误字段或伪造成功时间消除告警。

另在工作期间出现的日本住宅开工 e-Stat 临时请求失败，也使用原连接器有界重试恢复。

## 官方证据

- 世界银行以现有适配器读取完整 WDI 历史，验证 EU→EUU、EA→EMU。16个组合仅返回空值，7个 `GC.BAL.CASH.GD.ZS` 组合返回官方 API error 175：指标被删除或归档。具体23个代码见 `SOURCE_ENDED_HIDDEN_CODES` 中2026-11-01段落；恢复时可删除对应 mds/wb 两种目录 tombstone 后重新探测。不是用一个HTTP失败判定源端无数据。
- [WDI 意大利广义货币](https://api.worldbank.org/v2/country/IT/indicator/FM.LBL.BMNY.GD.ZS?format=json&per_page=100)、[现金盈余/赤字指标](https://api.worldbank.org/v2/country/IT/indicator/GC.BAL.CASH.GD.ZS?format=json&per_page=100)。
- [Census国别月表](https://www.census.gov/foreign-trade/balance/c1610.html)明确写明：名义美元百万、未季调，仅列发生贸易月份；API无行不能推定零。运行连接器复用原[官方NSA工作簿](https://www.census.gov/foreign-trade/balance/country.xlsx)及已审计的发布时间边界、历史身份过滤、现有受限文件传输。工作簿也不可用时继续报错；不使用旧离线快照，不绕过认证或反爬挑战。
- [厚生劳动省2026年9月发布](https://www.mhlw.go.jp/stf/newpage_76960.html)、[e-Stat当前目录](https://www.e-stat.go.jp/stat-search/files?layout=dataset&toukei=00450222)。2026-10-30发布的新长期表3 ID为000040518983，旧000040505314返回404；新源观测2026-09=1.19。
- [FRED IEASAD](https://fred.stlouisfed.org/series/IEASAD)完整历史截止2019-10，实际回填84个季度点。此后不要求当前季度更新，也不拼接别的口径。
- COMEX库存限制沿用 `data:verify-catalog` 的既有判定，仍保留可见历史；这不是已恢复自动更新的数据源。

## 发布与资源边界

在独立分支实现，不包含共享原工作区其他未提交变更。生产创建独立采集release，既有依赖按内容硬链接；源码替换断开硬链接，worker→calendar锁内原子切换，旧release保留可回滚。没有生产构建、迁移或常驻服务变更。

恢复脚本默认dry-run，限制最多150个报告目标、串行取数、每条备份最多5,000个已有观测；正常writer保留修订账本。官方舍入工作簿只允许补充晚于库内末期的新观测，不覆盖已有API精度；API 403、结构变化不会转换为成功。原始报告、订阅快照、恢复前观测、逐源核查结果保存在生产共享 `.data/audits/`。

当前已通过全量测试：1,298 tests，1,297 pass，1个平台测试skip，0 fail；TypeScript与改动文件ESLint通过。最终生产复核结果在任务完成后补录。
