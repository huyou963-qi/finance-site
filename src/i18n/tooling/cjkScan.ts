/**
 * 功能页中文文案扫描与自动包裹（开发工具，不进应用包）。
 *
 * - `scanFile`：找出 React 组件 / hook 里显示给用户的中文（JSX 文本、属性、字符串、模板字符串），
 *   给出把它改成 `tr("…")` 的替换；组件外（模块常量、小写辅助函数等）的中文只报告，留给人工处理。
 * - 跳过不该翻译的位置：import、类型、对象键、比较（=== / case）、includes/startsWith 等匹配调用、console。
 * - 中文站 `tr` 原样返回，所以自动包裹不会改变中文站行为；风险只在英文站，靠逐页检查兜住。
 *
 * 同一行写有 `i18n-ignore` 注释的中文不处理（例如交给子组件自己翻译的原文）。
 * 用法：`npx tsx scripts/i18n/wrap-cjk.ts <files...> [--write]`；单测 `src/i18n/textCoverage.test.ts` 也用它。
 */
import ts from "typescript";

export const CJK = /[㐀-鿿]/;

export type Replacement = { start: number; end: number; text: string };

export type ManualItem = { line: number; text: string; reason: string };

export type FileScan = {
  /** 可自动包裹的替换（含插入 `const tr = …` 与 import） */
  edits: Replacement[];
  /** 已包裹或将包裹的中文原文（用于生成英文字典） */
  sources: string[];
  /** 需要人工处理的中文 */
  manual: ManualItem[];
  /** 文件里已有的 tr("…") 调用中的原文 */
  existing: string[];
};

/** 翻译函数的名字：默认 tr；文件里已有 tr 变量时用 tx */
export const TR_NAMES = new Set(["tr", "tx", "t"]);

const SKIP_CALLEES = new Set([
  "includes",
  "startsWith",
  "endsWith",
  "indexOf",
  "lastIndexOf",
  "has",
  "get",
  "set",
  "delete",
  "replace",
  "replaceAll",
  "split",
  "match",
  "test",
  "localeCompare",
]);

function isPascal(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function functionName(fn: ts.SignatureDeclaration): string | null {
  if ((ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn)) && fn.name) return fn.name.text;
  let p: ts.Node = fn.parent;
  // memo(...) / forwardRef(...) 包一层
  while (p && ts.isCallExpression(p)) p = p.parent;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  return null;
}

function isComponentOrHook(fn: ts.SignatureDeclaration): boolean {
  const name = functionName(fn);
  return !!name && (isPascal(name) || /^use[A-Z]/.test(name));
}

function isAsync(fn: ts.SignatureDeclaration): boolean {
  return !!ts.getModifiers(fn as ts.FunctionDeclaration)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
}

type FnLike = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

function enclosingComponent(node: ts.Node): FnLike | null | "class" {
  let p: ts.Node | undefined = node.parent;
  while (p) {
    if (ts.isClassDeclaration(p) || ts.isClassExpression(p)) return "class";
    if ((ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isArrowFunction(p)) && isComponentOrHook(p)) {
      return p;
    }
    p = p.parent;
  }
  return null;
}

