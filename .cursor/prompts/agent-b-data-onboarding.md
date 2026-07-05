# Agent B — API 数据接入（data-onboarding）

> 输入：评审通过（`indicators-approved`）的 `docs/specs/us-<dimension>.spec.md`。
> 职责：把 Spec §3 中 kind ∈ {`fred_api`, `worldbank_api`, `rest_api_existing`, `bulk_file`, `manual`} 的指标完成**入库 + 历史回填 + 持续更新调度**。抓取类（`te_scrape` / `web_scrape_new`）交给 Agent C。
> 完成标准：Spec §6「数据」段全部勾选（抓取项除外），状态改 `data-ready`（若含抓取项，等 C 一起改）。

## 蓝本

以 CPI 域为完整范本逐文件模仿：
`cpiFredSeedCatalog.ts` → `scripts/data-worker/seed-cpi.ts` → `verify-cpi.ts` → `releasePackageCatalog.ts` 的 `us.bls.cpi` 包。
机制文档：[DATA_SCHEDULER_ONBOARD.md](../../docs/DATA_SCHEDULER_ONBOARD.md)（六步清单）。

## 执行步骤（对应六步清单）

### 0. 属性核实（每条指标必做，不得凭 Spec 记忆填）

在写 seed catalog 前，逐条打开 `https://fred.stlouisfed.org/series/<ID>` 核实（非 API，公开页面即可）：

- **Frequency**：页面 `series-meta-value-frequency` 附近文本（Daily/Weekly/Monthly/Quarterly），与拟写入的 `freqLabel`/`granularity` 逐条比对；
- **Units**：`series-meta-value-units` 附近文本，翻译为项目既有中文写法（`%`、`指数`、`十亿美元`、`百万美元`，参考 `cpiFredSeedCatalog.ts`）；
- 与 Spec §3 的值不一致 → 以 FRED 页面为准，回写 Spec 并说明修正原因。

**入库后必做**：seed 完成不代表结束，还要抽查已写入 DB 的 `Instrument.freqLabel` / `unit` 是否与核实结果一致（曾发生过管理页显示层 bug 掩盖真实值正确、也发生过入库字段本身缺失两类问题，两者都要各自定位，不能互相掩盖对方）。

### 0.5 目录分类归位（每条新 FRED 指标必做，否则显示「未分配」）

管理页 `/admin/data-catalog` 的分类不是只看 `Instrument.metadata.catalogCategory`——凡是有 `fredSeriesId` 的指标，分类走 `src/lib/data/fredCatalog.ts` 的静态清单 `FRED_US_ITEMS`（`{id, label, category, frequency}`），且**最终显示还要叠加一层管理员手工整理并持久化到 DB 的自定义布局**（`MacroCatalogLayout`，见 `catalogLayout.ts`）。布局文档里没登记的 key，不管 `FRED_US_ITEMS` 写了什么分类，一律显示「未分配」。

两步都要做：

1. 在 `fredCatalog.ts` 的 `FRED_US_ITEMS` 里给新 FRED id 加一行（`frequency` 只能是 `"日"|"周"|"月"|"季度"|"年"`，注意是"季度"不是"季"），选一个已存在的分类名（如「利率与债券」「银行与货币」「通胀驱动因子」），不要发明新分类除非确实没有合适的桶。
2. 跑 `npm run data:sync-catalog-layout -- --keys=fred:<ID1>,fred:<ID2>,...`（先加 `--dry-run` 确认落点）把这些 key 写进持久化布局的对应分类。若 DB 里本来就没有自定义布局（`loadMacroCatalogLayout()` 返回 null），这步会提示"无需同步"并跳过——`FRED_US_ITEMS` 的分类直接生效。

验证：管理页刷新后，新指标应出现在正确分类下，且不再计入「仅数据库（未在 FMP 统一目录）」（该分类是给完全没有 FRED 对应关系的指标用的，不是给"分类没写对"的指标兜底）。

