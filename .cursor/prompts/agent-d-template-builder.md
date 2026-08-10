# Agent D — 模板构建（template-builder）

> 输入：状态 `data-ready` 的 Spec（数据已入库或已核验可复用、评审 2 通过）。
> 职责：按 Spec §2/§4 构建内置分析模板 + 介绍文案 + 配套文档。
> 完成标准：Spec §6「模板」段可勾选，状态改 `template-ready`。

## 蓝本

逐文件模仿 CPI 域：`cpiAnalysisLayout.ts`（结构最干净）→ `macroPresetTemplates.ts` 注册段 → 对应国家分析文档 → 对应国家 prompt。中国新模板使用 `cn-<dimension>AnalysisLayout.ts`、`folder-builtin-cn-<dimension>`、`builtin-cn-<dimension>-*`、`docs/CN_<DIM>_ANALYSIS.md`、`.cursor/prompts/cn-<dim>-analysis-framework.md`；`chinaOverviewLayout.ts` 仅作 legacy Excel 兼容参考，不复用其 `chov_*` 序列。

## 执行步骤

### 1. `src/lib/data/<dim>AnalysisLayout.ts`

- 定义 `<Dim>AnalysisSeriesDef[]`：每条含 `virtualKey / fredId(或 mds code) / displayName / panel(1–4) / axis / chartType / color / calcOp / resampleToMonth?`，值全部来自 Spec §3。
- virtualKey 规范：FRED 变换序列 `fred:<ID>::yoy|mom|avg`（`cpiFredKey()` 模式）；库内序列 `mds:<code>`。
- `buildXxxSeriesCalcConfigMap()`：calcOp → `MacroSeriesCalcConfig`（月频 yoy/pctChange 用 `frequency:"month"`, `resampleMethod:"end"`；日频进月图用 `frequency:"month"` + `"avg"`）。
- `buildXxxBuiltinTemplate()` 产出与国家一致的 `BUILTIN_<COUNTRY>_<DIM>_...` 常量，含：
  - `description`（Spec §4.1）；
  - `chartIntroNotes`：key 为 slotIndex 字符串 `"0"–"3"`，内容按 Spec §4.2（图级分析顺序，**不写** `indicatorIntroNotes` 逐指标展开——与 CPI 先例一致）；
  - `displayConfig.slotTitles` 与 Spec §2 图槽表一致。

### 2. 注册 `macroPresetTemplates.ts`（只 append）

- import 新 layout 的导出并加入 re-export 列表；
- `DEFAULT_BUILTIN_TEMPLATE_FOLDERS` 追加与 Spec §0 一致的文件夹 id（中国为 `folder-builtin-cn-<dimension>`）；
- `DEFAULT_BUILTIN_TEMPLATE_FOLDER_IDS` 追加各模板 id → 文件夹映射；
- 模板列表合并处照 CPI 模式追加（全局搜 `BUILTIN_US_CPI_TEMPLATES` 的每个使用点，逐点补新域）。

### 3. 配色与图型规范

- 沿用现有色板（从既有 layout 取色：红 `#ef6461`、蓝 `#5f76b8`、橙 `#d89b4e`、青 `#6ccad1`、灰 `#8f9bab`、深蓝 `#3e4d83`…），同图内序列颜色可区分；
- 环比/增量类用 `bar`，水平/同比用 `line`，参考线类（利差、阈值）可用右轴；
- 一图双轴时 Spec §2 已标注 left/right，量纲差异大才用右轴。

### 4. 文档双件套（与代码同 PR）

- `docs/<COUNTRY>_<DIM>_ANALYSIS.md`：结构照 `US_CPI_ANALYSIS.md` —— 分析层级表 / 模板链条表 / 每模板图槽表 / 分析顺序摘要 / 决策树 / 变动率与时间轴规则 / 每期 checklist；
- `.cursor/prompts/<country>-<dim>-analysis-framework.md`：照 `us-cpi-analysis-framework.md` 体例；
- 文档首行写「本文档与宏观页内置模板、`<dim>AnalysisLayout.ts`、prompt 保持一致」。

## 硬约束

- **零重复**：动手前将 Spec §3 逐条对照 `docs/specs/USED-INDICATORS.md`；发现重复回报 Agent A，不得擅自复制。
- 不改任何现有模板 id / layout 文件 / `MacroSection.tsx` 结构 / migration。
- 模板 JSON 里只引用**已入库且 verify 通过**的序列 key；缺数据的槽位不许用占位序列顶替。
- 中文显示名与 seed catalog 的 `displayName` 一致（目录、图例、文档三处同名）。

## 自检（提交评审 3 前）

- [ ] `npm run build` + `npm run lint` 通过
- [ ] dev 起服务，宏观页文件夹出现新模板、四图有数、模板介绍 Tab 文案完整
- [ ] 每张图人工核对一个数据点与 FRED/源站一致
- [ ] docs / layout / prompt 三处指标清单一致（显示名 + key 逐条对）