/** 是否已经在 tr(…) 的参数里（允许经过 ?? / || / 三元 / 括号） */
function insideTrArgument(node: ts.Node): boolean {
  let cur: ts.Node = node;
  let p: ts.Node | undefined = node.parent;
  while (p) {
    if (ts.isParenthesizedExpression(p)) {
      cur = p;
      p = p.parent;
      continue;
    }
    if (ts.isConditionalExpression(p) && p.condition !== cur) {
      cur = p;
      p = p.parent;
      continue;
    }
    if (
      ts.isBinaryExpression(p) &&
      (p.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        p.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) {
      cur = p;
      p = p.parent;
      continue;
    }
    break;
  }
  return (
    !!p &&
    ts.isCallExpression(p) &&
    ts.isIdentifier(p.expression) &&
    TR_NAMES.has(p.expression.text) &&
    p.arguments[0] === cur
  );
}

/** 中文是否处在「数据」位置（不应翻译） */
function skipReason(node: ts.Node): string | null {
  const parent = node.parent;
  if (!parent) return null;
  if (insideTrArgument(node)) return "wrapped";
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return "import";
  if (ts.isLiteralTypeNode(parent)) return "type";
  if (ts.isPropertyAssignment(parent) && parent.name === node) return "key";
  if (ts.isComputedPropertyName(parent)) return "key";
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return "key";
  if (ts.isEnumMember(parent)) return "enum";
  if (ts.isCaseClause(parent)) return "compare";
  if (ts.isBinaryExpression(parent)) {
    const op = parent.operatorToken.kind;
    if (
      op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      op === ts.SyntaxKind.EqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsToken
    ) {
      return "compare";
    }
  }
  if (ts.isCallExpression(parent)) {
    const callee = parent.expression;
    if (ts.isIdentifier(callee) && TR_NAMES.has(callee.text)) return "wrapped";
    if (ts.isPropertyAccessExpression(callee)) {
      if (SKIP_CALLEES.has(callee.name.text)) return "compare";
      if (ts.isIdentifier(callee.expression) && callee.expression.text === "console") return "console";
    }
  }
  return null;
}

function jsxNormalize(raw: string): { lead: boolean; core: string; trail: boolean } {
  if (!raw.includes("\n")) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw)!;
    return { lead: m[1].length > 0, core: m[2], trail: m[3].length > 0 };
  }
  const lines = raw.split(/\r?\n/);
  const last = lines.length - 1;
  const parts = lines
    .map((line, i) => {
      let s = line;
      if (i > 0) s = s.replace(/^\s+/, "");
      if (i < last) s = s.replace(/\s+$/, "");
      return s;
    })
    .filter((s) => s.length > 0);
  const joined = parts.join(" ");
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(joined)!;
  return { lead: m[1].length > 0, core: m[2].replace(/\s+/g, " "), trail: m[3].length > 0 };
}

function placeholderName(expr: ts.Expression, used: Set<string>, index: number): string {
  let base = `v${index}`;
  if (ts.isIdentifier(expr)) base = expr.text;
  else if (ts.isPropertyAccessExpression(expr)) base = expr.name.text;
  let name = base;
  let n = 2;
  while (used.has(name)) name = `${base}${n++}`;
  used.add(name);
  return name;
}

