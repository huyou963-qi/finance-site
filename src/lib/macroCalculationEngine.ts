import type {
  MacroAdvancedDerivedConfig,
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
};

export type MacroCalculationDiagnostics = {
  inputPoints: Record<string, number>;
  filledPoints: Record<string, number>;
  alignedPoints: number;
  validPoints: number;
  droppedPoints: number;
  warnings: string[];
  error?: string;
};

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
    const expression = this.parseAdditive();
    if (this.index !== this.tokens.length) throw new Error("公式末尾存在无法解析的内容");
    return expression;
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
      const expression = this.parseAdditive();
      this.take(")");
      return expression;
    }
    if (token.type !== "identifier") throw new Error("此处需要数字、指标别名或函数");
    if (!this.peek("(")) return { type: "variable", name: token.value };
    this.take("(");
    const args: Expr[] = [];
    if (!this.peek(")")) {
      do {
        args.push(this.parseAdditive());
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
    return left ** right;
  }
  const args = expression.args.map((arg) => evaluateExpr(arg, values));
  if (expression.name === "COALESCE") return args.find(finite) ?? null;
  if (!args.every(finite)) return null;
  const numbers = args as number[];
  if (expression.name === "ABS" && numbers.length === 1) return Math.abs(numbers[0]!);
  if (expression.name === "SQRT" && numbers.length === 1) return numbers[0]! >= 0 ? Math.sqrt(numbers[0]!) : null;
  if ((expression.name === "LOG" || expression.name === "LN") && numbers.length === 1) return numbers[0]! > 0 ? Math.log(numbers[0]!) : null;
  if (expression.name === "EXP" && numbers.length === 1) return Math.exp(numbers[0]!);
  if (expression.name === "POW" && numbers.length === 2) return numbers[0]! ** numbers[1]!;
  if (expression.name === "MIN" && numbers.length > 0) return Math.min(...numbers);
  if (expression.name === "MAX" && numbers.length > 0) return Math.max(...numbers);
  if ((expression.name === "AVG" || expression.name === "AVERAGE") && numbers.length > 0) {
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  }
  throw new Error(`不支持的函数 ${expression.name} 或参数数量不正确`);
}

export function validateMacroFormula(formula: string, aliases: readonly string[]): string | null {
  try {
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
    return { input, sampled, map };
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
  try {
    if (config.kind === "formula") {
      const formula = config.formula?.trim() || "";
      const aliases = config.inputs.map((input) => input.alias);
      const validation = validateMacroFormula(formula, aliases);
      if (validation) throw new Error(validation);
      const expression = new FormulaParser(tokenizeFormula(formula)).parse();
      data = categories.map((_, index) =>
        evaluateExpr(
          expression,
          Object.fromEntries(Object.entries(valuesByAlias).map(([alias, values]) => [alias, values[index] ?? null])),
        ),
      );
    } else {
      const correlationConfig = config.correlation;
      if (!correlationConfig || config.inputs.length < 2) throw new Error("相关性至少需要两个输入指标");
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
        return x.length >= correlationConfig.minPeriods
          ? correlation(x, y, correlationConfig.method)
          : null;
      });
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
      ...(error ? { error } : {}),
    },
  };
}
