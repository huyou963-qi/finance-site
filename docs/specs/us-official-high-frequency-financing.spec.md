# 美国周度融资余额接入（精简版）

2026-11-01按用户修正：只需要周频/月频的总余额及变化，不需要逐笔、日频发行量、发行笔数或期限桶。本批从20条收敛为4条周度余额，探测周期从6小时调整为168小时。

## 接入标准与范围

遵循 `AGENTS.md` 宏观基础库约束、`DATA_SCHEDULER_ONBOARD.md` 六步入库、`DATA_CATALOG_TAXONOMY.md` 目录标准以及 `DATA_FOUNDATION_REUSE_PRINCIPLES.md` 单一底层要求。

本批只新增美联储官方商业票据周度余额，通过既有FRED适配器、标准scheduler、统一writer和版本账本读取/入库。技术传输免费，需要服务器现有 `FRED_API_KEY`。不新建表、不写自算的余额变化或月末快照、不修改现有系统模板。

| 官方序列 | FRED ID | 原生频率 | 单位 |
|---|---|---|---|
| 全市场商业票据余额 | COMPUTN | 周三期末 | 十亿美元 |
| 非金融企业商业票据余额 | COMPAPER | 周三期末 | 十亿美元 |
| 金融企业商业票据余额 | FINCPN | 周三期末 | 十亿美元 |
| 资产支持商业票据余额 | ABCOMPN | 周三期末 | 十亿美元 |

全部未季调。Instrument code 为 `sched_fred_<id>`，目录key为 `fred:<id>`。官方生产机构是Federal Reserve Board，原始信息来自DTCC；该口径是商业票据，不等于长期公司债或美国企业全部融资。

来源：[美联储说明](https://www.federalreserve.gov/releases/cp/about.htm)、[官方余额表](https://www.federalreserve.gov/releases/cp/outstanding.htm)、[FRED发布86](https://fred.stlouisfed.org/release?rid=86)。本批没有二次采集器，也不依赖调整中的旧DDP下载服务。

## 目录与更新

目录为 **美国 → 利率与信用市场 → 商业票据发行与余额（周频）**。

- `fredCatalog.ts` 登记四条可见目录项，`usCatalogTaxonomy.ts` 配置业务位置，global layout构建器按频率重建；每末端最多48条。
- 唯一发布包 `us.frb.commercial_paper_outstanding`，4个成员；发布包与订阅均为 `probe_interval:168小时`。
- 官方通常周四公布周三余额。本方案按用户要求每周拉取一次，不承诺紧贴周四首发，正常情况下可能滞后不到一个探测周期。
- 首次回填原生周频全历史，不下载日频文件；稳态只读取最近24个月，捕获修订。4条每周4次观测请求；既有发布证明检查可能另有少量元数据请求。
- 复用现有每5分钟运行的worker调度到期订阅，失败沿用退避；不新增cron。
- 仅首次从旧6小时方案转换时重新排期；重复seed保留168小时方案已有nextRunAt和订阅ID。
- 周变化采用相邻周官方余额之差；月度展示取月内最后可用周值，并标明实际周三日期，它不是官方自然月末余额。均在既有指标运算/展示层计算，不入库为新基础序列。

## 其他融资类别

- 政府债务继续复用项目已有总量序列；本批撤下新加的4条DTS日发行/偿还订阅，不新增日频采集。不能把已有季度总债务改名成月度，周/月末展示也不得伪称新的官方原生频率。
- FINRA融资余额继续复用已有官方月度序列；其月变化放在指标运算。
- IPO继续复用已有Ritter月度家数/表现；项目尚无已验收的官方IPO募集金额总量，本批不从逐笔SEC文件新建汇总宏观订阅。
- 长期公司债继续复用已有美联储Z.1季度原始余额/净发行；不冒称存在已接入的官方周/月频完整融资总量。

## 撤回旧日频草案

`seed-us-financing`只定位本任务的12条商业票据日发行期限桶和4条DTS日发行/偿还code：先停止订阅，再删除无观测且无vintage的空定义。有历史观测/vintage的定义保留、禁用订阅，不删除历史事实。两个旧日频发布包停止排期。本任务没有改动项目其他既有日频数据源。

源码删除本批DTS扩展、期限桶定义与日频发布包；不再随部署重新创建它们。保留标准发布包脚本的可选 `--packages=` 定向入口，复用正常成员挂接逻辑。

## 命令与验收

```bash
npm run data:seed-us-financing
npm run data:rebuild-global-catalog-layout -- --dry-run
npm run data:rebuild-global-catalog-layout
npm run data:sync-us-financing
npm run data:verify-us-financing -- --db --live
```

SEED/VERIFY注册表已挂接，正常`data:apply`自动纳入。`--definitions-only`只验定义/订阅/目录位置，不是历史观测验收；正常`--db`要求非空观测、最新官方周数据不超过21日，并确认本批日频订阅不再启用。

本轮本地库完成4条周度定义与1个发布包，撤下16条空日频定义；生产库未修改。原始历史数据仍未回填：当前环境无FRED_API_KEY，官方出口白名单尚未实际修改。用户已授权，但本会话工具没有更改环境网络配置的入口。所需实际出口为 `api.stlouisfed.org`；财政、SEC、拍卖的日频域名不再是本批运行依赖。

本地测试仅验证代码和定义，不用模拟数值代替真实历史，不声称生产已上线。

精简后实际验证：1294项测试全部通过（0失败），schema/lint/脚本类型检查及生产构建通过；4条周序列在实际目录中可见；本地16条空日频定义已删除、旧日频发布包停用；重复seed后4条周订阅ID、168小时规则及nextRunAt不变。以上不代表官方历史回填或生产部署验收。
