/**
 * One-off: CFTC kh3c-gbw2 GOLD verification vs Excel / DB
 * npx tsx scripts/research/verify-cftc-gold-cot.ts
 */
import fs from "node:fs";
import { config } from "dotenv";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

config({ path: ".env.local" });
loadEnvConfig(process.cwd());

const DATASET = "kh3c-gbw2";
const BASE = `https://publicreporting.cftc.gov/resource/${DATASET}.json`;
const DEFAULT_XLSX = "C:/Users/Administrator/Desktop/模板/黄金期货头寸.xlsx";
const TARGET_OBS = "2024-06-02";

const MM_LONG = "m_money_positions_long_all";
const MM_SHORT = "m_money_positions_short_all";
const MM_SPREAD = "m_money_positions_spread_all";

type CftcRow = {
  report_date: string;
  market: string;
  commodity: string;
  cftc_commodity_code: string;
  long: number | null;
  short: number | null;
  spread: number | null;
  net: number | null;
  open_interest: number | null;
};

async function fetchCftc(where: string, limit = 50): Promise<Record<string, unknown>[]> {
  const url =
    `${BASE}?` +
    `$where=${encodeURIComponent(where)}` +
    `&$order=${encodeURIComponent("report_date_as_yyyy_mm_dd DESC")}` +
    `&$limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`CFTC HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()) as Record<string, unknown>[];
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeRow(r: Record<string, unknown>): CftcRow {
  const long_ = num(r[MM_LONG]);
  const short_ = num(r[MM_SHORT]);
  const spread_ = num(r[MM_SPREAD]);
  return {
    report_date: String(r.report_date_as_yyyy_mm_dd ?? r.report_date ?? "").slice(0, 10),
    market: String(r.market_and_exchange_names ?? ""),
    commodity: String(r.commodity ?? ""),
    cftc_commodity_code: String(r.cftc_commodity_code ?? "").trim(),
    long: long_,
    short: short_,
    spread: spread_,
    net: long_ != null && short_ != null ? long_ - short_ : null,
    open_interest: num(r.open_interest_all),
  };
}

/** COMEX 主合约：commodity=GOLD 且非 MICRO，同日多行取 open interest 最大 */
function pickComexGold(rows: Record<string, unknown>[]): CftcRow | null {
  const parsed = rows
    .map(normalizeRow)
    .filter((r) => r.commodity === "GOLD" && !/MICRO/i.test(r.market));
  if (!parsed.length) return null;
  return parsed.reduce((best, cur) =>
    (cur.open_interest ?? 0) > (best.open_interest ?? 0) ? cur : best,
  );
}

async function fetchComexGoldOnDate(reportDate: string): Promise<CftcRow | null> {
  const iso = `${reportDate}T00:00:00.000`;
  const rows = await fetchCftc(
    `commodity = 'GOLD' AND report_date_as_yyyy_mm_dd = '${iso}'`,
    10,
  );
  return pickComexGold(rows);
}

async function fetchLatestComexGold(): Promise<CftcRow | null> {
  const rows = await fetchCftc(
    `commodity = 'GOLD' AND market_and_exchange_names NOT LIKE '%MICRO%'`,
    5,
  );
  return pickComexGold(rows);
}

function parseExcelDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const asDate = XLSX.SSF.parse_date_code(value);
    if (asDate?.y && asDate.m && asDate.d) {
      return `${asDate.y}-${String(asDate.m).padStart(2, "0")}-${String(asDate.d).padStart(2, "0")}`;
    }
  }
  const raw = String(value ?? "").trim();
  const ymd = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(raw);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

