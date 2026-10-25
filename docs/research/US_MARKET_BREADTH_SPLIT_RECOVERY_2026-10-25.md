# 标普500广度：已公告拆股与旧IAC报价核验（2026-10-25）

## 本轮结果

截至2026-10-23，200日均线上方占比从4461点增加至4480点，新增19个有效交易日，连续起点从2009-01-30推进到2009-01-02。50日占比仍为4545点，自2008-09-30起连续；两条序列各自起点后均无内部断档。覆盖率仍各6044点，自2001-02-27起，历史覆盖率根据补回的有效窗口重算。

1995年以来的完整历史仍未实现。没有下调95%门槛，没有插值，没有用当前成员反推旧股票池，也没有把被收购公司的价格换成收购方价格。

## 已核验的拆股

| 原发行人 | 首个拆股后交易日 | 比例 | 一手证据 |
| --- | --- | --- | --- |
| Weatherford | 2005-12-01 | 2:1 | [发行人公告：11月30日分配股票](https://www.sec.gov/Archives/edgar/data/1170565/000095012905010140/h29657exv99w1.htm) |
| Weatherford | 2008-05-27 | 2:1 | [发行人公告：5月23日分配股票](https://www.sec.gov/Archives/edgar/data/1170565/000095012908002314/h55944exv99w1.htm)；5月26日休市 |
| 原Invitrogen，后Life Technologies | 2008-05-28 | 2:1 | [交易所0982-08公告明确除权日](https://www.nasdaqtrader.com/content/phlxmemos/2008/May/0982-08.pdf) |
| Medco Health Solutions | 2008-01-25 | 2:1 | [发行人拆股FAQ明确除权日](https://media.corporate-ir.net/media_files/irol/13/131268/MHSStockSplitFAQs.pdf) |
| 原Allergan | 2007-06-25 | 2:1 | [交易所1520-07公告明确除权日](https://www.nasdaqtrader.com/content/phlxmemos/2007/jun/1520-07.pdf) |

Weatherford的交易日由公告分配日与实际SPY日历推导，清单明确标注；所有五项均须另行通过原始分币精度调整因子检查和实际交易日历检查。

使用原有固定QSTK原文件、逐文件git blob校验与BSD许可；只按公告给定的比例统一OHLC价格尺度，保留原始Adj Close和实际成交量。拆股前现金分红金额也统一至同一每股尺度。报价调整结果写入独立Q12S价格键，不覆盖原64组Q12报价，不用含分红Adj Close计算价格均线。

四组Q12S可用报价共11603条，分别原Allergan3100、Medco2169、Weatherford3167、Invitrogen3167。公告比例不符、相邻报价不足、低精度以及同日混合现金/拆股均拒绝；未知公司行动仍由共同因子检查阻断。每个50/200日窗口只选一个完整价格键，不能拼接尺度。

复现：`npm run data:backfill-market-breadth-qstk-splits`核验，`-- --apply`备份并写入；然后执行既有显式全历史重算。日常worker只读已核验历史缓存并照常更新新交易日，不重复下载冻结文件。

## 旧IAC报价映射

旧IAC/IACI在2020-07-01以前对应后来更名为Match的存续发行人，不能回溯使用2020年新设IAC的报价。[2020年完成分离8-K](https://www.sec.gov/Archives/edgar/data/1800227/000110465920080610/tm2022502-7_8k.htm)及[2016年IACI改为IAC的8-K](https://www.sec.gov/Archives/edgar/data/891103/000089110316000020/coveritemsandsignatures2015.htm)说明发行人关系。

既有Yahoo MTCH历史自1993-01-19起；与2018冻结IAC报价在其旧成员期以前重叠3925个报价日，日收益差中位数约6.99e-8、99%分位约1.90e-6，支持同一旧报价连续性。仅修复日期限定的价格选择，使用既有完整Yahoo窗口；香港与本机在2006年至旧成员退出前的662条价格完全相同。

## 更早来源的继续调查

- [WRDS公开变更表](https://wrds-www.wharton.upenn.edu/classroom/sp500-introduction/over-time/)仅提供变更线索，其完整成员名单入口实际跳转登录；没有据此声称1995名单完整。
- 新发现[Johnbrick123/sp500-data](https://github.com/Johnbrick123/sp500-data)声称覆盖至1970，其1995及更早区间依赖CRSP转载，且包含自行推断拆股与停牌价格延续。没有把这份拼接结果直接导入现有指标。
- 匿名下载并逐行检查[Evan Hallmark 2018年冻结归档](https://www.kaggle.com/datasets/ehallmar/daily-historical-stock-prices-1970-2018)版本1（原ZIP SHA256 `02135cca6e03f1d85b300c2a0e91bb2b4e1c2500a2fa4744fc2f83d07ff09fdf`；API标记许可Unknown）。AGN实际为Actavis，CCU实际为智利啤酒公司；BUD、BTU、LIFE、FDC等开始日已晚于所需旧发行人。SUN与固定原发行人报价的重叠日收益仅约59.05%在1bp误差内，存在严重拼接/异常问题。此归档仅作调查、身份与重叠核验线索，没有直接生产入库。

## 验证

新增拆股比例、现金金额尺度、多次拆股累计、未知动作及严格200日窗口测试；完整提交门禁1205项测试（1204通过、1项Windows平台跳过），Prisma、ESLint及生产构建通过。宏观观测沿用正式订阅和版本账本，香港导入前备份，并逐日比较数据库及网站接口完整历史。
