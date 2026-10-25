# 2026-10-24 四条审计差异修复

## 根因与边界

- `nbs_cn_realestate_db24f54063787b44be`：旧目录/来源键仅写商业营业用房，实际是商品房待售面积同比；2026-09=-5.7%。
- `nbs_cn_realestate_e9a76c570b5c25c176`：旧目录仅写办公楼累计值、单位为原表单位，实际是期末商品房待售面积：办公楼；2026-09=5184万平方米，不是当月销售或投资累计额。
- `census_us_trade_imports_country_nsa_4350`、`..._4610`：订阅已暂停，解析器已限制1992-12截止，但旧MacroObservation各有60条1993–1996及2003年零值占位尾段。只修解析器不会移除存量脏数据。

## 官方证据

- NBS全国房地产表1：[2026年1—9月](https://www.stats.gov.cn/sj/zxfb/202610/t20261019_1965615.html)。办公/商业投资、施工、销售、待售的父级不同，不能相互混用。
- [Czechoslovakia4350](https://www.census.gov/foreign-trade/balance/c4350.html)与[USSR4610](https://www.census.gov/foreign-trade/balance/c4610.html)：官方有交易月份最后为1992-12，进口分别25.7、0.1百万美元。
- [Census原始全伙伴国工作簿](https://www.census.gov/foreign-trade/balance/country.xlsx)经现有受限文件transport读取HTTP200，按代码、年份和进口月列逐格证实120个待清理单元格均为零。1992-12 API请求204，未据此编造精确值；原1992及以前观测不改写。

## 已执行的有范围生产修复

用户明确授权处理四条；获取worker与calendar锁，以Serializable事务统一检查并修复：
1. 两条NBS保持instrumentId/code/模板引用，更新name/unit/metadata.scrape.key与subscription.sourceSeriesKey。40个历史值/条均保留。
2. 仅删除备份中的120个指定MacroObservation ID，限制精确instrumentId、obsDate>1992-12-01、value=0，并验证删除数量。保留所有非零历史及120条append-only版本记录（表示过去捕获的坏数据，不把它们当有效官方观测）。
3. 两条历史订阅保持disabled，nextRunAt=null，lastObsDate恢复1992-12-01；记录来源生命周期与生产审计事件。
4. 通过原NBS连接器有界force重试，两条均SKIPPED、inserted=changed=0；member/package nextRunAt均保持2026-11-16T02:03Z（北京时间10:03）。

完整before/after及被移除记录只留本机自动化目录，不上传HK或提交仓库。before备份SHA256：
`ca0102185354b36942349212b6b6c72c92e7ab7a13fa0eed34ac183741168a3d`。
记录ID/日期/值可从备份恢复，不需要用舍入网页值重建。未删除指标或改动系统模板。

## 代码防回退

- 复用audited-definitions离线seed，把两条旧ID映射到待售父级和正确单位，不依赖部署时源网站可达，也不改观测。
- 复用历史国家迁移，补全4350/4610的暂停及lastObsDate归整；不在部署seed自动删除历史。
- 回归测试明确两条旧NBS ID落在正确父级，区分投资额/待售面积单位；Census进口和出口都截止1992-12，截止期内真实零仍保留；后续元数据不能将历史代码重新启用；离线迁移重复执行无写入。
- 现有HK解析器已具备历史截止与父级识别保护；此变更用于持久化旧目录修正和回归测试。新代码合并部署状态另行报告，不将本次有范围数据修复等同整站部署。

审计账本追加四条修复裁定，保留原始discrepancy及当日500完成数，不重复ACK或篡改审计历史。

