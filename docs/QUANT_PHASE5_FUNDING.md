# 量化平台 Phase 5：资金面维度

接 Phase 4（因子研究 + 宏观联动）。Phase 5 补齐第五维 **资金面**：机构持仓（SEC Form 13F）、
空头利益（short interest）、ETF 行业资金流。核心红利 = 资金面因子只要落进 `FactorSnapshot`
（`requires="funding"`），就**自动**获得 screener / 回测 / IC-IR / regime 全部能力（前四阶段的架构复利）。

免费约束下的硬边界：**日内/实时资金流做不了**，只做季频（13F）+ 双周（空头）+ 日频 ETF 代理。

## WS0 源可达性 probe（2026-07-22 实证，`scripts/quant/probe-funding-sources.ts`）

| 源 | 结果 | 结论 |
|---|---|---|
| **SEC Form 13F 结构化数据集** | ✅ 可达（zip 含 COVERPAGE/INFOTABLE/SUBMISSION TSV，2013 起） | 唯一完整可回测的资金面源 → Phase 5 v1 核心 |
| **FINRA** 短兴趣（cdn/api.finra.org） | ❌ 本部署被网络封锁（fetch failed，多次复现，见 china-server-blocked-sources） | 空头维度**降级** |
| **NASDAQ Trader** 短兴趣 | ⚠ JS SPA，无静态可下载文件 | 弱/不可用 |
| **ETF 历史份额**（Yahoo quoteSummary / SSGA） | ❌ Yahoo 对 ETF 不返回 sharesOutstanding、SSGA 仅当日 | 真实「份额×NAV 流」不可回测 → ETF 维度**降级为基建** |

> WS0 结论**反转了原计划的 ROI 排序**（ETF/空头先做、13F 放最后）：ETF 与空头的免费源都受限，
> 而 13F 是唯一完整可回测的源 → 13F 升为 v1 核心交付，ETF/空头降级为基建 + 透明化。

## 原始表（mds schema，migration `20260722120000_funding_dimension`）

- `institutional_holding`：13F 逐 filer×证券×报告期。`value` 一律归一到**美元**（2023-01-03 前 SEC 报千元 → ×1000）；
  只留 `SSHPRNAMTTYPE=SH` 且 `PUTCALL` 空的普通股行；同一 filing 内多披露口径按 `(accession,cusip)` 聚合。
- `short_interest`：symbol / settlementDate / publishDate / shares / avgDailyVol? / daysToCover?（降级：表就绪，源受限）。
- `etf_flow`：etfSymbol / date / sharesOutstanding? / nav / flowUsd?（NAV 时间序列已落；份额/流待源）。
- `EquitySecurity.cusip`：13F CUSIP↔symbol 桥回填缓存。

## WS1 CUSIP↔symbol 桥（`cusipBridge.ts` + `scripts/quant/build-cusip-bridge.ts`）

13F INFOTABLE 只报 CUSIP + NAMEOFISSUER（无 ticker/CIK），EquitySecurity 无 CUSIP →
**公司名模糊匹配 + filer 频次择优 + 股份类别消歧**。头号可行性风险，接受部分覆盖 + 透明化。

- **归一化**：去重音、大写、`&↔AND`、去标点（含花体撇号）、剔后缀词（INC/CORP/…）、缩写规范化
  （13F 定宽截断 + 缩写：PWR→POWER、LABS→LABORATORIES、INTL→INTERNATIONAL…）、去单字符噪声。
- **匹配打分**：prefix-aware token 近似（防 MICROSOFT~MICRON 假阳，公共前缀阈值收严）；
  子集/词序颠倒（"Lilly (Eli)"↔"ELI LILLY"）保底高分；债券类 titleOfClass 候选剔除（防 ticker 误配公司债 CUSIP）。
- **硬覆盖**：dual-class（GOOGL/GOOG/BRK.B——titleOfClass 随 filer 不稳）与拼接名（ExxonMobil）、
  缩写名（IBM）走 `CUSIP_OVERRIDES`。
- **覆盖率**：有名宇宙 **622/634 = 98.1%**（exact 511 / fuzzy 98 / class-hint 13）；未命中多为退市或极近期改名。
  单季数据集扫得的候选覆盖当代大盘；退市名可扫更早季度 union 扩覆盖。

## WS2 13F 摄入 + 机构持仓因子

- **摄入**（`scripts/quant/sync-13f.ts` + `lib13f.ts`）：逐季 zip 下载（SEC 两代命名：日历季度
  `YYYYqN` 与日期区间，逐候选试到 200；索引页易 503 → 确定性生成 URL 兜底 + 指数退避重试）→
  流式扫 INFOTABLE 只留桥接命中的宇宙 CUSIP → 按 `(accession,cusip)` 聚合 → 落库。单季 ~73 万持仓行。
- **因子**（`fundingFactors.ts` 纯函数 + `fundingData.ts` DB 装配，照 `computeFundamentalFactors` 模式）：
  - `instOwnershipPct`：合计持股 / PIT 股本；
  - `instOwnershipChgQoQ`：本可见期 / 上一可见期 − 1（机构增减仓）；
  - `instHolderCount`：披露持股的 13F filer 家数；
  - `instConcentration`：Σ(各机构份额²) 的 HHI。
