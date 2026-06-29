# Prompt：宏观 Excel 历史导入 — 标准流程（`db:import-macro-xlsx`）

---

## 任务目标

将符合 **统一布局** 的 `.xlsx` 导入 PostgreSQL（`mds.Instrument` + `MacroObservation` + `MacroCategory`），并挂到 **宏观页 / 数据更新目录** 的正确国家与分类下。

**禁止**：把 Excel 当作持续更新来源重复导入；**禁止**跳过 preset 与验证；**禁止**未确认 Excel 布局就写库。

**参考实现**：`debtcap`（偿债能力）、`ism`（ISM 制造业 PMI）。

---

## 第〇部分：适用性判断（必须先做）

### 0.1 能用通用入口 `import-macro-xlsx` 的条件

| 检查项 | 要求 |
|--------|------|
| 首列标题 | `指标名称`（周期：2024-01、2024Q1 等） |
| 数据列头 | `国家:指标:子维度`（冒号分隔，至少 3 段） |
| 可选元数据行 | A 列标签 + 各列值：`指标英文名称`、`频率`、`单位` |
| 数据区 | 从首个可解析周期行开始，数值可转为 number |

**不符合**（须单独脚本或扩展 `macroWorkbookLayout.ts`）：

- Overview 宽表（`import-*-overview-xlsx.ts`）
- 黄金分析等特殊布局（`import-gold-analysis-xlsx.ts`）
- 列头无 `国家:指标:子维度` 结构

### 0.2 执行前向用户确认

1. xlsx **绝对路径**（Windows 用引号）
2. 数据集 **scope**（英文小写，如 `ism`、`debtcap`、`retail`）→ 决定 instrument code 前缀 `{scope}_{country}_…`
3. **宏观目录分类名** `catalogCategory`（如 `采购经理人指数`）— 出现在 **美国 → 该分类** 下
4. 默认 **频率 / 单位**（若 Excel 无「频率」「单位」行）
5. 导入后是否需要 **自动更新**（FRED / TE / 其他）— Excel 只导 **历史 bootstrap**

---

## 第一部分：Excel 自检（dry-run，不写库）

```powershell
npm run db:import-macro-xlsx -- --file="C:/path/数据.xlsx" --preset=ism --dry-run
# 或尚未有 preset 时：
npm run db:import-macro-xlsx -- --file="..." --scope=新scope --theme=主题中文名 --freq=月 --unit=指数 --dry-run
```

**dry-run 输出应包含**：

- 解析到的 **序列数**、**总观测点数**
- 每列：`instrument code` 预览、`catalogCategory`、频率、单位、点数、首尾日期
- 目录树路径：`国家宏观 → {国家} → {theme} → {指标} → {子维度}`

若解析失败或序列数为 0 → **停止**，先改 Excel 或 layout，不要写库。

---

## 第二部分：新增 preset（每个数据集一次）

编辑 `src/lib/data/xlsx/importPresets.ts`：

1. 复制 `MACRO_IMPORT_PRESET_TEMPLATE` 为新常量（如 `RETAIL_PRESET`）
2. 填写：

| 字段 | 说明 |
|------|------|
| `scope` | code 前缀，全局唯一 |
| `freqLabel` / `unit` | 默认值（列上无元数据行时使用） |
| `categoryThemeName` | DB 树第三层 theme 名称 |
| `countryCodeByZh` | 中文国名 → ISO-2（可复用 `DEFAULT_COUNTRY_CODE_BY_ZH`） |
| `metricCodeByZh` | 指标中文 → 英文 code 段 |
| `sectorCodeByZh` | 子维度中文 → 英文 code 段 |
| `catalogCategoryByMetricZh` | **宏观侧栏分类**（键=指标中文，值=分类名） |

3. 在 `resolveImportPreset()` 注册名称
4. 更新 `ImportPresetName` 类型与 `import-macro-xlsx.ts` 的错误提示中的 preset 列表

**instrument code 规则**（自动生成）：

```text
{scope}_{countryCode小写}_{metricCode}_{sectorCode}
例：ism_us_ism_headline
```

---

