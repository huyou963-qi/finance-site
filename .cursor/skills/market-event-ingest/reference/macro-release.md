# AI 宏观发布事件检索

使用现有 MarketEvent、事件词表及 ingest，不要求先采购API或建设新调度系统。按用户给定的**发布日期**窗口检索；参考月份可能在窗口之前。截止日之后尚未发布的事件不能填写实际值。

## 范围与检索

默认美国；分月建立覆盖清单：CPI/核心CPI、就业报告（非农/失业率/时薪/修订）、PCE/核心PCE、ADP、ISM制造业/服务业、PPI、零售、GDP、初请/续请、JOLTS、消费者信心/通胀预期、工业生产、耐用品、住房、就业成本、区域联储调查及重要国债拍卖。FOMC/点阵图/纪要/记者会、Jackson Hole与主席重要讲话用既有政策/讲话词表，不制造数值一致预期。

AI 用搜索和公开报告查证，不以抓取整套商业日历数据库代替检索。实际值优先官方历史发布稿；调查预期可由当日Reuters/CNBC等原创报道、明确引用调查的银行报告，或公开发布的调查机构报告提供。两个转载同一通讯社稿件不是两个独立来源。

每条记录保存指标口径、参考期、首发实际、调查预期、单位、来源调查机构、证据URL。区分中位数/均值；不同调查的数值不平均拼接，分项之间也不能混用。缺失某个分项预期时保留实际与缺失说明，不补0。

## 一次报告一个事件

`eventType=macro.release`，`externalId=ai:macro-release:US:<发布日期>:<报告slug>:<参考期>`。同一报告的分项存 `payload.macroReleaseComponents`，主分项存 `payload.macroRelease`。报告身份 `payload.releaseIdentity` 包含报告slug和参考期，避免同日不同报告因共用新闻稿URL被合并。

国家US；资产至少挂 XAUUSD、GLD、GC=F、DX-Y.NYB、^TNX、TLT、IEF、SPY、QQQ（相关性不是固定利好/利空）。填写可核实的macroKeys，不新造指标。重要性独立于差值，核心发布HIGH，其他重要发布MEDIUM，特殊关键政策才CRITICAL。

正文用中文写参考期、各分项实际/预期/原始差值、修订及证据限制，避免复制来源长文。`sources` 必须同步保存至 `payload.sources`，因为现有入库只持久化payload里的证据。

## 预期证据的两种情况

1. 有明确发布前快照：填写真实 `consensusAsOf`（带时区），严格早于 `releaseAt`。
2. 只有发布周预览或当日发布后报道明确记载“调查原先预期”：填写 `consensusEvidenceType="contemporaneous-report"`，不编造 `consensusAsOf`；能确定文章发布时间则写 `consensusReportedAt`。它支持历史原始差值展示，**不宣称严格PIT**，不输入严格时点标准化评分。

共同字段：actual、consensus、unit、referencePeriod、releaseAt、consensusSource、consensusSourceUrl、actualSourceUrl、isInitialRelease（仅核实后true）。分项沿用同一证据格式，另加metricId、label与调查口径。无法核实首发时不提供macroRelease评分证据，使用 `payload.releaseResearch` 存已知事实和missingFields。

GDP初值、第二估计、第三估计分别标 `releaseStage`，actual取本次估计刚公布的值；不能把第三估计倒填为初值。分阶段身份进入releaseIdentity，历史标准化也不能把不同阶段混为同一序列。

发布时间可确认则用DATETIME，occurredAt与releaseAt一致；只有发布日期时用DATE，在releaseResearch里标时间未知，不猜8:30。原始预期差由程序计算，AI可解释分项方向；没有足够历史同口径误差时不标“几倍标准差”。

## 完成流程

每月/事件族查齐、记录缺口 → 库内查重 → 输出 `.data/ingest/US-macro-release-<from>_<to>.json` → validate → dry-run对账 → 复用正式import。用户要求形成站内事件时可按既有授权入库；回报明确生成/入库/缺口数量，不能把若干样本称为全覆盖。

范围很大时先完成核心报告全窗口，再补扩展族；保留月×报告覆盖账本与可续跑文件。上云沿用已有tar/scp/import，不提交大批研究JSON进Git。
