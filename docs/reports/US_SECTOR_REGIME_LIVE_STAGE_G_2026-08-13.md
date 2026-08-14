# 美国行业 Regime 真实前瞻账本 · Stage G

日期：2026-08-13  
协议：`stage-g-v1`  
模型：`stage-f-2026-08-13-v1`

## 结论

阶段 G 已经把“历史研究”与“真实未来验证”物理分开。系统现在先冻结完整输入、模型、11 行业排序和哈希，随后只在 3/6/12 个月自然到期时一次性写入行业与 SPY 的复权收益。旧预测不能随宏观修订、因子更新或代码变化被重写。

这提升的是研究过程的可信度，不是模型预测力。过程完整性记为 B；统计证据仍为 C，因为阶段 F 的历史模型选择使用了最新修订宏观值，而且当前真实前瞻样本只有 1 个、成熟结果为 0。

## 首次落库

| 项目 | 结果 |
|------|------|
| 数据归属月 | 2026-07-13 |
| 正式冻结 | 2026-08-13 |
| 开始计分 | 2026-08-14（冻结日次日起第一根可得收盘） |
| 冻结判断 | 33 条：3期限 × 11行业 |
| 3月到期 | 2026-11-14 |
| 6月到期 | 2027-02-14 |
| 12月到期 | 2027-08-14 |
| 当前结果 | 33 条全部 pending；没有历史收益回填 |
| 信号哈希 | `addbf4c874732bd9835994841b1b9c65536acade94426b20a368a7e174b9f9b8` |

3 月模型是阶段 F 验证集唯一通过的 Regime+基本面排序，计入主要证据；6/12 月验证没有候选模型通过，Regime 基线只做失败复核。

## 宏观版本链

首次同步 1998-01-01 至 2026-08-13 的 FRED/ALFRED 版本：

| 序列 | 版本数 |
|------|-------:|
| CPIAUCSL | 1,855 |
| INDPRO | 29,439 |
| PAYEMS | 7,335 |
| PCEPI | 7,594 |
| W875RX1 | 5,594 |
| USREC（只作 overlay） | 162 |
| 合计 | 51,979 |

FRED 官方把 real-time period 定义为一条信息在何时为真或为市场所知；`series/observations` 的 `output_type=3` 返回新增和修订观测，`series/vintagedates` 返回数据发生新增或修订的日期。[FRED real-time periods](https://fred.stlouisfed.org/docs/api/fred/realtime_period.html)、[series/observations](https://fred.stlouisfed.org/docs/api/fred/series_observations.html)、[series/vintagedates](https://fred.stlouisfed.org/docs/api/fred/series_vintagedates.html)

ISM 制造业/服务业目前没有同等接口的历史 vintage，因此不倒填伪版本；数据 worker 从接入日起在新增或值变化时自动追加快照。

## 不可回写契约

1. `signalDate + modelVersion` 唯一；重复运行返回既有快照，并比较新计算哈希是否漂移。
2. `returnStartDate` 必须不早于冻结日，当前规则固定从冻结日次日开始。
3. 到期 evaluator 仅更新 `evaluatedAt IS NULL` 的行；预测字段永远不变。
4. 数据库约束要求 entry/exit、行业收益、SPY 收益、超额收益、结果哈希与 evaluatedAt 全空或全齐。
5. 横截面未全部结算前不计算 IC，避免拿部分结果提前挑结论。
6. 修改模型或协议必须启用新版本，与旧 cohort 并行，不迁移旧快照。

## 评分与升级

每个成熟横截面同时报告 Spearman IC、Top 3 正超额胜率、Top 3 平均超额和 Top−Bottom。预注册正式复评点是 36 个独立月度冻结信号；达到 36 只触发复评，不保证升级。置信区间、方向、Top 3 收益和命中率仍须同时满足既定门槛。

## 运行

```bash
npm run data:sync-regime-vintages -- --start=1998-01-01
npm run equity:run-sector-regime-ledger
npm run equity:verify-sector-stage-g
```

生产环境应每日运行前两项并告警：任务缺跑、官方 vintage 覆盖下降、信号哈希漂移、到期后价格缺失。下一阶段只做自动化和连续观察，不利用尚未成熟的结果调模型。