### 1. seed catalog 模块

新建 `src/lib/data/scheduler/<dim>FredSeedCatalog.ts`：

- 每条指标一行 `SeedRow`：`fredId`、`code`（**必须** `sched_fred_<FREDID>`；非 FRED 用 `<dim>_us_<name>`）、`displayName`、`freqLabel`、`granularity`、`unit`、`category`、`source`、`sourceUpdateNote`。
- `build<Dim>InstrumentMetadata()`：写 `sourceTag: "<dim>-fred-seed"`、`catalogKey: "fred:<ID>"`、`countryCode/countryNameZh` 等（照抄 CPI 版结构）。
- **先查重**：指标可能已被其他 seed 入库（全局搜 `sched_fred_<ID>`）。已存在则跳过入库，只在 Spec 里标注共享。

### 2. seed 脚本 + 注册

- `scripts/data-worker/seed-<dim>.ts`：upsert `Instrument` + `DataSource`（FRED 源复用现有 `fred` source id）+ `DataSubscription`（含 `releaseRule`）。
- 注册 `seedCatalogRegistry.ts`（SEED + VERIFY 两个 registry）+ `package.json` 加 `data:seed-<dim>` / `data:verify-<dim>`。

### 3. 发布包与日历（每条指标都要确定归属，不能只是"单条订阅"）

编辑 `src/lib/data/scheduler/releasePackageCatalog.ts`。**每一条新指标都必须归到某个发布包**——分两种情况：

**3.1 有官方发布日的月/季频序列（经济日历型）**

先查现有包是否已覆盖（CPI/就业/PCE/GDP 等常见月度报告大概率已有包）；没有则用 `pkg()` 建新包：`id` 如 `us.<agency>.<topic>`、`members.fredSeriesIds`、`calendar.keywords` + `excludeKeywords`。

**3.2 无官方发布日历的日/周/季频市场数据（利率、利差、SLOOS 等）—— probe_interval 型分组**

这类数据没有"某月某日官方宣布"的日历事件，但**仍要按同源同频打包**，让管理端能一键批量同步、显示统一的所属分组，而不是留一堆孤立订阅。做法：

1. **先查真实分组依据**：打开 `https://fred.stlouisfed.org/series/<ID>` 页面的「Release:」字段（FRED 官方发布来源，如 "H.15 Selected Interest Rates"、"ICE BofA Indices"、"Charge-Off and Delinquency Rates..."）——**同一个 Release 的序列打包在一起**，不要凭"看起来相关"主观归堆。
2. 用 `releasePackageCatalog.ts` 里的 `probePkg()` 建包（不是 `pkg()`）：`id` 用 `us.<agency>.<release_slug>`、`intervalHours` 与成员的粒度一致（日 24、月 72、季/周 168，对齐 `releaseRule.ts` 的 `defaultReleaseRuleForGranularity`）、`members.fredSeriesIds` 列出该 Release 下本次入库的全部序列。
3. **原理与安全性**（不需要每次重新验证，机制已确认稳定）：`probePkg()` 产出的包 `release` 字段类型是 `probe_interval`，`releasePackageStore.ts` 的 `parsePackageReleaseTemplate()` 故意只识别 `economic_calendar`——所以包链接（`ReleasePackageMember` + `DataSubscription.releasePackageId`）**只影响管理端分组显示和"立即同步发布包"批量拉取**，每个成员的 `effectiveReleaseRule` 仍然解析回自己原有的 `probe_interval` 规则，不会被包级模板覆盖、不会互相干扰。
4. **入库前检查该序列是否已被其他既有包占用**（如 `us.fed.h41` 已经覆盖 WALCL 且是真实日历包，不要重复建包/重复链接）——查 `DataSubscription.releasePackageId` 现状，不要假设是新指标就一定没有包。

跑 `npm run data:seed-release-packages` 后两类包都会写入并链接成员。

