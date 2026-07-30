/**
 * 安全表达式解析与求值：仅允许 symbol token 与 + - * / 括号。
 * 禁止 Function / eval。
 */

export type ExprAst =
  | { type: "symbol"; name: string }
  | { type: "binary"; op: "+" | "-" | "*" | "/"; left: ExprAst; right: ExprAst }
  | { type: "unary"; op: "-"; arg: ExprAst };

export type ParseExprResult =
  | { ok: true; ast: ExprAst; symbols: string[] }
  | { ok: false; error: string };

type Tok =
  | { kind: "sym"; value: string }
  | { kind: "op"; value: "+" | "-" | "*" | "/" }
  | { kind: "lp" }
  | { kind: "rp" };

const SYM_RE = /^[A-Za-z][A-Za-z0-9.-]{0,11}$/;

function tokenize(input: string): { ok: true; tokens: Tok[] } | { ok: false; error: string } {
  const tokens: Tok[] = [];
  let i = 0;
  const s = input.trim();
  if (!s) return { ok: false, error: "表达式为空" };
  while (i < s.length) {
    const ch = s[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lp" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rp" });
      i++;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ kind: "op", value: ch });
      i++;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let j = i + 1;
      while (j < s.length && /[A-Za-z0-9.-]/.test(s[j]!)) j++;
      const name = s.slice(i, j);
      if (!SYM_RE.test(name)) {
        return { ok: false, error: `非法标的「${name}」` };
      }
      tokens.push({ kind: "sym", value: name.toUpperCase() });
      i = j;
      continue;
    }
    return { ok: false, error: `无法识别的字符「${ch}」` };
  }
  return { ok: true, tokens };
}

function collectSymbols(ast: ExprAst): string[] {
  const set = new Set<string>();
  const walk = (n: ExprAst) => {
    if (n.type === "symbol") set.add(n.name);
    else if (n.type === "unary") walk(n.arg);
    else {
      walk(n.left);
      walk(n.right);
    }
  };
  walk(ast);
  return [...set];
}

function parseTokens(tokens: Tok[]): ParseExprResult {
  let pos = 0;
  const peek = () => tokens[pos];
  const take = () => tokens[pos++];

  function parseExpr(): ExprAst {
    let left = parseTerm();
    for (;;) {
      const t = peek();
      if (t?.kind !== "op" || (t.value !== "+" && t.value !== "-")) break;
      take();
      const right = parseTerm();
      left = { type: "binary", op: t.value, left, right };
    }
    return left;
  }

  function parseTerm(): ExprAst {
    let left = parseUnary();
    for (;;) {
      const t = peek();
      if (t?.kind !== "op" || (t.value !== "*" && t.value !== "/")) break;
      take();
      const right = parseUnary();
      left = { type: "binary", op: t.value, left, right };
    }
    return left;
  }

  function parseUnary(): ExprAst {
    const t = peek();
    if (t?.kind === "op" && t.value === "-") {
      take();
      return { type: "unary", op: "-", arg: parseUnary() };
    }
    return parsePrimary();
  }

  function parsePrimary(): ExprAst {
    const t = peek();
    if (!t) throw new Error("表达式不完整");
    if (t.kind === "sym") {
      take();
      return { type: "symbol", name: t.value };
    }
    if (t.kind === "lp") {
      take();
      const inner = parseExpr();
      if (peek()?.kind !== "rp") throw new Error("缺少右括号");
      take();
      return inner;
    }
    throw new Error("期望标的或左括号");
  }

  try {
    const ast = parseExpr();
    if (pos !== tokens.length) {
      return { ok: false, error: "表达式末尾有多余内容" };
    }
    return { ok: true, ast, symbols: collectSymbols(ast) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "解析失败" };
  }
}

/** 去掉可选的 `| index100` 后缀（transform 由 Layer 字段处理） */
export function stripExprTransformSuffix(expr: string): {
  expr: string;
  transformHint: "index100" | null;
} {
  const m = expr.trim().match(/^(.*?)\s*\|\s*index100\s*$/i);
  if (m) return { expr: m[1]!.trim(), transformHint: "index100" };
  return { expr: expr.trim(), transformHint: null };
}

export function parseLayerExpression(input: string): ParseExprResult {
  const { expr } = stripExprTransformSuffix(input);
  const tok = tokenize(expr);
  if (!tok.ok) return tok;
  return parseTokens(tok.tokens);
}

export function listSymbolsInExpression(input: string): string[] {
  const parsed = parseLayerExpression(input);
  return parsed.ok ? parsed.symbols : [];
}

/** 在给定 symbol→value 映射下求值；缺值或除零返回 null。 */
export function evalExprAst(
  ast: ExprAst,
  values: Record<string, number | null | undefined>,
): number | null {
  if (ast.type === "symbol") {
    const v = values[ast.name];
    if (v == null || !Number.isFinite(v)) return null;
    return v;
  }
  if (ast.type === "unary") {
    const a = evalExprAst(ast.arg, values);
    if (a == null) return null;
    return -a;
  }
  const l = evalExprAst(ast.left, values);
  const r = evalExprAst(ast.right, values);
  if (l == null || r == null) return null;
  switch (ast.op) {
    case "+":
      return l + r;
    case "-":
      return l - r;
    case "*":
      return l * r;
    case "/":
      if (r === 0) return null;
      return l / r;
  }
}
