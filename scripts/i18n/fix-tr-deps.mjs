/**
 * 包裹 tr() 后，把 tr/tx 补进 useEffect/useMemo/useCallback 的依赖数组
 * （只应用 react-hooks/exhaustive-deps 对「缺少 tr/tx」这一类告警给出的建议修复）。
 *   node scripts/i18n/fix-tr-deps.mjs <文件...>
 */
import { ESLint } from "eslint";
import { readFileSync, writeFileSync } from "node:fs";

const files = process.argv.slice(2);
const eslint = new ESLint();
for (let pass = 0; pass < 5; pass++) {
  let changed = 0;
  for (const r of await eslint.lintFiles(files)) {
    const fixes = r.messages
      .filter((m) => m.ruleId === "react-hooks/exhaustive-deps" && /missing dependency: 'tx?r?'/.test(m.message) && /missing dependency: '(tr|tx)'\./.test(m.message) && m.suggestions?.length)
      .map((m) => m.suggestions[0].fix)
      .sort((a, b) => b.range[0] - a.range[0]);
    if (!fixes.length) continue;
    let code = readFileSync(r.filePath, "utf8");
    let lastStart = Infinity;
    for (const f of fixes) {
      if (f.range[1] > lastStart) continue; // 重叠的留到下一轮
      code = code.slice(0, f.range[0]) + f.text + code.slice(f.range[1]);
      lastStart = f.range[0];
      changed++;
    }
    writeFileSync(r.filePath, code);
  }
  if (!changed) break;
  console.log(`pass ${pass + 1}: ${changed} fixes`);
}
