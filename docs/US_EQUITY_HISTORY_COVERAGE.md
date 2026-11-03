# 美股行业历史财务补充

## 来源与计算口径

行业对应 Select Sector SPDR 的11只可交易 ETF。覆盖率仍以当前持仓回溯公司的历史财报为分母，不代表当年的指数成分或历史时点可见数据。

`secPredecessors.ts` 仅登记 SEC 文件确认的法定或会计前身，保留生效日和证据链接。前身仅补生效日前的 US-GAAP 事实；当前集团同标签、同区间的披露优先。不能将被收购公司、拆分前完整母公司或合并备考数据拼成现公司的历史。每家公司最多顺序请求两份前身 companyfacts。

归母净利润可由同一 accession、申报日、起止日的 `ProfitLoss - NetIncomeLossAttributableToNoncontrollingInterest` 得到；缺失少数股东损益不能推定为零。Philip Morris 旧营收仅在同期明确披露销售额和消费税时相减，并经原有两个非零重叠季度的同口径校验后向前补缺。

SEC [Financial Statement Data Sets](https://www.sec.gov/dera/data/financial-statement-data-sets) 的合并主报表可补 companyfacts 未公开的自定义标签。保留归档 URL、SHA-256、CIK、accession、申报日、报表类型、标签、表内行名和真实期间。严格排除关联公司和分部维度；仅 APA 的合并油气总收入、CMS 的现金建设支出允许已核实的精确维度。期间必须能与同一申报的 companyfacts 对齐，不按季度编号猜日期。SEC 的 NUM.ddate 会取最近月末（见官方 [字段说明](https://www.sec.gov/dera/data/fsds.pdf)）；准备器以相同规则关联原始申报中唯一的真实起止日，再保存真实日期，不能把月末化日期当作真实财季截止日。

地产资本开支按现金流表明确分列的必要组成项求和：PLD 的物业改造、开发及租赁资本支出；EQR 的房地产、非房地产及开发支出；VTR 的资本开支及开发支出；FRT 的其他及开发重建支出；KIM、CPT、DOC、ESS 同样要求其配置中的全部组成项同时有效。排除收购已运营物业、股权投资、未付资本开支和单独列示且混有联营企业的资本化利息。不同公司的资本化政策仍有差异。URI 的租赁及非租赁设备、Vertiv 的设备及资本化软件、Workday 自用地产项目亦须完整合计；新时期已明确合并披露的总行按对应口径使用。HOOD、WTW、GLW、ROP、INCY、MCHP、BAX 等旧新总支出标签只限发行人。单个改造子项不能充当总资本开支。PSA 按报表版本合计维护与开发现金支付，2019–2021同时支持“本期成本支付＋前期成本支付”的完整四项与重列后的两项；不把同名未付款脚注当现金。DTE 旧期要求公用与非公用支出两项，FANG 依据同期现金流表区分钻完井、基础设施、中游和其他设备，合并披露后才接受明确覆盖这些部分的总行。

Waters 早期季度若后续比较表改用月末别名，仅在营收一致、两个独立美元科目同起日同金额、原真实日期在120天内申报且月末别名晚至少一年出现时，才迁回原申报实际截止日；普通季度写入仍严格隔离不同实际报告期。

只在存量值与旧通用 PPE 单项完全匹配时纠正旧记录；完整组成无法核实时撤销该误标资本开支，审计记录包含前值。普通补空仍保留其他非空字段。仅在旧经营现金流与持续经营部分完全匹配、终止经营部分非零且新总额与两者之和一致时，纠正已证明的局部现金流；两项在同一行合并更新，防止时间戳检查相互冲突。日批解析也不再用已知局部单项覆盖完整数据。

## 财年末 TTM

营收换标签的历史拼接仅在重叠金额近似一致时接受，保留财报原金额；不再以重叠比例缩放旧年份。该门禁同样用于后续每日财报解析。此次普通补空不批量重写已有非空营收。

10-K 中完整十二个月或52/53周财年（360–374天门禁）可直接提供该真实财年末的 TTM，不需要人为拆分季度。年报优先于四季合计；其他季度仍须四季连续，且与实际财季截止日一致。年报不延用至其他季度，不补单季，不接收九个月、十一个月等过渡期。

复用 `EquityFundamentalSnapshot` 的 `FY12` 行，以 `FYYYYY-MM-DD` 为唯一期间标识，按真实截止日保存 `fiscalDate`、`asOf`，只补营收、归母净利润、经营现金流和资本开支。独立期间标识可容纳同一自然年中的两个完整年报窗口，且不会混入旧年度估值缓存。来源申报日留在源文件和审计，不伪装为首次披露日。旧年度同步继续更新原有 `FY` 缓存，不覆盖 `FY12`。

行业历史查询同时有界读取季度与已核实年报；图表 tooltip 标记直接采用年报的公司数。该补充仍是最新可得披露口径，不是 PIT 回测数据。

## 可复现的离线准备

在开发机建立独立工作目录，包含 `securities.json`（symbol、cik）、`facts/`（原始 companyfacts，前身命名 `CIK<number>.json`）、`archives/`（从 SEC 官方下载的 `YYYYqN.zip`）。不要在生产机下载或解压全市场归档。

```powershell
npx tsx scripts/equity/export-statement-policy.ts <workspace>/policy.json
python scripts/equity/scan-sec-statement-archives.py --workspace=<workspace>
python scripts/equity/prepare-sec-statement-facts.py --workspace=<workspace>
```

归档串行流式读取，最多48份、每份200MiB；本次26份约2.4GB，仅留开发机。扫描可恢复，记录归档摘要和策略指纹。准备器仅输出所选主体的带来源事实；写入器重新验证元数据和全部字段规则。`facts/` 也可提供已经按注册表合并的 `<symbol>-merged.json`，但准备器的期间对齐使用原始各主体申报，避免丢失原申报 accession。

## 有界生产入库

每批最多20家公司，每公司最多60个季度、14份年报，输入单份 companyfacts 最多40MiB、补充事实最多5MiB/8000点。先运行默认 dry-run，检查新的、唯一的审计文件；正式运行增加 `--apply`。各批使用不同审计文件，失败后可幂等重跑。纠正旧值须同时匹配实际报告期、旧金额和更新时间，遇到并发修改停止。

```bash
flock -w 30 /tmp/finance-sector-daily-disclosures.lock \
  timeout 600s nice -n 10 env NODE_OPTIONS=--max-old-space-size=384 \
  node --env-file=.env.local --import tsx scripts/equity/backfill-statement-facts.ts \
  --facts-dir=.data/<run>/facts --supplement-dir=.data/<run>/supplements \
  --symbols=PLD,EQR --from=2015Q1 --through=2025Q4 --audit=.data/<run>/dry-01.jsonl
```

反复 dry-run 的季度、年报、现金流纠正均应为零增量；相同年报输入不重复刷新更新时间。

不新增表、索引或常驻服务。年报查询与季度查询使用同一批40个代码，最多增加每公司约13行；进程内行业缓存继续保持11项/16MiB/5分钟上限。归档处理全部在开发机，生产只上传选定公司的原始事实和小型补充文件，串行写库。部署继续使用 CI 构建产物。离线管线检查：`python scripts/equity/test-statement-pipeline.py`，覆盖分部排除、月末化还原、期间歧义和旧输出清除。

生产验收比较全部11个行业、40个季度，分别报告补充与误标纠正造成的覆盖变化。

该离线归档路径用于历史补充，不改变每日披露调度。Valero 的 VIE 分区与递延检修资本化口径未完成全范围统一，不以旧单项现金支出增加覆盖。净额资产购置、混合股权投资及拆分前完整母公司也不直接补为同口径资本开支。

后续发行人新增自定义科目须再次核实；不能假设历史自定义标签会自动出现在 companyfacts。
