/**
 * 把功能页组件里的中文包成 tr("…")（见 src/i18n/tooling/cjkScan.ts、docs/I18N.md）。
 *
 *   npx tsx scripts/i18n/wrap-cjk.ts <文件或目录...>             # 只报告
 *   npx tsx scripts/i18n/wrap-cjk.ts <...> --write                # 写回文件
 *   npx tsx scripts/i18n/wrap-cjk.ts <...> --sources=out.json     # 导出尚无英文的原文（给翻译用）
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyEdits, scanFile } from "../../src/i18n/tooling/cjkScan";

const args = process.argv.slice(2);
const write = args.includes("--write");
const sourcesOut = args.find((a) => a.startsWith("--sources="))?.slice("--sources=".length);
const dictArg = args.find((a) => a.startsWith("--dict="))?.slice("--dict=".length);
const targets = args.filter((a) => !a.startsWith("--"));

function walk(p: string): string[] {
  if (statSync(p).isFile()) return /\.tsx?$/.test(p) && !/\.test\./.test(p) ? [p] : [];
  return readdirSync(p).flatMap((n) => walk(join(p, n)));
}

const known = new Set<string>();
if (dictArg) for (const k of Object.keys(JSON.parse(readFileSync(dictArg, "utf8")))) known.add(k);

const allSources = new Set<string>();
let totalEdits = 0;
let totalManual = 0;
for (const file of targets.flatMap(walk)) {
  const code = readFileSync(file, "utf8");
  // 已有名为 tr 的变量/参数时不自动处理，避免遮蔽
  const usesTrName = /(\(|,|\bconst|\blet|\bvar)\s*tr\b\s*[,)=:]/.test(code) && !/const tr = (useTr|await getServerTr)\(\)/.test(code);
  const trName = usesTrName ? "tx" : "tr";
  const collides = usesTrName && /\btx\b/.test(code) && !/const tx = (useTr|await getServerTr)\(\)/.test(code);
  const scan = scanFile(file, code, { trName });
  // 组件外的中文（常量标签、解析器报错等）通常在显示处 tr(变量)，同样需要英文
  const manualTexts = scan.manual.filter((m) => !m.reason.startsWith("数据位置")).map((m) => m.text);
  for (const s of [...scan.sources, ...scan.existing, ...manualTexts]) if (!known.has(s)) allSources.add(s);
  if (!scan.edits.length && !scan.manual.length) continue;
  console.log(`\n${file}: ${scan.sources.length} 处可包裹，${scan.manual.length} 处需人工${collides ? "（tr/tx 都已被占用，跳过写入）" : trName !== "tr" ? "（使用 tx）" : ""}`);
  for (const m of scan.manual) console.log(`  L${m.line} [${m.reason}] ${m.text.slice(0, 60)}`);
  totalEdits += scan.sources.length;
  totalManual += scan.manual.length;
  if (write && !collides && scan.edits.length) writeFileSync(file, applyEdits(code, scan.edits));
}
console.log(`\n合计：可包裹 ${totalEdits}，需人工 ${totalManual}，待翻译原文 ${allSources.size}`);
if (sourcesOut) writeFileSync(sourcesOut, JSON.stringify([...allSources].sort(), null, 2));
