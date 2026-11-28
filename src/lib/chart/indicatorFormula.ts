import { ema } from "./technicalIndicators";

type Series = Float64Array;
type Expr =
  | { kind: "number"; value: number }
  | { kind: "name"; name: string }
  | { kind: "binary"; op: string; left: Expr; right: Expr }
  | { kind: "call"; name: string; args: Expr[]; periods: number[] };

type OutputStyle = { plot: "line" | "histogram" | "signed"; color?: string };
type Statement = { name: string; expr: Expr; output?: OutputStyle };
export type IndicatorProgram = {
  statements: Statement[];
  outputs: (OutputStyle & { name: string })[];
};

export const MAX_FORMULA_LENGTH = 4000;
const MAX_TOKENS = 600;
const MAX_OUTPUTS = 8;
const MAX_PERIOD = 500;
type Field = "OPEN" | "HIGH" | "LOW" | "CLOSE" | "VOL";
const FIELDS = new Map<string, Field>([
  ["OPEN", "OPEN"], ["O", "OPEN"], ["HIGH", "HIGH"], ["H", "HIGH"],
  ["LOW", "LOW"], ["L", "LOW"], ["CLOSE", "CLOSE"], ["C", "CLOSE"],
  ["VOL", "VOL"], ["V", "VOL"], ["VOLUME", "VOL"],
] as const);
type FormulaInputs = Partial<Record<Field, readonly number[]>>;
const FUNCTIONS = {
  MA: 2, EMA: 2, SMA: 3, RMA: 2, SUM: 2, HHV: 2, LLV: 2, REF: 2,
  ABS: 1, MAX: 2, MIN: 2, IF: 3, CROSS: 2, COUNT: 2, NZ: 2,
} as const;

const COLORS = new Map([
  ["COLORRED", "#ef4444"], ["COLORGREEN", "#16a34a"], ["COLORBLUE", "#2563eb"],
  ["COLORYELLOW", "#b45309"], ["COLORMAGENTA", "#db2777"],
  ["COLORCYAN", "#0891b2"], ["COLORWHITE", "#94a3b8"], ["COLORBLACK", "#0f172a"],
]);

const PRECEDENCE = new Map([
  ["OR", 1], ["AND", 2], ["=", 3], ["==", 3], ["!=", 3], ["<>", 3],
  ["<", 3], ["<=", 3], [">", 3], [">=", 3], ["+", 4], ["-", 4], ["*", 5], ["/", 5],
]);

export type FormulaDiagnostic = {
  line: number;
  column: number;
  code: "syntax" | "unknown" | "duplicate" | "arguments" | "period" | "style" | "output" | "limit";
  detail?: string;
};

type Token = { value: string; index: number };
const IDENTIFIER = /^[A-Z_][A-Z0-9_]*$/;
const NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

function binaryValue(op: string, a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/": return b === 0 ? NaN : a / b;
    case ">": return Number(a > b);
    case ">=": return Number(a >= b);
    case "<": return Number(a < b);
    case "<=": return Number(a <= b);
    case "=":
    case "==": return Number(a === b);
    case "!=":
    case "<>": return Number(a !== b);
    case "AND": return Number(a !== 0 && b !== 0);
    case "OR": return Number(a !== 0 || b !== 0);
    default: return NaN;
  }
}

function constant(expr: Expr, constants: Map<string, number>): number {
  if (expr.kind === "number") return expr.value;
  if (expr.kind === "name") return constants.get(expr.name) ?? NaN;
  if (expr.kind === "binary") return binaryValue(expr.op, constant(expr.left, constants), constant(expr.right, constants));
  return NaN;
}

