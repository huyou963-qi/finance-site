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

/** wrapLabels 模式下视为「显示标签」的属性/变量名 */
const LABEL_PROPS = new Set(["label", "title", "desc", "description", "hint", "shortLabel", "labelZh", "nameZh", "group"]);

/** 直接写变量名时只认这些（group/nameZh 这类名字常是对象，不按变量名包裹） */
const LABEL_IDENTIFIERS = new Set(["label", "title", "desc", "description", "hint"]);

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
  // generateMetadata（async）按服务端组件处理：页面标题/描述也要翻译
  return !!name && (isPascal(name) || /^use[A-Z]/.test(name) || name === "generateMetadata");
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

/** 模块级、未导出、只被直接调用的小写辅助函数（可以安全地加 tr 参数） */
type HelperInfo = { name: string; paramCount: number; hasTrParam: boolean };

function collectHelpers(sf: ts.SourceFile): Map<FnLike, HelperInfo> {
  const out = new Map<FnLike, HelperInfo>();
  const isExported = (n: ts.Node) =>
    !!ts.getModifiers(n as ts.FunctionDeclaration)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const consider = (fn: FnLike, name: string, exported: boolean) => {
    if (exported || isPascal(name) || /^use[A-Z]/.test(name) || name === "generateMetadata") return;
    if (!fn.body || fn.parameters.some((p) => p.dotDotDotToken)) return;
    // 已经加过 tr 参数（重复运行脚本）：参数个数不含它，已线程化
    const hasTrParam = fn.parameters.some((p) => ts.isIdentifier(p.name) && TR_NAMES.has(p.name.text));
    out.set(fn, { name, paramCount: fn.parameters.length - (hasTrParam ? 1 : 0), hasTrParam });
  };
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) consider(st, st.name.text, isExported(st));
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (
          ts.isIdentifier(d.name) &&
          d.initializer &&
          (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))
        ) {
          consider(d.initializer, d.name.text, isExported(st));
        }
      }
    }
  }
  // 名字只能以「直接调用」的方式出现（作为回调传出会把 index 等塞进 tr 参数）
  const names = new Map([...out].map(([fn, h]) => [h.name, fn] as const));
  const bad = new Set<string>();
  const walk = (n: ts.Node) => {
    if (ts.isIdentifier(n) && names.has(n.text)) {
      const p = n.parent;
      const isDecl =
        (ts.isFunctionDeclaration(p) && p.name === n) || (ts.isVariableDeclaration(p) && p.name === n);
      const isCall = ts.isCallExpression(p) && p.expression === n;
      if (!isDecl && !isCall) bad.add(n.text);
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  for (const [fn, h] of out) if (bad.has(h.name)) out.delete(fn);
  return out;
}

/** 模块级「值全是字符串字面量」的对象常量（如 REGIME_LABEL），读取处可以直接 tr(…) */
function collectStringRecords(sf: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  const unwrap = (e: ts.Expression): ts.Expression =>
    ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isParenthesizedExpression(e) ? unwrap(e.expression) : e;
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !d.initializer) continue;
      const init = unwrap(d.initializer);
      if (!ts.isObjectLiteralExpression(init) || !init.properties.length) continue;
      const values = init.properties.map((p) => (ts.isPropertyAssignment(p) ? unwrap(p.initializer) : null));
      if (values.every((v) => v && ts.isStringLiteralLike(v)) && values.some((v) => CJK.test((v as ts.StringLiteral).text))) {
        out.add(d.name.text);
      }
    }
  }
  return out;
}

