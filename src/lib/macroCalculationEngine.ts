import type {
  MacroAdvancedDerivedConfig,
  MacroDerivedCalc,
  MacroFrequencyAdjust,
  MacroMissingValueMethod,
  MacroResampleMethod,
  MacroSeriesCalcStep,
  MacroSeriesCalcOp,
} from "@/lib/data/macroPresetTemplates";
import { applyMacroSeriesOp } from "@/lib/data/macroSeriesTransform";
import {
  macroAlignPeriodKey,
  macroPeriodKeyFromDateLabel,
  sortMacroPeriodLabels,
} from "@/lib/macroPeriodLabel";

export type MacroCalculationSeries = {
  key: string;
  name: string;
  categories: string[];
  data: (number | null)[];
  unit?: string | null;
};

export type MacroCalculationDiagnostics = {
  inputPoints: Record<string, number>;
  filledPoints: Record<string, number>;
  alignedPoints: number;
  validPoints: number;
  droppedPoints: number;
  warnings: string[];
  outputUnit?: string;
  error?: string;
};

export type MacroFormulaFunction = {
  name: string;
  signature: string;
  description: string;
};

export const MACRO_FORMULA_FUNCTIONS: readonly MacroFormulaFunction[] = [
  { name: "IF", signature: "IF(condition, valueIfTrue, valueIfFalse)", description: "条件判断；比较成立返回第二个参数" },
  { name: "IFERROR", signature: "IFERROR(value, fallback)", description: "值为空或无效时使用备用值" },
  { name: "NA", signature: "NA()", description: "返回空值" },
  { name: "AND", signature: "AND(condition1, condition2, …)", description: "所有条件均成立时返回 1" },
  { name: "OR", signature: "OR(condition1, condition2, …)", description: "任一条件成立时返回 1" },
  { name: "NOT", signature: "NOT(condition)", description: "条件取反" },
  { name: "ABS", signature: "ABS(value)", description: "绝对值" },
  { name: "SQRT", signature: "SQRT(value)", description: "平方根，输入必须非负" },
  { name: "LOG", signature: "LOG(value)", description: "自然对数，输入必须大于 0" },
  { name: "EXP", signature: "EXP(value)", description: "自然指数" },
  { name: "MIN", signature: "MIN(value1, value2, …)", description: "取最小值" },
  { name: "MAX", signature: "MAX(value1, value2, …)", description: "取最大值" },
  { name: "AVG", signature: "AVG(value1, value2, …)", description: "算术平均值" },
  { name: "POW", signature: "POW(value, power)", description: "乘方" },
  { name: "ROUND", signature: "ROUND(value, digits)", description: "按指定小数位四舍五入" },
  { name: "CLAMP", signature: "CLAMP(value, lower, upper)", description: "把数值限制在上下界之间" },
  { name: "COALESCE", signature: "COALESCE(value1, value2, …)", description: "返回第一个有效值" },
] as const;

export type MacroCalculationResult = {
  categories: string[];
  data: (number | null)[];
  diagnostics: MacroCalculationDiagnostics;
};

function finite(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

export function resampleMacroSeries(
  categories: string[],
  data: (number | null)[],
  target: MacroFrequencyAdjust,
  method: MacroResampleMethod,
): { categories: string[]; data: (number | null)[] } {
  if (target === "keep") return { categories: [...categories], data: [...data] };
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < categories.length; i++) {
    const value = data[i];
    if (!finite(value)) continue;
    const bucket = macroPeriodKeyFromDateLabel(categories[i]!, target);
    const values = buckets.get(bucket) ?? [];
    values.push(value);
    buckets.set(bucket, values);
  }
  const outCategories = sortMacroPeriodLabels([...buckets.keys()]);
  return {
    categories: outCategories,
    data: outCategories.map((category) => {
      const values = buckets.get(category) ?? [];
      if (values.length === 0) return null;
      if (method === "start") return values[0] ?? null;
      if (method === "end") return values.at(-1) ?? null;
      if (method === "sum") return values.reduce((sum, value) => sum + value, 0);
      if (method === "min") return Math.min(...values);
      if (method === "max") return Math.max(...values);
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    }),
  };
}

