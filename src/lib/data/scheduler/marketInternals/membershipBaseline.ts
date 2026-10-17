import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type MembershipBaseline = { version: 1; html: string; anchor: string; source: string; fetchedAt: string; sha256: string };
const baselinePath = () => path.join(process.cwd(), ".data/market-breadth-sources/membership-baseline.json");
const digest = (html: string) => createHash("sha256").update(html).digest("hex");

export async function saveMembershipBaseline(source: { html: string; anchor: string; source: string }): Promise<void> {
  const file = baselinePath();
  const baseline: MembershipBaseline = { ...source, version: 1, fetchedAt: new Date().toISOString(), sha256: digest(source.html) };
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(baseline));
  await rename(temporary, file);
}

export async function readMembershipBaseline(): Promise<MembershipBaseline> {
  const data = JSON.parse(await readFile(baselinePath(), "utf8")) as MembershipBaseline;
  if (data.version !== 1 || typeof data.html !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.anchor) || data.sha256 !== digest(data.html)) {
    throw new Error("历史成分基线缺失或哈希不匹配");
  }
  return data;
}

/** ETF只用于独立核对基线集合，不能把ETF持仓变更推断成指数历史事件。 */
export function validateCorroboration(expected: readonly string[], actual: readonly string[], asOf: string, todayNy: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isFinite(Date.parse(`${asOf}T00:00:00Z`)) || new Date(`${asOf}T00:00:00Z`).toISOString().slice(0, 10) !== asOf) throw new Error("SPY持仓日期非法");
  const age = (Date.parse(`${todayNy}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 86_400_000;
  if (age < 0 || age > 5) throw new Error(`SPY持仓过期或来自未来: ${asOf}`);
  const baseline = new Set(expected);
  const holdings = new Set(actual);
  if (baseline.size < 495 || baseline.size > 510 || actual.length !== holdings.size) throw new Error("成分基线或SPY股票集合规模异常");
  const missing = [...baseline].filter((s) => !holdings.has(s));
  const extra = [...holdings].filter((s) => !baseline.has(s));
  if (missing.length || extra.length) throw new Error(`SPY与核验基线不一致，需刷新指数成分: 缺少${missing.join(",")}；多出${extra.join(",")}`);
}

export function isConfirmedMembershipDate(date: string, baselineAnchor: string, holdingsAsOf: string): boolean {
  return date <= baselineAnchor || date === holdingsAsOf;
}