- **拆股口径**（沿用 Phase 1 坑1）：13F `SSHPRNAMT` 是**报告期 as-reported 股数**，PIT
  `sharesOutstanding` 已归一到**现拆股刻度** → 装配层对 13F 股数乘 `∏ratio(exDate>periodEnd)` 归一后再算占比/环比。
- **PIT 严格无前视**：报告期 P 的聚合只计 `filedAt ≤ periodEnd + WINDOW(50d)` 的 filing（每 filer 取窗口内最新）；
  可见日 = `periodEnd + WINDOW`；因子在 T 只取可见日 ≤ T 的最新期 → 被选中期的全部计入 filing 必 `≤ periodEnd+WINDOW ≤ T`，
  **T 之后 filed 的数据恒在窗口外、不影响**（无前视测试恒成立）。集成于 `build-factors.ts` 基本面 pass。

## WS3 空头利益（降级）

FINRA 自动源本部署不可达（WS0）。`scripts/quant/sync-short-interest.ts` 提供：
- `--file=<路径>` 手工文件摄入（运维在非受限网络下载 FINRA/NASDAQ 双周文件后落库，header 驱动解析，可用可测）；
- `--auto` 明确报「源不可达」而非静默 0；`SHORT_INTEREST_SOURCE_URL` 可指向可达镜像。
- PIT：可见日 = publishDate（结算日后约 8 交易日；文件缺则 settlementDate + 12 日估算，保守防前视）。
- 因子（shortInterestRatio / daysToCover / siChange）随本表有数据自动进 FactorSnapshot；当前本部署无源 → 覆盖率透明报 0。

## WS4 ETF 行业资金流（降级为基建）

免费源无历史/现值 ETF 份额（WS0）→ 真实 `Δ份额×NAV` 流不可回测。`scripts/quant/build-etf-flow.ts`
落板块 ETF + SPY 的 **NAV 时间序列**（前复权收盘）到 `etf_flow`，`sharesOutstanding/flowUsd` 待份额源。
板块级「成交额代理」可由 `equity_daily_bar` 的 close×volume 现算（不落库避免冗余）。

## 注册接入 + UI（WS5）

- `FactorDataRequirement` / `FactorCategory` 扩 `"funding"`；`factorRegistry.ts` 加 4 条 funding 因子（startYear 2013）。
- screener / 因子研究页 `CATEGORY_LABELS`/`CATEGORY_ORDER` 加「资金面」——注册表驱动，类目自动出现。

## 验收（`scripts/quant/verify-phase5.ts`，`npm run quant:verify-phase5`）

A 三原始表样本 + 覆盖率透明化；B PIT 无前视（AAPL filedAt 对齐 / T<可见日回退 / 未来 filed 不影响）；
C 架构复利（screener / IC / 回测各抽查 funding 因子）；D 史实 sanity（蓝筹机构持股占比高、家数上千、mega-cap HHI 低）。

**史实 sanity 抽查**（2024-12-31 期，2025-03 截面）：AAPL 机构持股 62.3% / 5340 家 / HHI 0.048；
MSFT 71.6%；NVDA 64.5%；JPM 72.7%——均符合大盘蓝筹机构高持股 + 高度分散的史实。

## 生产部署（数据在 DB 不随代码走，须在生产库逐步生成）

系统依赖：13F 解压依赖 `unzip`（全新 Linux 服务器需先装）：
```bash
apt-get install -y unzip     # Debian/Ubuntu（CentOS: yum install -y unzip）
```
数据管线顺序（**顺序不可乱**）：
```bash
npm run db:migrate                                    # 建三表 + EquitySecurity.cusip
npm run quant:build-cusip-bridge                      # 回填 cusip（sync-13f 依赖）
npm run quant:sync-13f -- --from=2013-01              # 摄入 13F（SEC 阿里云可达）
npm run quant:build-factors -- --full --from=2020-06  # funding 因子进 factor_snapshot（因子仅 2020-06+ 生成）
npm run quant:build-etf-flow                          # ETF NAV 基建
```
下载缓存目录默认 `os.tmpdir()/funding-13f`，可用 `FUNDING_CACHE_DIR` 覆盖。空头维度云端 FINRA 仍封锁，走 `sync-short-interest --file`。

## 已知限制 / 遗留

1. **13F 历史摄入受本部署 SEC 网络带宽限制**（~50KB/s，单季 ~30min 下载）→ v1 先落近季，
   全 2013+ 回填为 `sync-13f --from=2013-01` 的长跑（后台、幂等、可断点续跑）。摄入更多季后重跑 `build-factors` 即得完整 funding 因子历史。
2. **空头维度**：FINRA/NASDAQ 免费源本部署不可达，降级为手工文件摄入。换非受限网络或付费源可全量。
3. **ETF 资金流**：免费无历史份额，降级为 NAV 基建 + 成交额代理；真实创设/赎回流待源。
4. CUSIP 桥退市/极近期改名名（~2%）未命中；扫更早季度 union 可扩覆盖。
5. 机构持股占比可 >100%（13F 跨管理人重复计 + 衍生品口径），winsorize 已处理离群。