export function fillMacroSeries(
  values: (number | null)[],
  method: MacroMissingValueMethod,
  maxGap: number,
): { values: (number | null)[]; filled: number } {
  const out = [...values];
  if (method === "none" || maxGap < 1) return { values: out, filled: 0 };
  let filled = 0;
  if (method === "forward") {
    let previous: number | null = null;
    let gap = 0;
    for (let i = 0; i < out.length; i++) {
      if (finite(out[i])) {
        previous = out[i]!;
        gap = 0;
      } else if (previous != null && ++gap <= maxGap) {
        out[i] = previous;
        filled++;
      }
    }
    return { values: out, filled };
  }
  if (method === "backward") {
    let next: number | null = null;
    let gap = 0;
    for (let i = out.length - 1; i >= 0; i--) {
      if (finite(out[i])) {
        next = out[i]!;
        gap = 0;
      } else if (next != null && ++gap <= maxGap) {
        out[i] = next;
        filled++;
      }
    }
    return { values: out, filled };
  }
  let index = 0;
  while (index < out.length) {
    if (finite(out[index])) {
      index++;
      continue;
    }
    const start = index;
    while (index < out.length && !finite(out[index])) index++;
    const length = index - start;
    const left = start > 0 ? out[start - 1] : null;
    const right = index < out.length ? out[index] : null;
    if (length > maxGap || !finite(left) || !finite(right)) continue;
    for (let offset = 0; offset < length; offset++) {
      out[start + offset] = left + ((right - left) * (offset + 1)) / (length + 1);
      filled++;
    }
  }
  return { values: out, filled };
}

function rollingMean(values: (number | null)[], window: number, minPeriods: number) {
  return values.map((_, index) => {
    const sample = values.slice(Math.max(0, index - window + 1), index + 1).filter(finite);
    if (sample.length < minPeriods) return null;
    return sample.reduce((sum, value) => sum + value, 0) / sample.length;
  });
}

function quantile(values: number[], probability: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = Math.min(1, Math.max(0, probability)) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower] ?? null;
  const fraction = position - lower;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * fraction;
}

function rollingQuantile(
  values: (number | null)[],
  window: number,
  minPeriods: number,
  probability: number,
) {
  return values.map((_, index) => {
    const observations = values
      .slice(Math.max(0, index - window + 1), index + 1)
      .filter(finite);
    return observations.length < minPeriods ? null : quantile(observations, probability);
  });
}

function handleOutliers(
  values: (number | null)[],
  step: Extract<MacroSeriesCalcStep, { type: "outlier" }>,
) {
  const observations = values.filter(finite);
  if (observations.length === 0) return [...values];
  const lower = step.method === "clip" ? step.lower : quantile(observations, step.lower);
  const upper = step.method === "clip" ? step.upper : quantile(observations, step.upper);
  if (!finite(lower) || !finite(upper) || lower > upper) return values.map(() => null);
  return values.map((value) => {
    if (!finite(value)) return null;
    if (step.method === "null") return value < lower || value > upper ? null : value;
    return Math.min(upper, Math.max(lower, value));
  });
}

function rollingZScore(
  values: (number | null)[],
  window: number,
  minPeriods: number,
  sample: boolean,
) {
  return values.map((value, index) => {
    if (!finite(value)) return null;
    const observations = values
      .slice(Math.max(0, index - window + 1), index + 1)
      .filter(finite);
    if (observations.length < minPeriods || observations.length < (sample ? 2 : 1)) return null;
    const mean = observations.reduce((sum, item) => sum + item, 0) / observations.length;
    const divisor = sample ? observations.length - 1 : observations.length;
    const variance = observations.reduce((sum, item) => sum + (item - mean) ** 2, 0) / divisor;
    const deviation = Math.sqrt(variance);
    return deviation === 0 ? null : (value - mean) / deviation;
  });
}

function rollingVolatility(
  categories: string[],
  values: (number | null)[],
  step: Extract<MacroSeriesCalcStep, { type: "volatility" }>,
) {
  const changed = applyMacroSeriesOp(categories, values, step.input as MacroSeriesCalcOp);
  return changed.map((_, index) => {
    const sample = changed.slice(Math.max(0, index - step.window + 1), index + 1).filter(finite);
    if (sample.length < step.minPeriods || sample.length < (step.sample ? 2 : 1)) return null;
    const mean = sample.reduce((sum, value) => sum + value, 0) / sample.length;
    const divisor = step.sample ? sample.length - 1 : sample.length;
    const variance = sample.reduce((sum, value) => sum + (value - mean) ** 2, 0) / divisor;
    const value = Math.sqrt(variance);
    return step.annualize ? value * Math.sqrt(step.periodsPerYear) : value;
  });
}

export function applyMacroSeriesSteps(
  categories: string[],
  data: (number | null)[],
  steps: readonly MacroSeriesCalcStep[],
): { categories: string[]; data: (number | null)[] } {
  let outCategories = [...categories];
  let outData = [...data];
  for (const step of steps) {
    if (step.type === "resample") {
      const sampled = resampleMacroSeries(outCategories, outData, step.frequency, step.method);
      outCategories = sampled.categories;
      outData = sampled.data;
    } else if (step.type === "transform") {
      outData = applyMacroSeriesOp(outCategories, outData, step.op);
    } else if (step.type === "rollingMean") {
      outData = rollingMean(outData, step.window, step.minPeriods);
    } else if (step.type === "zScore") {
      outData = rollingZScore(outData, step.window, step.minPeriods, step.sample);
    } else if (step.type === "rollingQuantile") {
      outData = rollingQuantile(outData, step.window, step.minPeriods, step.quantile);
    } else if (step.type === "outlier") {
      outData = handleOutliers(outData, step);
    } else if (step.type === "volatility") {
      outData = rollingVolatility(outCategories, outData, step);
    } else if (step.type === "fill") {
      outData = fillMacroSeries(outData, step.method, step.maxGap).values;
    } else if (step.type === "scale") {
      outData = outData.map((value) => (finite(value) ? value * step.factor : null));
    }
  }
  return { categories: outCategories, data: outData };
}

