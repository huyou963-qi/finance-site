/**
 * One-off bulk Tailwind class migration: dark slate/emerald → Scheme D fs-* tokens.
 * Run: node scripts/apply-scheme-d-theme.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..", "src");

const REPLACEMENTS = [
  ["bg-emerald-950/70 text-emerald-100 ring-1 ring-emerald-700/80", "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/25"],
  ["bg-emerald-950/50 text-emerald-100", "bg-fs-accent-soft text-fs-accent-text"],
  ["bg-emerald-950/40 text-emerald-100", "bg-fs-accent-soft text-fs-accent-text"],
  ["bg-emerald-950/30 text-emerald-100", "bg-fs-accent-soft text-fs-accent-text"],
  ["bg-emerald-950/70 text-emerald-200", "bg-fs-accent-soft text-fs-accent-text"],
  ["bg-emerald-950/60 text-emerald-100", "bg-fs-accent-soft text-fs-accent-text"],
  ["focus-visible:ring-emerald-500/60", "focus-visible:ring-fs-accent/50"],
  ["focus-visible:ring-emerald-500/50", "focus-visible:ring-fs-accent/50"],
  ["focus:border-emerald-600/70", "focus:border-fs-accent/70"],
  ["focus:border-emerald-500/70", "focus:border-fs-accent/70"],
  ["ring-emerald-700/80", "ring-fs-accent/25"],
  ["ring-emerald-600/80", "ring-fs-accent/25"],
  ["ring-emerald-500/60", "ring-fs-accent/50"],
  ["border-emerald-700/80", "border-fs-accent/30"],
  ["border-emerald-700/60", "border-fs-accent/30"],
  ["border-emerald-600/70", "border-fs-accent/40"],
  ["border-emerald-600/50", "border-fs-accent/30"],
  ["border-emerald-600", "border-fs-accent"],
  ["border-emerald-700", "border-fs-accent/40"],
  ["border-emerald-500", "border-fs-accent"],
  ["bg-emerald-600/70", "bg-fs-accent"],
  ["bg-emerald-600/50", "bg-fs-accent/80"],
  ["bg-emerald-600", "bg-fs-accent"],
  ["bg-emerald-500/20", "bg-fs-accent-soft"],
  ["bg-emerald-500/10", "bg-fs-accent-soft"],
  ["hover:bg-emerald-500", "hover:bg-fs-accent"],
  ["hover:bg-emerald-600", "hover:bg-fs-accent"],
  ["hover:text-emerald-300", "hover:text-fs-accent-text"],
  ["text-emerald-100", "text-fs-accent-text"],
  ["text-emerald-200", "text-fs-accent-text"],
  ["text-emerald-300", "text-fs-accent-text"],
  ["text-emerald-400", "text-fs-accent-text"],
  ["text-emerald-500", "text-fs-accent"],
  ["text-emerald-600", "text-fs-accent-text"],
  ["text-emerald-700", "text-fs-accent-text"],
  ["text-green-400", "text-fs-positive"],
  ["text-green-500", "text-fs-positive"],
  ["text-green-600", "text-fs-positive"],
  ["text-red-400", "text-fs-negative"],
  ["text-red-500", "text-fs-negative"],
  ["text-red-600", "text-fs-negative"],
  ["divide-slate-800", "divide-fs-border"],
  ["divide-slate-700", "divide-fs-border"],
  ["border-slate-800/80", "border-fs-border"],
  ["border-slate-800/60", "border-fs-border"],
  ["border-slate-800", "border-fs-border"],
  ["border-slate-700/60", "border-fs-border"],
  ["border-slate-700/50", "border-fs-border"],
  ["border-slate-700", "border-fs-border"],
  ["border-slate-600/50", "border-fs-border"],
  ["border-slate-600", "border-fs-border"],
  ["border-slate-500/80", "border-fs-border"],
  ["border-slate-500", "border-fs-border"],
  ["bg-slate-950/80", "bg-white/95"],
  ["bg-slate-950/70", "bg-fs-elevated"],
  ["bg-slate-950/50", "bg-fs-elevated"],
  ["bg-slate-950", "bg-fs-bg"],
  ["bg-slate-900/80", "bg-fs-elevated"],
  ["bg-slate-900/70", "bg-fs-elevated"],
  ["bg-slate-900/60", "bg-fs-elevated"],
  ["bg-slate-900/50", "bg-fs-elevated/80"],
  ["bg-slate-900", "bg-fs-elevated"],
  ["bg-slate-800/80", "bg-fs-elevated"],
  ["bg-slate-800/70", "bg-fs-elevated"],
  ["bg-slate-800/50", "bg-fs-elevated"],
  ["bg-slate-800", "bg-fs-elevated"],
  ["bg-slate-700/50", "bg-fs-border"],
  ["bg-slate-700", "bg-fs-border"],
  ["hover:bg-slate-900/80", "hover:bg-fs-elevated"],
  ["hover:bg-slate-800/50", "hover:bg-fs-elevated"],
  ["hover:bg-slate-800", "hover:bg-fs-elevated"],
  ["hover:bg-slate-700", "hover:bg-fs-elevated"],
  ["hover:border-slate-600", "hover:border-fs-border"],
  ["hover:border-slate-500", "hover:border-fs-border"],
  ["text-slate-100", "text-fs-text"],
  ["text-slate-200", "text-fs-text"],
  ["text-slate-300", "text-fs-secondary"],
  ["text-slate-400", "text-fs-muted"],
  ["text-slate-500", "text-fs-muted"],
  ["text-slate-600", "text-fs-secondary"],
  ["text-slate-700", "text-fs-secondary"],
  ["hover:text-white", "hover:text-fs-text"],
  ["hover:text-slate-100", "hover:text-fs-text"],
  ["hover:text-slate-200", "hover:text-fs-text"],
  ["placeholder-slate-500", "placeholder-fs-muted"],
  ["placeholder-slate-400", "placeholder-fs-muted"],
  ["accent-emerald-600", "accent-fs-accent"],
  ["bg-emerald-950/80", "bg-fs-accent-soft"],
  ["bg-emerald-950/75", "bg-fs-accent-soft"],
  ["bg-emerald-950/60", "bg-fs-accent-soft"],
  ["bg-emerald-950/55", "bg-fs-accent-soft"],
  ["bg-emerald-950/45", "bg-fs-accent-soft"],
  ["bg-emerald-950/40", "bg-fs-accent-soft"],
  ["bg-emerald-950/35", "bg-fs-accent-soft"],
  ["bg-emerald-950/30", "bg-fs-accent-soft"],
  ["bg-emerald-950/20", "bg-fs-accent-soft"],
  ["bg-emerald-950", "bg-fs-accent-soft"],
  ["bg-emerald-900/50", "bg-fs-accent-soft"],
  ["hover:bg-emerald-900/70", "hover:bg-fs-accent-soft"],
  ["hover:bg-emerald-950/75", "hover:bg-fs-accent-soft"],
  ["hover:bg-emerald-950/40", "hover:bg-fs-accent-soft"],
  ["ring-emerald-600/45", "ring-fs-accent/30"],
  ["ring-emerald-600/40", "ring-fs-accent/30"],
  ["ring-emerald-700/70", "ring-fs-accent/30"],
  ["ring-emerald-700/50", "ring-fs-accent/30"],
  ["ring-emerald-700", "ring-fs-accent/30"],
  ["ring-emerald-800/60", "ring-fs-accent/30"],
  ["border-emerald-800/60", "border-fs-accent/30"],
  ["bg-emerald-800/80", "bg-fs-accent"],
  ["hover:bg-emerald-700/80", "hover:bg-fs-accent"],
  ["text-emerald-50", "text-white"],
  ["bg-emerald-500/25", "bg-fs-accent-soft"],
  ["hover:bg-emerald-200", "hover:bg-fs-accent-soft"],
  ["bg-[#1e293b]", "bg-fs-elevated"],
  ["border-[#2b2f3a]/90", "border-fs-border"],
  ["border-[#2b2f3a]", "border-fs-border"],
  ["bg-[#131722]/95", "bg-white/95"],
  ["bg-[#131722]/80", "bg-fs-elevated"],
  ["bg-[#131722]", "bg-fs-bg"],
  ["text-slate-50", "text-fs-text"],
  ["bg-slate-600", "bg-fs-border"],
  ["ring-slate-700/80", "ring-fs-border"],
  ["border-slate-900/80", "border-fs-border"],
  ["ring-slate-600/80", "ring-fs-border"],
  ["ring-slate-950", "ring-fs-bg"],
  ["hover:bg-slate-500/30", "hover:bg-fs-border/60"],
  ["bg-slate-100", "bg-fs-elevated"],
];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(p);
  }
  return out;
}

let changed = 0;
for (const file of walk(ROOT)) {
  let text = fs.readFileSync(file, "utf8");
  const orig = text;
  for (const [from, to] of REPLACEMENTS) {
    text = text.split(from).join(to);
  }
  if (text !== orig) {
    fs.writeFileSync(file, text);
    changed++;
    console.log("updated:", path.relative(ROOT, file));
  }
}
console.log(`Done. ${changed} file(s) updated.`);