## 第三部分：正式导入

```powershell
npm run db:import-macro-xlsx -- --file="C:/path/数据.xlsx" --preset=ism
# 可选：--sheet=Sheet1
```

**策略**（脚本末尾会提示）：

- Excel = **一次性历史**（`metadata.bootstrapOnly: true`，除非已 probe 确认网络源）
- **不要**靠重复跑 import 做日常更新

---

## 第四部分：导入验证（必做）

```powershell
npm run db:verify-macro-import -- --prefix=ism_us_ --country=US --category=采购经理人指数
```

| 参数 | 说明 |
|------|------|
| `--prefix` | instrument code 前缀（必填） |
| `--country` | ISO-2，检查宏观目录该国是否存在 |
| `--category` | 可选；检查该分类下 mds 条目数是否与库内序列数一致 |
| `--expect-count` | 可选；期望序列条数 |
| `--min-points` | 可选；每条最少观测点数，默认 1 |

**通过标准**：

- [ ] 每条序列有点数、有 `catalogCategory`
- [ ] 若提供 `--category`，宏观目录该分类条目数 = 库内序列数
- [ ] 若有 `nameEn` 行，不应大量为空（除非业务允许）

---

## 第五部分：宏观目录可见性

`fredCatalog.ts` 的 `loadMdsCatalog` 会收录：

- 已知前缀（`debtcap_`、`ism_`、`usov_` 等）
- **`metadata.bootstrap === "excel"`** 的序列（新 scope 导入后自动出现在宏观页）

确认 **catalogCategory** 在 preset 里配对，避免落到默认「偿债能力」。

---

## 第六部分：自动更新（可选，Excel 导入后单独做）

若指标需进 **数据更新目录** 并自动拉数：

1. `npm run data:probe-sources` — 确认获取方式
2. 编写/运行 seed 脚本（参考 `data:seed-ism-te`、`data:seed-cpi`）
3. `npm run data:sync-calendar` — 有发布日历的指标
4. `npm run data:worker` — 试跑订阅

**Excel 导入不会** 创建 `DataSubscription`；须显式 seed。

---

## Agent 执行清单（复制勾选）

```
[ ] 0. 确认 xlsx 符合「国家:指标:子维度」布局
[ ] 1. dry-run 通过，序列数/点数合理
[ ] 2. importPresets.ts 新增并注册 preset
[ ] 3. npm run db:import-macro-xlsx -- --file=... --preset=...
[ ] 4. npm run db:verify-macro-import -- --prefix=... --country=... --category=...
[ ] 5. 浏览器宏观页 /admin/data-catalog 目视分类正确
[ ] 6. （可选）probe + seed 订阅 + sync-calendar
[ ] 7. PR 说明：scope、分类、条数、是否仅 bootstrap
```

---

## 关键文件

| 路径 | 职责 |
|------|------|
| `scripts/import-macro-xlsx.ts` | CLI 入口（`--dry-run`） |
| `src/lib/data/xlsx/macroWorkbookLayout.ts` | Excel 解析 |
| `src/lib/data/xlsx/importMacroWorkbook.ts` | 写 DB + MacroCategory 树 |
| `src/lib/data/xlsx/importPresets.ts` | 各数据集映射 |
| `scripts/verify-macro-import.ts` | 通用验证 |
| `src/lib/data/fredCatalog.ts` | 宏观侧栏目录（含 excel bootstrap） |

---

## 相关标准流程

- Excel 历史导入：[macro-xlsx-import.md](./macro-xlsx-import.md)
- TE 指标页抓取与日历调度：[te-indicator-scrape.md](./te-indicator-scrape.md)（前置：通常先完成 Excel 导入）

## 命令速查

```powershell
# 1. 预览
npm run db:import-macro-xlsx -- --file="C:/path/x.xlsx" --preset=ism --dry-run

# 2. 导入
npm run db:import-macro-xlsx -- --file="C:/path/x.xlsx" --preset=ism

# 3. 验证
npm run db:verify-macro-import -- --prefix=ism_us_ --country=US --category=采购经理人指数 --expect-count=8
```