type Token = { type: "number" | "identifier" | "operator" | "punctuation"; value: string };
type Expr =
  | { type: "number"; value: number }
  | { type: "variable"; name: string }
  | { type: "unary"; op: "+" | "-"; value: Expr }
  | { type: "binary"; op: string; left: Expr; right: Expr }
  | { type: "call"; name: string; args: Expr[] };

function tokenizeFormula(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const whitespace = /^\s+/.exec(rest);
    if (whitespace) {
      index += whitespace[0].length;
      continue;
    }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(rest);
    if (number) {
      tokens.push({ type: "number", value: number[0] });
      index += number[0].length;
      continue;
    }
    const identifier = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (identifier) {
      tokens.push({ type: "identifier", value: identifier[0].toUpperCase() });
      index += identifier[0].length;
      continue;
    }
    const char = source[index]!;
    const comparison = /^(?:<=|>=|==|!=|<|>)/.exec(rest);
    if (comparison) {
      tokens.push({ type: "operator", value: comparison[0] });
      index += comparison[0].length;
      continue;
    }
    if ("+-*/^".includes(char)) tokens.push({ type: "operator", value: char });
    else if ("(),".includes(char)) tokens.push({ type: "punctuation", value: char });
    else throw new Error(`不支持的字符“${char}”`);
    index++;
  }
  return tokens;
}

