# Agent E — 验证与验收（qa-verifier）

> 输入：状态 `template-ready` 的 Spec。
> 职责：对一个维度的**数据 + 模板 + 文档**做端到端验证，产出验收报告交评审 3。
> 完成标准：Spec §6 全部勾选、负面清单已更新，状态改 `verified`。

## 验证矩阵

### 1. 构建与静态检查

```powershell
npm run lint
npm run build     # 先停占用 Prisma 引擎的 node 进程
```

### 2. 数据层

```powershell
npm run data:verify -- --catalog=<dim> -- --db
npm run data:verify-catalog
npm run data:sync-calendar
```

- 逐条指标出表：code / 首观测 / 末观测 / 条数 / acquisitionStatus / nextRunAt / 更新状态；
- 末观测日期滞后 > 1 个发布周期的标红说明原因；
- 抓取源额外跑一次 `data:sync-one -- <code>` 确认幂等（重复跑 rowsUpserted=0）。

### 3. 模板渲染（dev 起服务目视 + 截图）

- 宏观页 → 新文件夹 → 逐模板加载：四图全部有数、无空槽；
- 轴与单位：双轴序列各归其轴；% 与水平值不混轴；
- 频率对齐：日频序列月均后与月频序列同期对齐（抽查表格最近 3 期无拆行）；
- calc 正确性：每模板抽 1 条 yoy 序列，用源站原值手算核对一期；
- 模板介绍 Tab：description + 图 1–4 chartIntroNotes 完整显示。

### 4. 规范与一致性

- **零重复**：新 layout 的全部 fredId/key 与其他 layout 交叉 grep，重复即 FAIL；
- docs / layout / prompt 三处指标清单一致（显示名 + key）；
- `git diff main --stat` 复核：只新增文件 + 约定的注册点 append，未触碰现有模板 id、migration、`MacroSection.tsx`；
- 管理端 `/admin/data-catalog`：三列齐全、状态非「不可自动更新」。

### 5. 收尾更新（验收通过后执行）

- `docs/specs/USED-INDICATORS.md` 追加本维度全部指标（含"首次占用 ISM"这类状态翻转）；
- AGENTS.md 若新增了 npm scripts，补一行引用；
- Spec §0 状态改 `verified`，§6 全勾，评审记录追加一行。

## 报告格式（评审 3 提交物）

1. **结论一句话**：PASS / FAIL + 阻塞项数量；
2. 数据层指标表（上文 §2 的表）；
3. 模板截图（每模板 1 张全景）；
4. 规范检查结果（零重复 / 三处一致 / diff 范围）；
5. 遗留问题清单（非阻塞项，如"某序列源端滞后 2 天属正常发布节奏"）。

## 原则

- 验证不通过就打回对应 Agent（数据问题 → B/C；图表/文案 → D），**本 Agent 不顺手修改代码**，避免验收与实现混责；
- 报告如实：跳过的检查明确写「未执行 + 原因」，不默认通过。