### 4. 历史回填 + 获取确认

```powershell
npm run data:seed -- --catalog=<dim>     # 入库 + 订阅
npm run data:sync-one -- sched_fred_<ID> # 每条强制全量回填（FRED 自带全history）
npm run data:probe-sources -- --skip-known --prefix=sched_fred_  # fetchAcquisition → known
```

注意 FRED 限频：批量回填走现有 `fredRateLimiter`，必要时 `--fred-sleep-ms=600`。

### 5. 日历对齐 + 试跑

```powershell
npm run data:sync-calendar    # 发布包 matched → nextRunAt
npm run data:worker           # 到期订阅试跑一轮
```

### 6. verify 脚本

`scripts/data-worker/verify-<dim>.ts`（模仿 `verify-cpi.ts`）：断言每条 code 存在、观测条数 ≥ 阈值、最新观测不晚于合理滞后、`acquisitionStatus === "ready"`、订阅 enabled、发布包成员齐全。支持 `--db`。

## 各源特殊说明

| 源 | 要点 |
|----|------|
| FRED | 复用 `fredAdapter` + 限频器；合成序列（A−B、A/B）参考 `fredComposite.ts` + `fiscalCompositeFred.ts` 模式 |
| World Bank | 年频为主；`worldbankAdapter`；参考 `seed-phase3-wb.ts` |
| Treasury FiscalData | `sourceId: "treasury-fiscal-data"`；`sourceSeriesKey` 见 `treasuryFiscalData/client.ts`；参考 `seed-fiscal.ts` |
| CFTC COT | `sourceId: "cftc-cot"`；参考 `seed-cot.ts` |
| BIS | REST_API 默认分支 `fetchBisIncremental`；季频 |
| bulk_file/manual | 只入库 + 标 `bootstrapOnly` 或 MANUAL，Spec 里写明人工更新周期 |

## 硬约束

- 不动 `prisma/migrations`（现有 schema 足够，不需要新表；若真需要 → 停下报人工）。
- 不改现有 seed catalog / 发布包成员，只新增。
- `.env.local` 密钥不写入任何文件。
- 每步命令的输出留存到交付报告，失败先查 `mds.fetch_run` 日志再重试。

## 常见坑（历史踩过，务必检查）

- **管理页显示 ≠ DB 真值**：`/admin/data-catalog` 的「仅数据库」分类曾把频率硬编码显示成"月"，与实际 `Instrument.freqLabel` 无关（已修复于 `adminCatalog.ts`）。看到显示异常先查 DB 字段，再查显示层聚合逻辑，不要假设是 seed 写错了就重新 seed。
- **跨域复用序列的字段完整性不能默认信任**：其他域 seed 的 Instrument 可能缺字段（如 `phase2SeedCatalog.ts` 批量指标缺 `unit`）。复用前查一遍关键字段是否为空；范围内可修（如「仅当为空才回填」的 upsert）不要改别的域的源文件，全面性缺陷登记为独立任务。
- **新 FRED 指标加了 seed 但管理页显示「未分配」**：不是 bug，是没走完 §0.5 两步（`FRED_US_ITEMS` 加分类 + `data:sync-catalog-layout` 写入持久化布局）。这是**每条新 FRED 指标都必做**的步骤，不做就会一直显示未分配，也会被误判成「仅数据库」类问题。
- **不要把"没有官方发布日历"当成"不用打包"的理由**：日/周/季频市场数据一样要按 §3.2 用 `probePkg()` 归组，否则管理端只能看到一堆孤立指标、无法批量同步。归组依据是 FRED 官方「Release:」字段，不是自己猜的"同类指标"。

## 评审 2 提交物

按 Spec §6「数据」段逐项勾选 + 证据：每条指标的 code / 首末观测日期 / 观测条数表格；`/admin/data-catalog` 三列 + 状态截图（或 API 输出）；`data:verify -- --catalog=<dim>` 输出。