class FormulaParser {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): Expr {
    const expression = this.parseComparison();
    if (this.index !== this.tokens.length) throw new Error("公式末尾存在无法解析的内容");
    return expression;
  }

  private parseComparison(): Expr {
    let left = this.parseAdditive();
    while (["<", "<=", ">", ">=", "==", "!="].some((operator) => this.peek(operator))) {
      const op = this.take().value;
      left = { type: "binary", op, left, right: this.parseAdditive() };
    }
    return left;
  }

  private peek(value?: string) {
    const token = this.tokens[this.index];
    return value == null ? token : token?.value === value ? token : undefined;
  }

  private take(value?: string) {
    const token = this.peek(value);
    if (!token) throw new Error(value ? `缺少“${value}”` : "公式不完整");
    this.index++;
    return token;
  }

  private parseAdditive(): Expr {
    let left = this.parseMultiplicative();
    while (this.peek("+") || this.peek("-")) {
      const op = this.take().value;
      left = { type: "binary", op, left, right: this.parseMultiplicative() };
    }
    return left;
  }

  private parseMultiplicative(): Expr {
    let left = this.parsePower();
    while (this.peek("*") || this.peek("/")) {
      const op = this.take().value;
      left = { type: "binary", op, left, right: this.parsePower() };
    }
    return left;
  }

  private parsePower(): Expr {
    let left = this.parseUnary();
    if (this.peek("^")) {
      const op = this.take().value;
      left = { type: "binary", op, left, right: this.parsePower() };
    }
    return left;
  }

  private parseUnary(): Expr {
    if (this.peek("+") || this.peek("-")) {
      return { type: "unary", op: this.take().value as "+" | "-", value: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const token = this.take();
    if (token.type === "number") return { type: "number", value: Number(token.value) };
    if (token.value === "(") {
      const expression = this.parseComparison();
      this.take(")");
      return expression;
    }
    if (token.type !== "identifier") throw new Error("此处需要数字、指标别名或函数");
    if (!this.peek("(")) return { type: "variable", name: token.value };
    this.take("(");
    const args: Expr[] = [];
    if (!this.peek(")")) {
      do {
        args.push(this.parseComparison());
        if (!this.peek(",")) break;
        this.take(",");
      } while (!this.peek(")"));
    }
    this.take(")");
    return { type: "call", name: token.value, args };
  }
}

function evaluateExpr(expression: Expr, values: Record<string, number | null>): number | null {
  if (expression.type === "number") return expression.value;
  if (expression.type === "variable") return values[expression.name] ?? null;
  if (expression.type === "unary") {
    const value = evaluateExpr(expression.value, values);
    return value == null ? null : expression.op === "-" ? -value : value;
  }
  if (expression.type === "binary") {
    const left = evaluateExpr(expression.left, values);
    const right = evaluateExpr(expression.right, values);
    if (!finite(left) || !finite(right)) return null;
    if (expression.op === "+") return left + right;
    if (expression.op === "-") return left - right;
    if (expression.op === "*") return left * right;
    if (expression.op === "/") return right === 0 ? null : left / right;
    if (expression.op === "<") return left < right ? 1 : 0;
    if (expression.op === "<=") return left <= right ? 1 : 0;
    if (expression.op === ">") return left > right ? 1 : 0;
    if (expression.op === ">=") return left >= right ? 1 : 0;
    if (expression.op === "==") return left === right ? 1 : 0;
    if (expression.op === "!=") return left !== right ? 1 : 0;
    return left ** right;
  }
  if (expression.name === "NA" && expression.args.length === 0) return null;
  if (expression.name === "IF" && expression.args.length === 3) {
    const condition = evaluateExpr(expression.args[0]!, values);
    if (!finite(condition)) return null;
    return evaluateExpr(condition !== 0 ? expression.args[1]! : expression.args[2]!, values);
  }
  if (expression.name === "IFERROR" && expression.args.length === 2) {
    const value = evaluateExpr(expression.args[0]!, values);
    return finite(value) ? value : evaluateExpr(expression.args[1]!, values);
  }
  const args = expression.args.map((arg) => evaluateExpr(arg, values));
  if (expression.name === "COALESCE") return args.find(finite) ?? null;
  if (expression.name === "AND" && args.length > 0) return args.every((value) => finite(value) && value !== 0) ? 1 : 0;
  if (expression.name === "OR" && args.length > 0) return args.some((value) => finite(value) && value !== 0) ? 1 : 0;
  if (expression.name === "NOT" && args.length === 1) return finite(args[0]) ? (args[0] === 0 ? 1 : 0) : null;
  if (!args.every(finite)) return null;
  const numbers = args as number[];
  if (expression.name === "ABS" && numbers.length === 1) return Math.abs(numbers[0]!);
  if (expression.name === "SQRT" && numbers.length === 1) return numbers[0]! >= 0 ? Math.sqrt(numbers[0]!) : null;
  if ((expression.name === "LOG" || expression.name === "LN") && numbers.length === 1) return numbers[0]! > 0 ? Math.log(numbers[0]!) : null;
  if (expression.name === "EXP" && numbers.length === 1) return Math.exp(numbers[0]!);
  if (expression.name === "POW" && numbers.length === 2) return numbers[0]! ** numbers[1]!;
  if (expression.name === "ROUND" && numbers.length === 2) {
    const digits = Math.min(12, Math.max(-12, Math.trunc(numbers[1]!)));
    const factor = 10 ** digits;
    return Math.round(numbers[0]! * factor) / factor;
  }
  if (expression.name === "CLAMP" && numbers.length === 3) {
    return Math.min(numbers[2]!, Math.max(numbers[1]!, numbers[0]!));
  }
  if (expression.name === "MIN" && numbers.length > 0) return Math.min(...numbers);
  if (expression.name === "MAX" && numbers.length > 0) return Math.max(...numbers);
  if ((expression.name === "AVG" || expression.name === "AVERAGE") && numbers.length > 0) {
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  }
  throw new Error(`不支持的函数 ${expression.name} 或参数数量不正确`);
}

export function validateMacroFormula(formula: string, aliases: readonly string[]): string | null {
  try {
    if (formula.length > 500) throw new Error("公式不能超过 500 个字符");
    const expression = new FormulaParser(tokenizeFormula(formula)).parse();
    const allowed = new Set(aliases.map((alias) => alias.toUpperCase()));
    const visit = (node: Expr): void => {
      if (node.type === "variable" && !allowed.has(node.name)) throw new Error(`未知指标别名 ${node.name}`);
      if (node.type === "unary") visit(node.value);
      if (node.type === "binary") {
        visit(node.left);
        visit(node.right);
      }
      if (node.type === "call") {
        node.args.forEach(visit);
        evaluateExpr(node, Object.fromEntries([...allowed].map((alias) => [alias, 1])));
      }
    };
    visit(expression);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "公式无效";
  }
}

function normalizeUnit(unit: string | null | undefined): string | null {
  const value = unit?.trim();
  if (!value || value === "-" || value === "—") return null;
  if (/^(%|％|percent)$/i.test(value)) return "%";
  if (/^(bp|bps|基点)$/i.test(value)) return "bp";
  return value.replace(/\s+/g, " ").toLowerCase();
}

function displayUnit(unit: string | null | undefined): string | null {
  const normalized = normalizeUnit(unit);
  if (normalized === "%") return "%";
  if (normalized === "bp") return "bp";
  return unit?.trim() || null;
}

type FormulaUnitResult = {
  outputUnit: string | null;
  warnings: string[];
  error?: string;
};

function analyzeFormulaUnitNode(
  expression: Expr,
  units: ReadonlyMap<string, string | null>,
  warnings: string[],
): string | null {
  if (expression.type === "number") return null;
  if (expression.type === "variable") return units.get(expression.name) ?? null;
  if (expression.type === "unary") return analyzeFormulaUnitNode(expression.value, units, warnings);
  if (expression.type === "binary") {
    const left = analyzeFormulaUnitNode(expression.left, units, warnings);
    const right = analyzeFormulaUnitNode(expression.right, units, warnings);
    if (expression.op === "+" || expression.op === "-") {
      if (left && right && normalizeUnit(left) !== normalizeUnit(right)) {
        warnings.push(`公式中的${expression.op === "+" ? "相加" : "相减"}项单位不一致：${left} 与 ${right}`);
        return null;
      }
      return left ?? right;
    }
    if (["<", "<=", ">", ">=", "==", "!="].includes(expression.op)) {
      if (left && right && normalizeUnit(left) !== normalizeUnit(right)) {
        warnings.push(`比较项单位不一致：${left} 与 ${right}`);
      }
      return null;
    }
    if (expression.op === "*") {
      if (!left) return right;
      if (!right) return left;
      return `${left}·${right}`;
    }
    if (expression.op === "/") {
      if (!right) return left;
      if (left && normalizeUnit(left) === normalizeUnit(right)) return null;
      return left ? `${left}/${right}` : `1/${right}`;
    }
    if (right) warnings.push(`幂指数带有单位 ${right}，请确认公式含义`);
    return left;
  }
  const argUnits = expression.args.map((arg) => analyzeFormulaUnitNode(arg, units, warnings));
  if (expression.name === "NA" || expression.name === "AND" || expression.name === "OR" || expression.name === "NOT") return null;
  if (expression.name === "IF") {
    const left = argUnits[1] ?? null;
    const right = argUnits[2] ?? null;
    if (left && right && normalizeUnit(left) !== normalizeUnit(right)) {
      warnings.push(`IF 的两个返回分支单位不一致：${left} 与 ${right}`);
      return null;
    }
    return left ?? right;
  }
  if (expression.name === "IFERROR") return argUnits[0] ?? argUnits[1] ?? null;
  if (expression.name === "LOG" || expression.name === "LN" || expression.name === "EXP") {
    if (argUnits[0]) warnings.push(`${expression.name} 的输入带有单位 ${argUnits[0]}，通常应先标准化`);
    return null;
  }
  if (expression.name === "SQRT") return argUnits[0] ? `√${argUnits[0]}` : null;
  if (expression.name === "POW") return argUnits[0] ?? null;
  if (["MIN", "MAX", "AVG", "AVERAGE", "COALESCE", "CLAMP"].includes(expression.name)) {
    const known = argUnits.filter((unit): unit is string => Boolean(unit));
    if (known.length > 1 && known.some((unit) => normalizeUnit(unit) !== normalizeUnit(known[0]))) {
      warnings.push(`${expression.name} 的参数单位不一致：${[...new Set(known)].join("、")}`);
      return null;
    }
    return known[0] ?? null;
  }
  if (expression.name === "ROUND") return argUnits[0] ?? null;
  return argUnits[0] ?? null;
}

export function inspectMacroFormula(
  formula: string,
  inputs: readonly { alias: string; unit?: string | null }[],
): FormulaUnitResult {
  const validation = validateMacroFormula(formula, inputs.map((input) => input.alias));
  if (validation) return { outputUnit: null, warnings: [], error: validation };
  try {
    const expression = new FormulaParser(tokenizeFormula(formula)).parse();
    const warnings: string[] = [];
    const units = new Map(
      inputs.map((input) => [input.alias.toUpperCase(), displayUnit(input.unit)] as const),
    );
    const inferredUnit = analyzeFormulaUnitNode(expression, units, warnings);
    const uniqueWarnings = [...new Set(warnings)];
    const allInputsHaveUnits = inputs.length > 0 && inputs.every((input) => Boolean(displayUnit(input.unit)));
    const outputUnit = inferredUnit ?? (allInputsHaveUnits && uniqueWarnings.length === 0 ? "无量纲" : null);
    return { outputUnit, warnings: uniqueWarnings };
  } catch (error) {
    return {
      outputUnit: null,
      warnings: [],
      error: error instanceof Error ? error.message : "公式无效",
    };
  }
}

function rank(values: number[]) {
  const indexed = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length);
  for (let start = 0; start < indexed.length; ) {
    let end = start + 1;
    while (end < indexed.length && indexed[end]!.value === indexed[start]!.value) end++;
    const averageRank = (start + end - 1) / 2 + 1;
    for (let i = start; i < end; i++) ranks[indexed[i]!.index] = averageRank;
    start = end;
  }
  return ranks;
}