export function compileIndicatorFormula(source: string):
  | { ok: true; program: IndicatorProgram }
  | { ok: false; error: FormulaDiagnostic } {
  const errorAt = (token: Token, code: FormulaDiagnostic["code"], detail?: string): never => {
    const lines = source.slice(0, token.index).split("\n");
    throw { line: lines.length, column: lines.at(-1)!.length + 1, code, detail } satisfies FormulaDiagnostic;
  };
  const tokens: Token[] = [];
  const eof = { value: "", index: source.length };
  let cursor = 0;
  const peek = () => tokens[cursor] ?? eof;
  const take = () => { const token = peek(); cursor++; return token; };
  const expect = (value: string) => {
    const token = take();
    if (token.value !== value) errorAt(token, "syntax", value);
  };
  const names = new Set<string>();
  const constants = new Map<string, number>();

  function parseExpression(min = 1): Expr {
    const token = take();
    const value = token.value;
    let left: Expr;
    if (value === "(") {
      left = parseExpression();
      expect(")");
    } else if (value === "-" || value === "+") {
      left = { kind: "binary", op: "*", left: { kind: "number", value: value === "-" ? -1 : 1 }, right: parseExpression(6) };
    } else if (NUMBER.test(value) && Number.isFinite(Number(value))) {
      left = { kind: "number", value: Number(value) };
    } else if (IDENTIFIER.test(value)) {
      if (peek().value === "(") {
        if (!Object.hasOwn(FUNCTIONS, value)) errorAt(token, "unknown", value);
        take();
        const args: Expr[] = [];
        if (peek().value !== ")") {
          do {
            args.push(parseExpression());
            if (peek().value !== ",") break;
            take();
          } while (true);
        }
        expect(")");
        if (args.length !== FUNCTIONS[value as keyof typeof FUNCTIONS]) errorAt(token, "arguments", value);
        const periods: number[] = [];
        if (["MA", "EMA", "SMA", "RMA", "SUM", "HHV", "LLV", "REF", "COUNT"].includes(value)) {
          const period = constant(args[1]!, constants);
          const minPeriod = value === "REF" || value === "SUM" ? 0 : 1;
          if (!Number.isInteger(period) || period < minPeriod || period > MAX_PERIOD) errorAt(token, "period", value);
          periods.push(period);
          if (value === "SMA") {
            const weight = constant(args[2]!, constants);
            if (!Number.isInteger(weight) || weight < 1 || weight > period) errorAt(token, "period", value);
            periods.push(weight);
          }
        }
        left = { kind: "call", name: value, args: args.slice(0, args.length - periods.length), periods };
      } else {
        if (!FIELDS.has(value) && !names.has(value)) errorAt(token, "unknown", value);
        left = { kind: "name", name: value };
      }
    } else {
      return errorAt(token, "syntax", value);
    }
    while ((PRECEDENCE.get(peek().value) ?? 0) >= min) {
      const op = take().value;
      left = { kind: "binary", op, left, right: parseExpression(PRECEDENCE.get(op)! + 1) };
    }
    return left;
  }

  try {
    if (source.length > MAX_FORMULA_LENGTH) errorAt(eof, "limit");
    const pattern = /\s+|\{[^}]*\}|\/\/[^\n]*|[a-z_][a-z0-9_]*|(?:\d+(?:\.\d*)?|\.\d+)|#[\da-f]{6}|:=|>=|<=|==|!=|<>|[():;,=<>+*/-]|./gi;
    for (const match of source.matchAll(pattern)) {
      if (/^(?:\s|\{[^}]*\}$|\/\/)/.test(match[0])) continue;
      tokens.push({ value: match[0].toUpperCase(), index: match.index });
      if (tokens.length > MAX_TOKENS) errorAt(tokens.at(-1)!, "limit");
    }
    const statements: Statement[] = [];
    const outputs: IndicatorProgram["outputs"] = [];
    while (peek().value) {
      const token = take();
      const name = token.value;
      if (!IDENTIFIER.test(name)) errorAt(token, "syntax", name);
      if (FIELDS.has(name) || names.has(name) || Object.hasOwn(FUNCTIONS, name) || PRECEDENCE.has(name)) {
        errorAt(token, "duplicate", name);
      }
      const assignment = take();
      if (assignment.value !== ":" && assignment.value !== ":=") errorAt(assignment, "syntax", ": / :=");
      const expr = parseExpression();
      let output: OutputStyle | undefined;
      if (assignment.value === ":") {
        output = { plot: "line" };
        while (peek().value === ",") {
          take();
          const style = take();
          const color = COLORS.get(style.value) ?? (/^#[\dA-F]{6}$/.test(style.value) ? style.value : undefined);
          if (color) output.color = color;
          else if (style.value === "LINE") output.plot = "line";
          else if (style.value === "HIST") output.plot = "histogram";
          else if (style.value === "COLORSTICK") output.plot = "signed";
          else errorAt(style, "style", style.value);
        }
        outputs.push({ name, ...output });
        if (outputs.length > MAX_OUTPUTS) errorAt(token, "limit");
      }
      if (peek().value) expect(";");
      statements.push({ name, expr, output });
      names.add(name);
      const value = constant(expr, constants);
      if (Number.isFinite(value)) constants.set(name, value);
    }
    if (!outputs.length) errorAt(eof, "output");
    return { ok: true, program: { statements, outputs } };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) return { ok: false, error: error as FormulaDiagnostic };
    throw error;
  }
}

