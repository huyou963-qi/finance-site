# 美国黄金分析原始市场数据接入说明

更新：2026-08-10。当前数据库保留的范围是旧工作簿中的 **24 条 legacy 指标**：5 条已复核为派生项，19 条为原始口径。此前提交 `9c28298` 已删除 `goldov_c04/c05/c12/c13/c14`，本次没有擅自恢复它们；因此历史口头统计的“27−5=22”与当前实际保留集合不一致。19 条原始口径均保持原有 instrument code 和定义，不用近似 FRED/行情序列替换。

## 已确认的五条派生项

| code | 公式 | 处理 |
|---|---|---|
| `goldov_c03_basis` | `c01 - c02` | 派生，不独立抓取 |
| `goldov_c07_comex_stock` | `c23 / 1,000,000` | 派生，不独立抓取 |
| `goldov_c08_comex_stock_wow` | `c07(t) - c07(t-1)` | 派生，不独立抓取 |
| `goldov_c10_etf_holding_wow` | `c09(t) - c09(t-1)` | 派生，不独立抓取 |
| `goldov_c16_etf_tons_wow` | `c25(t) - c25(t-1)` | 派生，不独立抓取 |

`c03/c08/c10/c16` 在全部重叠日期上仅有历史工作簿保留精度导致的极小差异；`c07` 与 `c23` 的单位换算一致。派生实现必须保留各自现有历史观测，直至单独的派生刷新任务上线。

## 当前 19 条原始口径的来源结论

| code | 工作簿精确口径 | 结论 | 更新机制 / 阻塞原因 |
|---|---|---|---|
| `goldov_c01_comex_active` | COMEX 黄金活跃合约收盘价 | 待授权 | CME 市场结算价；需 CME 市场数据许可/API，不能用网页抓取。 |
| `goldov_c02_london_gold` | 伦敦金现 IDC | 待确认供应商合同 | `IDC` 是原口径的一部分；LBMA 或其他现货报价并不等价，须取得 IDC/ICE Data 的原始序列授权。 |
| `goldov_c06_mm_net` | CFTC 管理基金净持仓 | 已接通 | CFTC Socrata `kh3c-gbw2`，按报告字段 `m_money_positions_long_all - m_money_positions_short_all`；每周探测。已与工作簿 875 周逐点一致。 |
| `goldov_c09_etf_holding` | 总黄金 ETF 持有量（百万盎司） | 待定义方法 | 原来源为“根据新闻整理”，没有 ETF 范围、时区和汇总规则；先补齐方法或取得明确聚合供应商许可。 |
| `goldov_c11_global_reserve` | 全球黄金储备（百万盎司） | 待定义方法 | 原来源为“根据新闻整理”；无国家范围、储备口径及汇总规则，不能以单一国家或近似 WGC 数据替代。 |
| `goldov_c15_ppi_yoy` | PPI 所有商品、非季调、同比 | 已接通 | BLS Public Data API `WPU00000000`，由官方 NSA 指数计算同月同比；并入 `us.bls.ppi` 发布包。 |
| `goldov_c17_spdr_etf` | SPDR 黄金 ETF 持有量（吨） | 需条款确认 | SPDR Gold Shares 发行人每日持仓/历史文件是候选；在确认可自动下载、保存及展示条款前保持 pending。 |
| `goldov_c18_ishares_etf` | iShares 黄金 ETF 持有量（吨） | 需条款确认 | 需锁定工作簿对应基金（预期 IAU）并确认 iShares 下载条款；不可用另一只 iShares 产品替代。 |
| `goldov_c19_gbs_etf` | GBS 黄金 ETF 持有量（吨） | 待供应商映射 | 工作簿来源为 Wind；须确认历史 GBS 产品、发行人和许可，不能凭名称映射到当前其他 ETC。 |
| `goldov_c20_phau_etf` | PHAU 黄金 ETF 持有量（吨） | 待供应商映射 | 工作簿来源为 Wind；需确认发行人/份额和历史数据授权。 |
| `goldov_c21_sgbs_etf` | SGBS 黄金 ETF 持有量（吨） | 待供应商映射 | 工作簿来源为 Wind；需确认产品历史与发行人数据使用条款。 |
| `goldov_c22_gold_etf` | GOLD 黄金 ETF 持有量（吨） | 待供应商映射 | 工作簿来源为 Wind；`GOLD` 不是足以唯一识别产品的来源合同。 |
| `goldov_c23_comex_stock_oz` | COMEX 黄金库存（金衡盎司） | 待授权 | CME 的 Gold Stocks 是精确公开报告口径，但网站数据条款明确禁止脚本/机器人抓取；联系 CME GCC 获取可自动化的 report/data feed 许可。 |
| `goldov_c24_global_reserve_tons` | 全球黄金储备（吨） | 待定义方法 | 与 `c11` 的历史值不满足标准金衡盎司换算，不能擅自标记为换算派生；需原汇总方法。 |
| `goldov_c25_etf_holding_tons` | 总黄金 ETF 持有量（吨） | 待定义方法 | 与 `c09` 的历史值不满足标准金衡盎司换算，须明确 ETF 名单与汇总算法。 |
| `goldov_c26_dxy` | ICE 美元指数 DXY | 待授权 | ICE Data Indices 的 DXY 是受许可指数；FRED 广义美元指数口径不同，不能替换。 |
| `goldov_c27_brent` | ICE 布伦特原油连续期货结算价 | 待授权 | 需 ICE Futures 的连续合约结算数据；EIA/FRED 布伦特现货不等价。 |
| `goldov_c28_real_rate` | 美国实际利率 | 已接通 | World Bank Open Data API `US:FR.INR.RINR`；年度、年末观测日期、每周探测新年值。 |
| `usov_c28_sp500_pe` | 标普 500 PE | 待定义/授权 | 工作簿来源 Wind，尚未说明 trailing/forward、收益口径和指数版本；S&P 官方 P/E 数据需按所需版本取得授权。 |

`sched_fred_PRFIC1` 不属于上述 legacy 黄金/Overview 原始口径：它已是有效的 FRED `PRFIC1` 定时订阅，存在 `fetchAcquisition=known`、启用订阅和下次运行时间，无需重复创建同序列。

## 合规与下一步

- 仅已验证来源的 `c06/c15/c28` 会被设为 `fetchAcquisition.status=known`、启用订阅并由 worker 更新。
- CME 页面返回的规则明确禁止使用脚本、机器人等抓取机制；因此本项目不实现网页绕过。对于 `c01/c23`，取得 CME data feed/许可和 API 凭据后，再实现经授权适配器。
- ICE DXY、ICE Brent 和精确 S&P 500 P/E 同样必须由持牌数据源提供。将来接入时把凭据放入部署环境变量，不提交到仓库，并在适配器中写明供应商、合约/指数版本、调整规则、时区及再分发限制。
- `c09/c11/c17`–`c22/c24/c25` 不是“少找一个网页”能解决的问题：工作簿没有足以复现的聚合方法或数据权利。收到原始供应商合同、导出样本或方法定义后，按 Agent C 的 fixture → parser test → adapter → 历史回填 → subscription 流程接通。