function correlation(left: number[], right: number[], method: "pearson" | "spearman") {
  const x = method === "spearman" ? rank(left) : left;
  const y = method === "spearman" ? rank(right) : right;
  const xMean = x.reduce((sum, value) => sum + value, 0) / x.length;
  const yMean = y.reduce((sum, value) => sum + value, 0) / y.length;
  let covariance = 0;
  let xVariance = 0;
  let yVariance = 0;
  for (let i = 0; i < x.length; i++) {
    const xd = x[i]! - xMean;
    const yd = y[i]! - yMean;
    covariance += xd * yd;
    xVariance += xd * xd;
    yVariance += yd * yd;
  }
  const denominator = Math.sqrt(xVariance * yVariance);
  return denominator === 0 ? null : covariance / denominator;
}

function covariance(left: number[], right: number[], sample: boolean) {
  if (left.length !== right.length || left.length < (sample ? 2 : 1)) return null;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  const numerator = left.reduce(
    (sum, value, index) => sum + (value - leftMean) * (right[index]! - rightMean),
    0,
  );
  return numerator / (sample ? left.length - 1 : left.length);
}

function beta(left: number[], right: number[], sample: boolean) {
  const cov = covariance(left, right, sample);
  if (cov == null) return null;
  const mean = right.reduce((sum, value) => sum + value, 0) / right.length;
  const divisor = sample ? right.length - 1 : right.length;
  const variance = right.reduce((sum, value) => sum + (value - mean) ** 2, 0) / divisor;
  return variance === 0 ? null : cov / variance;
}