export function scanFile(
  fileName: string,
  code: string,
  opts: { trName?: string; threadHelpers?: boolean; wrapLabels?: boolean } = {},
): FileScan {
  const tr = opts.trName ?? "tr";
  const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const isClient = /^\s*["']use client["']/.test(code);
  const edits: Replacement[] = [];
  const sources: string[] = [];
  const manual: ManualItem[] = [];
  const existing: string[] = [];
  const needTr = new Map<FnLike, "client" | "server">();
  const helpers = opts.threadHelpers ? collectHelpers(sf) : new Map<FnLike, HelperInfo>();
  const threaded = new Set<FnLike>();
  const stringRecords = opts.threadHelpers ? collectStringRecords(sf) : new Set<string>();
  const helperAncestor = (node: ts.Node): FnLike | null => {
    let found: FnLike | null = null;
    for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
      if ((ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isArrowFunction(p)) && helpers.has(p)) found = p;
    }
    return found;
  };
  const line = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  const target = (node: ts.Node, text: string): "client" | "server" | null => {
    const fn = enclosingComponent(node);
    if (fn === "class") {
      manual.push({ line: line(node), text, reason: "class 组件" });
      return null;
    }
    if (!fn) {
      const helper = helperAncestor(node);
      if (helper) {
        for (let p: ts.Node | undefined = node.parent; p && p !== helper; p = p.parent) {
          if (ts.isParameter(p)) {
            manual.push({ line: line(node), text, reason: "参数默认值（在显示处 tr）" });
            return null;
          }
        }
        threaded.add(helper);
        return "client";
      }
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

    // 显示处的标签表达式：{opt.label} / title={x.title} / {label} → tr(…)（中文站不变，未登记的原样显示）
    if (
      opts.wrapLabels &&
      ts.isJsxExpression(node) &&
      node.expression &&
      ((ts.isPropertyAccessExpression(node.expression) && LABEL_PROPS.has(node.expression.name.text)) ||
        (ts.isIdentifier(node.expression) && LABEL_IDENTIFIERS.has(node.expression.text)))
    ) {
      const inner = node.expression;
      if (target(inner, inner.getText(sf))) {
        edits.push({ start: inner.getStart(sf), end: inner.getEnd(), text: `${tr}(${inner.getText(sf)})` });
      }
      return;
    }

    // 读取字符串表：REGIME_LABEL[x] / REGIME_LABEL.key → tr(…)
    if (
      stringRecords.size &&
      (ts.isElementAccessExpression(node) || ts.isPropertyAccessExpression(node)) &&
      ts.isIdentifier(node.expression) &&
      stringRecords.has(node.expression.text) &&
      !skipReason(node) &&
      !(ts.isCallExpression(node.parent) && node.parent.expression === node) &&
      !(ts.isBinaryExpression(node.parent) && node.parent.left === node && node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken)
    ) {
      const text = node.getText(sf);
      if (target(node, text)) {
        edits.push({ start: node.getStart(sf), end: node.getEnd(), text: `${tr}(${text})` });
        // 只是变量读取，不算新原文；表里的中文会作为「组件外」原文导出翻译
      }
      return;
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

  for (const [fn, h] of helpers) if (h.hasTrParam) threaded.add(fn);
  if (threaded.size) {
    const byName = new Map([...helpers].map(([fn, h]) => [h.name, fn] as const));
    const callsOf = (fn: FnLike) => {
      const found: ts.CallExpression[] = [];
      const w = (n: ts.Node) => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && byName.has(n.expression.text)) found.push(n);
        ts.forEachChild(n, w);
      };
      w(fn);
      return found;
    };
    // 调用了需要 tr 的辅助函数的辅助函数，也要拿到 tr 往下传
    let changed = true;
    while (changed) {
      changed = false;
      for (const fn of helpers.keys()) {
        if (threaded.has(fn)) continue;
        if (callsOf(fn).some((c) => threaded.has(byName.get((c.expression as ts.Identifier).text)!))) {
          threaded.add(fn);
          changed = true;
        }
      }
    }
    const param = `${tr}: Tr = identityTr`;
    for (const fn of helpers.keys()) if (helpers.get(fn)!.hasTrParam) threaded.add(fn);
    for (const fn of threaded) {
      if (helpers.get(fn)!.hasTrParam) continue;
      const params = fn.parameters;
      const open = fn.getChildren(sf).find((c) => c.kind === ts.SyntaxKind.OpenParenToken);
      if (params.length && open) {
        edits.push({ start: params[params.length - 1].getEnd(), end: params[params.length - 1].getEnd(), text: `, ${param}` });
      } else if (params.length) {
        // 无括号的单参数箭头函数
        edits.push({ start: params[0].getStart(sf), end: params[0].getEnd(), text: `(${params[0].getText(sf)}, ${param})` });
      } else if (open) {
        edits.push({ start: open.getEnd(), end: open.getEnd(), text: param });
      }
    }
    // 同文件内的调用补上 tr（缺省的可选参数用 undefined 占位）
    const w = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && byName.has(n.expression.text)) {
        const callee = byName.get(n.expression.text)!;
        const { paramCount } = helpers.get(callee)!;
        const args = n.arguments;
        if (threaded.has(callee) && args.length <= paramCount && !args.some(ts.isSpreadElement)) {
          // （已传 tr 的调用 args.length 会超过 paramCount，不会再进来）
          let hasTr = !!helperAncestor(n) && threaded.has(helperAncestor(n)!);
          if (!hasTr) {
            const comp = enclosingComponent(n);
            if (comp && comp !== "class") {
              const mode = isClient ? "client" : isAsync(comp) ? "server" : null;
              if (mode) {
                needTr.set(comp, mode);
                hasTr = true;
              }
            }
          }
          if (hasTr) {
            const list = [...Array(paramCount - args.length).fill("undefined"), tr].join(", ");
            if (args.length) edits.push({ start: args[args.length - 1].getEnd(), end: args[args.length - 1].getEnd(), text: `, ${list}` });
            else edits.push({ start: args.pos, end: args.pos, text: list });
          }
        }
      }
      ts.forEachChild(n, w);
    };
    w(sf);
  }

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
  if (threaded.size) {
    const hasTrType = /import\s+(type\s+)?\{[^}]*\bTr\b[^}]*\}\s*from\s*"@\/i18n\/text"/.test(code);
    const hasIdentity = /\bidentityTr\b/.test(code);
    if (!hasIdentity) imports.push(hasTrType ? `import { identityTr } from "@/i18n/text";` : `import { identityTr, type Tr } from "@/i18n/text";`);
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

  // 落在另一处替换范围内的编辑（如模板字符串里的辅助函数调用）留到下一轮：同一轮叠加会写坏代码
  const safe = edits.filter(
    (e) => !edits.some((o) => o !== e && o.end > o.start && o.start <= e.start && e.end <= o.end && (o.start < e.start || e.end < o.end)),
  );
  return { edits: safe, sources, manual, existing };
}

export function applyEdits(code: string, edits: Replacement[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let out = code;
  for (const e of sorted) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}