function rolling(x: Series, period: number, op: "SUM" | "MA" | "COUNT" | "HHV" | "LLV"): Series {
  const out = new Float64Array(x.length).fill(NaN);
  const extreme = op === "HHV" || op === "LLV";
  const deque = extreme ? new Int32Array(x.length) : null;
  let front = 0, back = 0, sum = 0, valid = 0;
  for (let i = 0; i < x.length; i++) {
    const current = x[i]!;
    if (!Number.isFinite(current)) {
      valid = 0;
      sum = 0;
      front = back = 0;
      continue;
    }
    valid++;
    if (deque) {
      while (front < back && deque[front]! <= i - period) front++;
      while (front < back && (op === "HHV" ? x[deque[back - 1]!]! <= current : x[deque[back - 1]!]! >= current)) back--;
      deque[back++] = i;
      if (valid >= period) out[i] = x[deque[front]!]!;
    } else {
      sum += op === "COUNT" ? Number(current !== 0) : current;
      if (period && valid > period) sum -= op === "COUNT" ? Number(x[i - period] !== 0) : x[i - period]!;
      if (valid >= period) out[i] = op === "MA" ? sum / period : sum;
    }
  }
  return out;
}

function smooth(x: Series, period: number, op: string, weight?: number): Series {
  const alpha = (weight ?? 1) / period;
  let previous = NaN, total = 0, count = 0;
  return x.map(value => {
    if (!Number.isFinite(value)) {
      previous = NaN;
      total = count = 0;
      return NaN;
    }
    if (Number.isFinite(previous)) {
      previous += alpha * (value - previous);
    } else if (op === "RMA") {
      total += value;
      if (++count === period) previous = total / period;
    } else {
      previous = value;
    }
    return previous;
  });
}

export function evaluateIndicatorFormula(program: IndicatorProgram, inputs: FormulaInputs, length: number): Map<string, Series> {
  const values = new Map<string, Series>();
  for (const field of new Set(FIELDS.values())) {
    const data = inputs[field];
    values.set(field, Float64Array.from({ length }, (_, i) => data?.[i] ?? NaN));
  }

  function evaluate(expr: Expr): Series {
    if (expr.kind === "number") return new Float64Array(length).fill(expr.value);
    if (expr.kind === "name") return values.get(FIELDS.get(expr.name) ?? expr.name)!;
    if (expr.kind === "binary") {
      const a = evaluate(expr.left);
      const b = evaluate(expr.right);
      return a.map((value, i) => binaryValue(expr.op, value, b[i]!));
    }
    const [a, b, c] = expr.args.map(evaluate);
    const [period, weight] = expr.periods;
    const x = a!;
    switch (expr.name) {
      case "MA": case "SUM": case "COUNT": case "HHV": case "LLV":
        return rolling(x, period!, expr.name);
      case "EMA": return Float64Array.from(ema(x, period!));
      case "SMA": case "RMA":
        return smooth(x, period!, expr.name, weight);
      case "REF": return x.map((_, i) => x[i - period!] ?? NaN);
      case "ABS": return x.map(Math.abs);
      case "NZ": return x.map((value, i) => Number.isFinite(value) ? value : b![i]!);
      case "MAX": return x.map((value, i) => Math.max(value, b![i]!));
      case "MIN": return x.map((value, i) => Math.min(value, b![i]!));
      case "IF": return x.map((value, i) => Number.isFinite(value) ? (value !== 0 ? b![i]! : c![i]!) : NaN);
      case "CROSS": return x.map((value, i) => {
        const other = b![i]!;
        const prev = x[i - 1]!;
        const prevOther = b![i - 1]!;
        if (![value, other, prev, prevOther].every(Number.isFinite)) return NaN;
        return Number(value > other && prev <= prevOther);
      });
      default: throw new Error("Uncompiled indicator function");
    }
  }

  const outputs = new Map<string, Series>();
  for (const { name, expr, output } of program.statements) {
    const series = evaluate(expr);
    values.set(name, series);
    if (output) outputs.set(name, series);
  }
  return outputs;
}