type RegressionFit = {
  coefficients: number[];
  intercept: number;
  rSquared: number | null;
};

function solveLinearSystem(matrix: number[][], vector: number[]) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]!]);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(augmented[row]![column]!) > Math.abs(augmented[pivot]![column]!)) pivot = row;
    }
    if (Math.abs(augmented[pivot]![column]!) < 1e-12) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot]!, augmented[column]!];
    const divisor = augmented[column]![column]!;
    for (let index = column; index <= size; index++) augmented[column]![index] = augmented[column]![index]! / divisor;
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = augmented[row]![column]!;
      for (let index = column; index <= size; index++) {
        augmented[row]![index] = augmented[row]![index]! - factor * augmented[column]![index]!;
      }
    }
  }
  return augmented.map((row) => row[size]!);
}

function fitRegression(rows: number[][], dependent: number[], includeIntercept: boolean): RegressionFit | null {
  if (rows.length !== dependent.length || rows.length === 0 || rows[0]?.length === 0) return null;
  const design = rows.map((row) => includeIntercept ? [1, ...row] : [...row]);
  const width = design[0]!.length;
  if (design.length < width + 1) return null;
  const xtx = Array.from({ length: width }, () => Array.from({ length: width }, () => 0));
  const xty = Array.from({ length: width }, () => 0);
  for (let row = 0; row < design.length; row++) {
    for (let left = 0; left < width; left++) {
      xty[left] += design[row]![left]! * dependent[row]!;
      for (let right = 0; right < width; right++) {
        xtx[left]![right] += design[row]![left]! * design[row]![right]!;
      }
    }
  }
  const solved = solveLinearSystem(xtx, xty);
  if (!solved) return null;
  const intercept = includeIntercept ? solved[0]! : 0;
  const coefficients = includeIntercept ? solved.slice(1) : solved;
  const mean = dependent.reduce((sum, value) => sum + value, 0) / dependent.length;
  let residualSum = 0;
  let totalSum = 0;
  for (let row = 0; row < rows.length; row++) {
    const predicted = intercept + rows[row]!.reduce((sum, value, index) => sum + value * coefficients[index]!, 0);
    residualSum += (dependent[row]! - predicted) ** 2;
    totalSum += (dependent[row]! - mean) ** 2;
  }
  return {
    coefficients,
    intercept,
    rSquared: totalSum === 0 ? null : 1 - residualSum / totalSum,
  };
}

function alignedCalendar(
  maps: Map<string, number | null>[],
  leftCategories: string[],
  join: MacroAdvancedDerivedConfig["alignment"]["join"],
) {
  if (join === "left") return sortMacroPeriodLabels([...new Set(leftCategories.map(macroAlignPeriodKey))]);
  if (join === "inner") {
    const first = maps[0] ? [...maps[0].keys()] : [];
    return sortMacroPeriodLabels(first.filter((key) => maps.every((map) => finite(map.get(key)))));
  }
  const union = new Set<string>();
  maps.forEach((map) => map.forEach((_, key) => union.add(key)));
  return sortMacroPeriodLabels([...union]);
}

