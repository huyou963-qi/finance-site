# 标普500广度：更早历史调查与恢复（2026-10-25）

## 本轮结果

观测截止2026-10-23。50日占比4490日，首日2008-11-18，自2009-01-13起连续；200日占比4376日，自2009-06-03起连续。相对10月24日分别新增715/702日。两条样本覆盖率仍各6044点，自2001-02-27开始。50日首日至连续区间之间仍缺20日（2008-11-26、2008-12-11至2009-01-05、2009-01-08至2009-01-12）。各指标首日前仍缺历史。本轮只恢复真实公开资料，不调整95%有效样本、495—510成员规模和连续交易日窗口规则。

## 找到并核对的真实旧报价

| 原历史成员代码 | 现在保留旧报价的代码 | 本轮完整行情数 | 与2020冻结归档核对收益组数 |
| --- | --- | --- | --- |
| DV/ATGE | CVSA | 8899 | 5093 |
| JDSU/VIAV | VIAV | 8289 | 5093 |
| WYN/WYND | TNL | 5099 | 3449 |

CVSA行情自1991年、VIAV自1993年、TNL自2006年开始。原始日线完整下载，不跨来源拼接价格尺度；上述数据来自真实历史报价，未复制合并后报价到合并前。

发行人连续性的一手证据：

- [DeVry 2017年更名为Adtalem公告](https://www.sec.gov/Archives/edgar/data/730464/000115752317001644/a51564302ex99_1.htm)及[更改DV为ATGE代码的股东文件](https://www.sec.gov/Archives/edgar/data/730464/000119312517152130/d383977ddef14a.htm)。
- [Covista 2026年8-K](https://www.sec.gov/Archives/edgar/data/730464/000110465926011611/atge-20260205x8k.htm)：ATGE于2026-02-24改CVSA，旧股票证书继续有效。
- [JDSU更名VIAVI公告](https://www.sec.gov/Archives/edgar/data/912093/000110465915056495/a15-16911_1ex99d2.htm)：2015-08-04由JDSU改VIAV，不能与分拆的Lumentum混用。
- [Travel + Leisure公司历史FAQ](https://investor.travelandleisureco.com/company-info/faq)及[2021年更名公告](https://investor.travelandleisureco.com/sec-filings/all-sec-filings/content/0001361658-21-000018/a991-tnlnamechangepressrel.htm)：WYN→WYND→TNL。

2020年Jackson Crow/Oleh Onyshchak CC0冻结文件ATGE、VIAV、WYND与本轮价格比较：收益差median约2e-16，99%分位最大2.311e-7。源文件SHA256、对照结果保存在运行缓存`early-continuity-20261025/validation.json`。DV只在2017-05-24以前对应DeVry，避免将2021年上市的DoubleVerify混入旧成员。

## 仍然不足的年份

| 核验日 | 名单数 | 50日有效样本 | 200日有效样本 | 200日覆盖率 |
| --- | --- | --- | --- | --- |
| 1996-01-02 | 487 | 238 | 233 | 47.84% |
| 2000-01-03 | 491 | 297 | 297 | 60.49% |
| 2005-01-03 | 495 | 370 | 367 | 74.14% |
| 2008-09-15 | 498 | 466 | 458 | 91.97% |
| 2010-01-04 | 499 | 481 | 479 | 95.99% |

2010年初的指标已达到门槛；2008-09-15的200日窗口还差16只有效样本。剩余障碍包括缺退市股价格、IPO/分拆后真实历史不足、旧报价缺交易日及尚未完整核验的拆股/分红边界。不能用收购方价格或同代码新公司替代。专项报告`market-breadth-deep-audit-after-20261025.json`保存逐股计数及窗口起止，`market-breadth-gap-report-20261024.json`本轮重新生成，按真实SPY交易日核对所有缺口。

## QSTK：本轮第二步恢复

[Georgia Tech QuantSoftwareToolkit](https://github.com/QuantSoftware/QuantSoftwareToolkit)固定commit `0eb2c7a776c259a087fdcac1d3ff883eb0b5516c`的Yahoo目录含约千份CSV，候选中保留64组、134041条可用价格。逐文件按git blob SHA1验证，另记SHA256及原项目[New BSD许可](../licenses/QSTK_LICENSE.txt)。原始记录范围2000-02-01至2012-09-12；更早日期不外推。

与现代Yahoo CSV不同，该归档Close未处理拆股。算法不估计拆股因子、不把含分红Adj Close作为价格：在Adj Close四舍五入到分所允许的区间内逐行维护共同调整因子；一旦交集为空，排除该日并开始新片段。Adj Close低于1的低精度日也排除。原始Close只在片段内形成连续50/200交易日窗口，因子变化日造成真实日历缺口，均线必须重新预热。现金分红日也保守排除，零成交量及无效报价不入库，覆盖不足继续留空。

自动化测试覆盖真实2比1拆股实例、普通现金分红、舍入区间、累计调整、低价以及严格交易日预热；未估算未知公司行动。与其他来源不拼接价格刻度。Q12:LEGACY:AGN对应2012年原Allergan，禁止退回WIKI中Actavis报价。旧YHOO、BTU、ANR、EK、WFR、RSH分别对应AABA、BTUUQ、ANRZQ、EKDKQ、SUNEQ、RSHCQ的旧成员股票。ABI/BUD/CTX/NSM/UST五组候选起始日晚于原成员交易终止或对应后续证券，已隔离且不参与回填；SAF候选全为零成交量，也排除。

可重现操作：

```powershell
npm run data:backfill-market-breadth-qstk
npm run data:backfill-market-breadth-qstk -- --apply
npm run data:sync-market-internals -- --cached-prices --breadth-only --replace-history
```

默认只核验、缓存、输出报告；apply仅写隔离Q12价格键，重写已有同源价格前备份。全历史宏观重写仍经正式订阅和版本账本，失败不冒充完成。冻结归档不是每日更新源，后续日常更新仍使用现有在线行情和调度器。

## 继续核查但未用于入库的公开来源

- [Boris Marjanovic 2017年CC0归档](https://www.kaggle.com/borismarjanovic/price-volume-data-for-all-us-stocks-etfs/)明确包含现金分红复权，不能直接混入本指标拆股调整、未含分红的价格口径。
- [Azure公开金融数据项目](https://github.com/cheukhin1024/Financial-Data-Project-in-Azure)虽列有BMC/CVH等退市股，但文档明确价格含分红复权，不能直接混入本指标；未使用公开文档中的账号凭据或联系他人。
- [CMU Andy Pavlo研究归档](https://www.cs.cmu.edu/~pavlo/datasets/stocks/)为截至2006年的实际历史成交报价，作者明确未作拆股调整、有日期缺口，无法直接当作连续拆股调整价格使用。
- QuantQuote旧免费文件官方地址本轮返回404；没有从格式或调整依据不明的镜像推算入库。

以上限制针对现有序列保持同一口径。1995年以来完整历史仍未实现，不能将本轮新增观测描述为全部历史完成。
