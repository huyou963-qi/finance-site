# 标普500广度：普通现金分红边界续查（2026-10-25）

## 结果

截止2026-10-23：50日占比4511点，自2008-11-17起连续；200日占比4424点，自2009-03-25起连续。比上一轮增加21/48个交易日；50日此前20个内部缺口已全部补齐。各自首日前仍缺，1995年无完整可核验名单，不下调95%覆盖门槛。两条覆盖率仍各6044点。

## 方法与边界

QSTK旧Yahoo Close未复权，上一轮保守排除了所有可观测调整因子变化日。普通现金分红不改变原始Close的每股数量尺度，但未知拆股会改变。因此仅对发行人已明确公告的普通现金分红，按上一交易日原始Close和公告金额，验证相邻调整因子变化是否相符。区间须在原文件Adj Close分币精度内相交，否则继续排除；即便存在现金公告，同日还含拆股而无法解释完整变化时也不放行。

核验不改任何原始价格，只恢复此前保守排除的原文件日期。无报价、零成交量、低精度、未知公司行动和有效样本不足仍保持缺失。回填报告记录cashEvidence、verifiedCashDates及仍排除日期；原始CSV继续校验固定commit的git blob SHA1。

## 已核验事件

| 原发行人 | 除息日 | 每股现金USD | 证据 |
| --- | --- | --- | --- |
| NYSE Euronext | 2008-03-12 | 0.25 | [SEC S-4现金金额及2008-03-14登记日](https://www.sec.gov/Archives/edgar/data/1368007/000119312508069699/ds4a.htm) |
| NYSE Euronext | 2008-06-11 | 0.30 | [发行人SEC公告明确除息日](https://www.sec.gov/Archives/edgar/data/1368007/000118143108019974/rrd199506_23703.htm) |
| NYSE Euronext | 2008-09-11、2008-12-11、2009-03-11 | 各0.30 | [发行人公布的分红时间表](https://mondovisione.com/media-and-resources/news/nyse-euronext-announces-quarterly-dividend-payment-dates-provides-information-fo-2011124/) |
| 原Allergan（非2015年改名后的Actavis） | 2008-05-21 | 0.05 | [发行人一季报公告：2008-05-23登记](https://www.sec.gov/Archives/edgar/data/850693/000089256908000768/a40556exv99w1.htm) |
| 原Allergan | 2008-08-13 | 0.05 | [发行人二季报公告：2008-08-15登记](https://www.sec.gov/Archives/edgar/data/850693/000095013408013638/a42529exv99w1.htm) |
| RadioShack | 2008-11-25 | 0.25 | [发行人8-K：2008-11-28登记](https://www.sec.gov/Archives/edgar/data/96289/000009628908000035/form8k110708.htm)、[10-K确认实际支付](https://www.sec.gov/Archives/edgar/data/96289/000009628909000004/form10k123108.htm) |

仅披露登记日的四项，按当时T+3下普通现金分红除息日在登记日前第二个交易日的规则，与实际SPY交易日及QSTK因子变化交叉核验。RadioShack登记日前的2008-11-27为休市日，因此对应11月25日。此处日期计算是明确标注的推导，不声称发行人逐项披露了除息日；同时必须通过金额/价格变化核验。[NASDAQ对2017年前规则的官方说明](https://listingcenter.nasdaq.com/assets/rulebook/nasdaq/rules/Issuer_Alert_2017-001.pdf)。

八项全部通过原始报价与交易日核验；64组隔离价格由134041条增加至134049条。现金金额不相符、混合拆股、缺少相邻报价的测试仍阻断窗口，不把历史月度/季度现金政策外推到其他日期。

重算仍通过正式订阅及版本账本；服务器先备份原有价格/宏观观测，按相同固定文件和清单回填，再核对完整历史与网站接口。