export function evaluateAdvancedMacroCalculation(
  config: MacroAdvancedDerivedConfig,
  seriesByKey: ReadonlyMap<string, MacroCalculationSeries>,
): MacroCalculationResult {
  const warnings: string[] = [];
  const inputPoints: Record<string, number> = {};
  const filledPoints: Record<string, number> = {};
  const prepared = config.inputs.map((input) => {
    const source = seriesByKey.get(input.key);
    if (!source) throw new Error(`找不到输入指标 ${input.key}`);
    inputPoints[input.alias] = source.data.filter(finite).length;
    const sampled = resampleMacroSeries(
      source.categories,
      source.data,
      config.alignment.frequency,
      input.resampleMethod,
    );
    const map = new Map<string, number | null>();
    sampled.categories.forEach((category, index) => map.set(macroAlignPeriodKey(category), sampled.data[index] ?? null));
    return { input, sampled, map, unit: source.unit ?? null };
  });
  const emptyDiagnostics = (): MacroCalculationDiagnostics => ({
    inputPoints,
    filledPoints,
    alignedPoints: 0,
    validPoints: 0,
    droppedPoints: 0,
    warnings,
  });
  if (prepared.length === 0) {
    return { categories: [], data: [], diagnostics: { ...emptyDiagnostics(), error: "至少需要一个输入指标" } };
  }
  const categories = alignedCalendar(
    prepared.map((item) => item.map),
    prepared[0]!.sampled.categories,
    config.alignment.join,
  );
  const valuesByAlias: Record<string, (number | null)[]> = {};
  for (const item of prepared) {
    const values = categories.map((category) => item.map.get(category) ?? null);
    const filled = fillMacroSeries(values, item.input.fillMethod, item.input.maxGap);
    valuesByAlias[item.input.alias.toUpperCase()] = filled.values;
    filledPoints[item.input.alias] = filled.filled;
    if (item.input.fillMethod === "backward" || item.input.fillMethod === "linear") {
      warnings.push(`${item.input.alias} 使用了可能包含前视信息的${item.input.fillMethod === "linear" ? "线性插值" : "后向填充"}`);
    }
  }
  let data: (number | null)[] = [];
  let error: string | undefined;
  let outputUnit: string | undefined;
  try {
    if (config.kind === "formula") {
      const formula = config.formula?.trim() || "";
      const aliases = config.inputs.map((input) => input.alias);
      const validation = validateMacroFormula(formula, aliases);
      if (validation) throw new Error(validation);
      const expression = new FormulaParser(tokenizeFormula(formula)).parse();
      const inspection = inspectMacroFormula(
        formula,
        prepared.map((item) => ({ alias: item.input.alias, unit: item.unit })),
      );
      warnings.push(...inspection.warnings);
      outputUnit = inspection.outputUnit ?? undefined;
      data = categories.map((_, index) =>
        evaluateExpr(
          expression,
          Object.fromEntries(Object.entries(valuesByAlias).map(([alias, values]) => [alias, values[index] ?? null])),
        ),
      );
    } else if (config.kind === "correlation") {
      const correlationConfig = config.correlation;
      if (!correlationConfig || config.inputs.length < 2) throw new Error("滚动统计至少需要两个输入指标");
      const metric = correlationConfig.metric ?? "correlation";
      const leftAlias = config.inputs[0]!.alias.toUpperCase();
      const rightAlias = config.inputs[1]!.alias.toUpperCase();
      let left = valuesByAlias[leftAlias] ?? [];
      let right = valuesByAlias[rightAlias] ?? [];
      if (correlationConfig.input !== "level") {
        left = applyMacroSeriesOp(categories, left, correlationConfig.input);
        right = applyMacroSeriesOp(categories, right, correlationConfig.input);
      }
      const laggedLeft = left.map((_, index) => left[index - correlationConfig.lag] ?? null);
      data = categories.map((_, index) => {
        const start = Math.max(0, index - correlationConfig.window + 1);
        const x: number[] = [];
        const y: number[] = [];
        for (let i = start; i <= index; i++) {
          if (finite(laggedLeft[i]) && finite(right[i])) {
            x.push(laggedLeft[i]!);
            y.push(right[i]!);
          }
        }
        if (x.length < correlationConfig.minPeriods) return null;
        if (metric === "covariance") return covariance(x, y, correlationConfig.sample !== false);
        if (metric === "beta") return beta(x, y, correlationConfig.sample !== false);
        return correlation(x, y, correlationConfig.method);
      });
      const leftUnit = prepared[0]?.unit ?? null;
      const rightUnit = prepared[1]?.unit ?? null;
      if (metric === "covariance" && leftUnit && rightUnit) outputUnit = `${leftUnit}·${rightUnit}`;
      if (metric === "beta" && leftUnit && rightUnit && normalizeUnit(leftUnit) !== normalizeUnit(rightUnit)) {
        outputUnit = `${leftUnit}/${rightUnit}`;
      }
    } else {
      const regressionConfig = config.regression;
      if (!regressionConfig || config.inputs.length < 2) throw new Error("回归至少需要因变量 A 和一个解释变量 B");
      const aliases = config.inputs.map((input) => input.alias.toUpperCase());
      const transformed = aliases.map((alias) => {
        const values = valuesByAlias[alias] ?? [];
        return regressionConfig.input === "level"
          ? values
          : applyMacroSeriesOp(categories, values, regressionConfig.input);
      });
      const dependent = transformed[0]!.map((_, index) => transformed[0]![index - regressionConfig.lag] ?? null);
      const predictors = transformed.slice(1);
      data = categories.map((_, index) => {
        const start = Math.max(0, index - regressionConfig.window + 1);
        const rows: number[][] = [];
        const target: number[] = [];
        for (let rowIndex = start; rowIndex <= index; rowIndex++) {
          const y = dependent[rowIndex];
          const row = predictors.map((values) => values[rowIndex] ?? null);
          if (finite(y) && row.every(finite)) {
            target.push(y);
            rows.push(row as number[]);
          }
        }
        const minimum = Math.max(
          regressionConfig.minPeriods,
          predictors.length + (regressionConfig.includeIntercept ? 2 : 1),
        );
        if (rows.length < minimum) return null;
        const fit = fitRegression(rows, target, regressionConfig.includeIntercept);
        if (!fit) return null;
        if (regressionConfig.output === "coefficient") return fit.coefficients[0] ?? null;
        if (regressionConfig.output === "intercept") return fit.intercept;
        if (regressionConfig.output === "rSquared") return fit.rSquared;
        const currentPredictors = predictors.map((values) => values[index] ?? null);
        const currentDependent = dependent[index];
        if (!currentPredictors.every(finite)) return null;
        const fitted = fit.intercept + (currentPredictors as number[]).reduce(
          (sum, value, predictorIndex) => sum + value * fit.coefficients[predictorIndex]!,
          0,
        );
        if (regressionConfig.output === "fitted") return fitted;
        return finite(currentDependent) ? currentDependent - fitted : null;
      });
      const dependentUnit = prepared[0]?.unit ?? null;
      const firstPredictorUnit = prepared[1]?.unit ?? null;
      if (regressionConfig.output === "coefficient" && dependentUnit && firstPredictorUnit) {
        outputUnit = normalizeUnit(dependentUnit) === normalizeUnit(firstPredictorUnit)
          ? undefined
          : `${dependentUnit}/${firstPredictorUnit}`;
      } else if (["intercept", "fitted", "residual"].includes(regressionConfig.output) && dependentUnit) {
        outputUnit = dependentUnit;
      }
      warnings.push("回归结果描述统计关系，不代表因果关系；窗口过短或高度共线会使估计不稳定");
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "计算失败";
    data = categories.map(() => null);
  }
  const validPoints = data.filter(finite).length;
  return {
    categories,
    data,
    diagnostics: {
      inputPoints,
      filledPoints,
      alignedPoints: categories.length,
      validPoints,
      droppedPoints: categories.length - validPoints,
      warnings: [...new Set(warnings)],
      ...(outputUnit ? { outputUnit } : {}),
      ...(error ? { error } : {}),
    },
  };
}

export function macroDerivedDependencies(calc: MacroDerivedCalc): string[] {
  const keys = calc.advanced?.inputs.map((input) => input.key) ?? [calc.leftKey, calc.rightKey];
  return [...new Set(keys
    .filter((key) => key.startsWith("calc:"))
    .map((key) => key.slice("calc:".length))
    .filter(Boolean))];
}

/**
 * 按派生指标依赖关系排序；定义在数组中的位置不再决定执行结果。
 * 循环节点单独返回，调用方应跳过它们并在编辑器中提示。
 */
export function sortMacroDerivedCalculations(calculations: readonly MacroDerivedCalc[]): {
  ordered: MacroDerivedCalc[];
  cyclicIds: string[];
} {
  const active = calculations.filter((calc) => !calc.disabled);
  const byId = new Map(active.map((calc) => [calc.id, calc]));
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const cyclic = new Set<string>();
  const ordered: MacroDerivedCalc[] = [];

  const visit = (id: string) => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "visiting") {
      const cycleStart = stack.lastIndexOf(id);
      stack.slice(Math.max(0, cycleStart)).forEach((item) => cyclic.add(item));
      cyclic.add(id);
      return;
    }
    const calc = byId.get(id);
    if (!calc) return;
    state.set(id, "visiting");
    stack.push(id);
    for (const dependency of macroDerivedDependencies(calc)) visit(dependency);
    stack.pop();
    state.set(id, "done");
    ordered.push(calc);
  };

  active.forEach((calc) => visit(calc.id));
  return {
    ordered: ordered.filter((calc) => !cyclic.has(calc.id)),
    cyclicIds: [...cyclic],
  };
}