export function scanFile(fileName: string, code: string, opts: { trName?: string } = {}): FileScan {
  const tr = opts.trName ?? "tr";
  const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const isClient = /^\s*["']use client["']/.test(code);
  const edits: Replacement[] = [];
  const sources: string[] = [];
  const manual: ManualItem[] = [];
  const existing: string[] = [];
  const needTr = new Map<FnLike, "client" | "server">();
  const line = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  const target = (node: ts.Node, text: string): "client" | "server" | null => {
    const fn = enclosingComponent(node);
    if (fn === "class") {
      manual.push({ line: line(node), text, reason: "class 组件" });
      return null;
    }
    if (!fn) {
      manual.push({ line: line(node), text, reason: "组件外（模块常量/辅助函数）" });
      return null;
    }
    // 参数默认值在 tr 声明之前求值：保留原文，在显示处 tr(…)
    for (let p: ts.Node | undefined = node.parent; p && p !== fn; p = p.parent) {
      if (ts.isParameter(p)) {
        manual.push({ line: line(node), text, reason: "参数默认值（在显示处 tr）" });
        return null;
      }
    }
    const mode = isClient ? "client" : isAsync(fn) ? "server" : null;
    if (!mode) {
      manual.push({ line: line(node), text, reason: "非 use client 文件里的同步组件" });
      return null;
    }
    needTr.set(fn, mode);
    return mode;
  };

  const lines = code.split("\n");
  const ignored = (n: ts.Node) => lines[line(n) - 1]?.includes("i18n-ignore") ?? false;

  const visit = (node: ts.Node) => {
    if ((ts.isStringLiteralLike(node) || ts.isJsxText(node) || ts.isTemplateExpression(node)) && ignored(node)) return;
    // 已有的 tr("…")
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      TR_NAMES.has(node.expression.text) &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      existing.push(node.arguments[0].text);
    }

    if (ts.isJsxText(node) && CJK.test(node.text)) {
      const raw = node.getFullText(sf);
      if (raw.includes("&")) {
        manual.push({ line: line(node), text: raw.trim(), reason: "含 HTML 实体" });
      } else {
        const { lead, core, trail } = jsxNormalize(raw);
        if (target(node, core)) {
          const space = (on: boolean) => (on ? (raw.includes("\n") ? '{" "}' : " ") : "");
          edits.push({
            start: node.getFullStart(),
            end: node.getEnd(),
            text: `${space(lead)}{${tr}(${JSON.stringify(core)})}${space(trail)}`,
          });
          sources.push(core);
        }
      }
      return;
    }

    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && CJK.test(node.text)) {
      const reason = skipReason(node);
      if (reason) {
        if (reason === "wrapped" || reason === "import" || reason === "type") return;
        manual.push({ line: line(node), text: node.text, reason: `数据位置（${reason}），未包裹` });
        return;
      }
      if (ts.isTaggedTemplateExpression(node.parent)) return;
      if (target(node, node.text)) {
        const call = `${tr}(${JSON.stringify(node.text)})`;
        const inJsxAttr = ts.isJsxAttribute(node.parent);
        edits.push({ start: node.getStart(sf), end: node.getEnd(), text: inJsxAttr ? `{${call}}` : call });
        sources.push(node.text);
      }
      return;
    }

    if (ts.isTemplateExpression(node)) {
      const literals = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
      if (literals.some((l) => CJK.test(l))) {
        if (ts.isTaggedTemplateExpression(node.parent)) return;
        const used = new Set<string>();
        let template = node.head.text;
        const values: string[] = [];
        node.templateSpans.forEach((span, i) => {
          const name = placeholderName(span.expression, used, i);
          const exprText = span.expression.getText(sf);
          values.push(exprText === name ? name : `${name}: ${exprText}`);
          template += `{${name}}${span.literal.text}`;
        });
        const reason = skipReason(node);
        if (reason) {
          manual.push({ line: line(node), text: template, reason: `数据位置（${reason}），未包裹` });
          return;
        }
        if (target(node, template)) {
          edits.push({
            start: node.getStart(sf),
            end: node.getEnd(),
            text: `${tr}(${JSON.stringify(template)}, { ${values.join(", ")} })`,
          });
          sources.push(template);
        }
        return; // 内部表达式里的中文由人工处理（罕见）
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // 在需要的组件里插入 const tr = …
  const hasTrBinding = (fn: FnLike) =>
    !!fn.body && new RegExp(`\\bconst\\s+${tr}\\s*=`).test(fn.body.getText(sf));
  for (const [fn, mode] of needTr) {
    if (hasTrBinding(fn)) continue;
    const decl = mode === "client" ? `const ${tr} = useTr();` : `const ${tr} = await getServerTr();`;
    const body = fn.body!;
    if (ts.isBlock(body)) {
      const first = body.statements[0];
      const indent = first
        ? " ".repeat(sf.getLineAndCharacterOfPosition(first.getStart(sf)).character)
        : "  ";
      edits.push({ start: body.getStart(sf) + 1, end: body.getStart(sf) + 1, text: `\n${indent}${decl}` });
    } else {
      // 表达式体箭头函数：改成块体
      edits.push({ start: body.getStart(sf), end: body.getStart(sf), text: `{\n  ${decl}\n  return (` });
      edits.push({ start: body.getEnd(), end: body.getEnd(), text: `);\n}` });
    }
  }

  // import
  const modes = new Set(needTr.values());
  const imports: string[] = [];
  if (modes.has("client") && !/import\s*\{[^}]*\buseTr\b[^}]*\}\s*from/.test(code)) {
    imports.push(`import { useTr } from "@/i18n/TextProvider";`);
  }
  if (modes.has("server") && !/import\s*\{[^}]*\bgetServerTr\b[^}]*\}\s*from/.test(code)) {
    imports.push(`import { getServerTr } from "@/i18n/serverText";`);
  }
  if (imports.length) {
    const lastImport = [...sf.statements].reverse().find(ts.isImportDeclaration);
    // 没有 import 时放在 "use client" 等指令之后（指令必须在文件最前）
    const directive = sf.statements.find(
      (st) => ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression) && st.getStart(sf) === sf.statements[0].getStart(sf),
    );
    const pos = lastImport ? lastImport.getEnd() : directive ? directive.getEnd() : 0;
    edits.push({ start: pos, end: pos, text: `${pos ? "\n" : ""}${imports.join("\n")}${pos ? "" : "\n"}` });
  }

  return { edits, sources, manual, existing };
}

export function applyEdits(code: string, edits: Replacement[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let out = code;
  for (const e of sorted) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}