function readExcelTriple(xlsxPath: string, obsDate: string): { long: number; short: number; net: number } | null {
  if (!fs.existsSync(xlsxPath)) return null;
  const wb = XLSX.readFile(xlsxPath, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]!];
  if (!sheet) return null;
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
  let hdr = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    if (/^指标名称$/i.test(String(rows[i]?.[0] ?? "").trim())) {
      hdr = i;
      break;
    }
  }
  if (hdr < 0) return null;

  const header = rows[hdr] ?? [];
  let col = -1;
  for (let i = 1; i < header.length; i++) {
    if (parseExcelDate(header[i]) === obsDate) {
      col = i;
      break;
    }
  }
  if (col < 0) return null;

  const parseNum = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const n = Number(String(v ?? "").replace(/[,，\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  const long_ = parseNum(rows[hdr + 4]?.[col]);
  const short_ = parseNum(rows[hdr + 5]?.[col]);
  const net_ = parseNum(rows[hdr + 6]?.[col]);
  if (long_ == null || short_ == null || net_ == null) return null;
  return { long: long_, short: short_, net: net_ };
}

async function readDbTriple(
  prisma: PrismaClient,
  obsDate: string,
): Promise<{ long: number | null; short: number | null; net: number | null }> {
  const codes = ["goldov_c04_mm_long", "goldov_c05_mm_short", "goldov_c06_mm_net"] as const;
  const out: { long: number | null; short: number | null; net: number | null } = {
    long: null,
    short: null,
    net: null,
  };
  const key = ["long", "short", "net"] as const;
  for (let i = 0; i < codes.length; i++) {
    const inst = await prisma.instrument.findUnique({ where: { code: codes[i]! } });
    if (!inst) continue;
    const obs = await prisma.macroObservation.findFirst({
      where: { instrumentId: inst.id, obsDate: new Date(`${obsDate}T00:00:00.000Z`) },
    });
    out[key[i]!] = obs?.value ?? null;
  }
  return out;
}

function printCompareTable(
  title: string,
  excel: { long: number | null; short: number | null; net: number | null },
  cftc: CftcRow | null,
  sourceLabel: string,
) {
  console.log(`\n=== ${title} ===\n`);
  console.log("| 目录字段 | Excel/DB | CFTC API 字段 | CFTC 值 | 差值 | 一致 |");
  console.log("|----------|----------|---------------|---------|------|------|");
  const rows = [
    ["goldov_c04 管理基金多头", excel.long, MM_LONG, cftc?.long ?? null],
    ["goldov_c05 管理基金空头", excel.short, MM_SHORT, cftc?.short ?? null],
    ["goldov_c06 管理基金净持仓", excel.net, "long − short（非 spread）", cftc?.net ?? null],
  ] as const;
  let allMatch = true;
  for (const [label, ex, field, apiVal] of rows) {
    const diff = ex != null && apiVal != null ? ex - apiVal : null;
    const match = diff === 0 ? "✓" : diff != null ? "✗" : "—";
    if (diff !== 0) allMatch = false;
    console.log(
      `| ${label} | ${ex?.toLocaleString() ?? "—"} | ${field} | ${apiVal?.toLocaleString() ?? "—"} | ${diff?.toLocaleString() ?? "—"} | ${match} |`,
    );
  }
  if (cftc) {
    console.log(`\nCFTC report_date=${cftc.report_date} · ${cftc.market}`);
    console.log(`（spread=${cftc.spread?.toLocaleString() ?? "—"}，未纳入净仓；Excel 净仓 = 多 − 空）`);
  }
  console.log(`数据来源标注：${sourceLabel} · 三列全一致：${allMatch && cftc ? "是" : "否"}`);
}

async function main() {
  console.log("=== CFTC Disaggregated Combined (kh3c-gbw2) · COMEX GOLD 验证 ===\n");

  const latest = await fetchLatestComexGold();
  console.log("最新 COMEX 主合约（排除 MICRO，取最大 OI）：");
  console.log(JSON.stringify(latest, null, 2));

  const prisma = new PrismaClient();
  const xlsxPath = process.env.GOLD_ANALYSIS_XLSX ?? DEFAULT_XLSX;

  // 目标日 2024-06-02：CFTC 无周二以外发布日，先查 Excel/DB 是否有该列
  const excelTarget = readExcelTriple(xlsxPath, TARGET_OBS);
  const dbTarget = await readDbTriple(prisma, TARGET_OBS);
  const cftcTarget = await fetchComexGoldOnDate(TARGET_OBS);

  console.log(`\n目标观测日 ${TARGET_OBS}：`);
  console.log(`  Excel 列：${excelTarget ? JSON.stringify(excelTarget) : "无此日期列"}`);
  console.log(`  DB 观测：${dbTarget.long != null ? JSON.stringify(dbTarget) : "无此日期"}`);
  console.log(`  CFTC 行：${cftcTarget ? `report_date=${cftcTarget.report_date}` : "无（非发布日或 API 无数据）"}`);

  // 若 2024-06-02 不存在，用 Excel/DB 最近邻周频日期做对照
  const neighborDates = ["2024-05-28", "2024-06-04", "2024-06-11"];
  if (!excelTarget && dbTarget.long == null) {
    console.log("\n2024-06-02 在 Excel/DB 中均无列；COT 为周频（report_date 通常为周二）。");
    console.log("改用邻近日期逐一对照：\n");
    for (const d of neighborDates) {
      const ex = readExcelTriple(xlsxPath, d) ?? (await readDbTriple(prisma, d));
      const has = ex.long != null;
      if (!has) continue;
      const cftc = await fetchComexGoldOnDate(d);
      printCompareTable(`对照 ${d}（Excel/DB vs CFTC 同 report_date）`, ex, cftc, `xlsx/DB ${d}`);
    }
  } else {
    const ex = excelTarget ?? dbTarget;
    printCompareTable(
      `对照 ${TARGET_OBS}`,
      ex,
      cftcTarget,
      excelTarget ? `xlsx ${TARGET_OBS}` : `DB ${TARGET_OBS}`,
    );
  }

  // 最新一期：DB latest vs CFTC latest
  const latestDb = await readDbTriple(
    prisma,
    (
      await prisma.macroObservation.findFirst({
        where: { instrument: { code: "goldov_c04_mm_long" } },
        orderBy: { obsDate: "desc" },
      })
    )?.obsDate.toISOString().slice(0, 10) ?? "",
  );
  const latestObsDate = (
    await prisma.macroObservation.findFirst({
      where: { instrument: { code: "goldov_c04_mm_long" } },
      orderBy: { obsDate: "desc" },
    })
  )?.obsDate.toISOString().slice(0, 10);

  if (latestObsDate && latestDb.long != null) {
    const cftcOnLatestDb = await fetchComexGoldOnDate(latestObsDate);
    printCompareTable(
      `对照 DB 最新 obsDate=${latestObsDate}`,
      latestDb,
      cftcOnLatestDb ?? latest,
      `DB latest ${latestObsDate}`,
    );
  }

  await prisma.$disconnect();

  console.log("\n=== 字段映射结论 ===");
  console.log("| Excel 列 (goldAnalysisLayout) | CFTC kh3c-gbw2 字段 | 说明 |");
  console.log("|-------------------------------|---------------------|------|");
  console.log("| goldov_c04_mm_long 管理基金多头 | m_money_positions_long_all | Managed Money 多头合约数 |");
  console.log("| goldov_c05_mm_short 管理基金空头 | m_money_positions_short_all | Managed Money 空头合约数 |");
  console.log("| goldov_c06_mm_net 管理基金净持仓 | long − short | Excel 净仓非 spread；勿用 m_money_positions_spread_all |");
  console.log("| 筛选条件 | commodity='GOLD' + 非 MICRO 市场 | 同日多合约取 open_interest_all 最大 |");
  console.log("| obsDate / report_date | 与 CFTC report_date_as_yyyy_mm_dd 对齐 | 周频，通常为周二 cutoff 后周五发布 |");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
