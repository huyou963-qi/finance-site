import type { SafeDataset } from "./catalog";

const FLOW = ["一、结汇", "二、售汇", "三、差额"];
const FORWARDS = ["四、远期结售汇签约额", "五、远期结售汇平仓额", "六、远期结售汇展期额", "七、本期末远期结售汇累计未到期额", "八、未到期期权Delta净敞口"];
const SECTORS = ["广义政府", "中央银行", "其他接受存款公司", "其他部门", "直接投资：公司间贷款", "外债总额头寸"];
const DEBT_LEAVES = ["SDR分配", "货币与存款", "债务证券", "贷款", "贸易信贷与预付款", "其他债务负债"];
const INTERCOMPANY_LEAVES = ["直接投资企业对直接投资者的债务负债", "直接投资者对直接投资企业的债务负债", "对关联企业的债务负债"];
const directions: Readonly<Record<string, string>> = { "Foreign exchange settlement": "结汇", "Foreign exchange sales": "售汇", Balance: "差额", "结汇": "结汇", "售汇": "售汇", "差额": "差额" };

/** Stateful per worksheet; identifiers still use original leaf labels/occurrences. */
export function createSafeHierarchy(dataset: SafeDataset) {
  let flow = "", sector = "", maturity = "", side = "";
  let codes = new Map<string, string>();
  return (label: string, secondary: string): string[] | undefined => {
    if (dataset === "settlement") {
      if (FLOW.includes(label)) { flow = label; return [label]; }
      if (FORWARDS.includes(label)) {
        // The second column is part of the source definition, not a unit/header.
        if (label === FORWARDS[4]) return [label];
        const direction = directions[secondary];
        if (!direction) throw new Error(`SAFE 远期行缺少明确结汇/售汇/差额方向：${label}`);
        return [label, direction];
      }
      if (!flow) return undefined;
      if (/^[一二三四五六七八九十]+、/.test(label)) throw new Error(`SAFE 未知结售汇父级：${label}`);
      return [flow, label];
    }
    if (dataset === "debt") {
      if (SECTORS.includes(label)) { sector = label; maturity = ""; return [sector]; }
      if (label === "长期" || label === "短期") { maturity = label; return sector ? [sector, maturity] : undefined; }
      if (sector === "直接投资：公司间贷款") return INTERCOMPANY_LEAVES.includes(label) ? [sector, label] : undefined;
      return sector && maturity && DEBT_LEAVES.includes(label) ? [sector, maturity, label] : undefined;
    }
    if (dataset === "iip") {
      if (["资产", "负债", "净头寸"].includes(label)) { side = label; codes = new Map(); return [side]; }
      const code = /^(\d+(?:\.[\da-z]+)*)\s+/.exec(label)?.[1];
      if (!side || !code) return undefined;
      codes.set(code, label);
      const parts = code.split("."), parents: string[] = [];
      const required: string[] = [];
      if (/^1\.[12]\.[ab]$/.test(code)) required.push("1", `1.${parts.at(-1)}`);
      else for (let i = 1; i < parts.length; i++) {
        const prefix = parts.slice(0, i).join(".");
        if (parts[i - 1] !== "0") required.push(prefix); // Official codes contain an unlabelled .0 level.
      }
      for (const prefix of required) {
        const parent = codes.get(prefix);
        if (!parent) throw new Error(`SAFE IIP 缺少父级 ${prefix}：${label}`);
        parents.push(parent);
      }
      return [side, ...parents, label];
    }
    return undefined;
  };
}

export function safePeriodSemantics(dataset: SafeDataset, sheet: string, leaf: string) {
  if (dataset === "settlement") {
    const stock = leaf.startsWith("七、") || leaf.startsWith("八、");
    if (sheet.includes("年度")) return stock ? "annual_stock_latest_or_year_end" : "annual_flow_ytd_or_full_year";
    return stock ? "period_end_stock" : "current_period_flow";
  }
  return "period_end_stock";
}

export function safeHierarchyDisplay(dataset: SafeDataset, sheet: string, path: readonly string[]) {
  const semantics = safePeriodSemantics(dataset, sheet, path[0] ?? "");
  const displaySheet = semantics === "annual_flow_ytd_or_full_year" ? sheet.replace("（年度）", "（年度：最新年度累计／历年全年）")
    : semantics === "annual_stock_latest_or_year_end" ? sheet.replace("（年度）", "（年度：最新披露期末／历年年末）") : sheet;
  return `${displaySheet}：${path.join("：")}`;
}
