/**
 * EBITDA 披露复检（只读 + 可选 SEC frames 探测）：
 * 1) 对白名单 us-gaap / ifrs-full 标签查 data.sec.gov frames（全市场有无发行人打标）
 * 2) 对照 HK 库 `lines.ebitda` 覆盖（与 /admin/equity-coverage 同口径）
 * 3) 可选抽查若干 companyfacts，确认个股侧也无标签
 *
 * Usage:
 *   npm run equity:verify-ebitda-disclosure
 *   npm run equity:verify-ebitda-disclosure -- --sample=0
 *   npm run equity:verify-ebitda-disclosure -- --sample=40 --out=.data/ebitda-disclosure.json
 *
 * 默认只打印 JSON；传 `--out=` 才落盘（默认不写 `/opt/cursor/...`，本地/生产可写）。
 * 退出码：永远 0（源端稀缺是预期，不是脚本故障）。用 JSON 的 framesEmpty / dbEmpty 做运维结论。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { prisma } from "../../src/lib/prisma";
import { loadEquityCoverageReport } from "../../src/lib/equity/equityCoverageAdmin";
import { loadFundamentalsCoverage } from "../../src/lib/equity/fundamentalsCoverage";
import { STATEMENT_LINE_TAGS } from "../../src/lib/equity/statementLineTags";
import {
  fetchSecCompanyFacts,
  fetchSecTickerCikMap,
} from "../../src/lib/equity/secFundamentals";

const EBITDA_TAGS = STATEMENT_LINE_TAGS.ebitda;
const TAXONOMIES = ["us-gaap", "ifrs-full"] as const;
const PERIODS = ["CY2023", "CY2024", "CY2025", "CY2024Q4"] as const;
const SEC_UA = "finance-site-research contact@gekkotech.cn";

function arg(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** 显式 `--name=0` 保留 0；缺省用 fallback；非法数字回退 fallback。 */
function nonNegIntArg(name: string, fallback: number): number {
  const raw = arg(name);
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchFrame(
  taxonomy: string,
  tag: string,
  period: string,
): Promise<{ status: number; points: number; label: string | null }> {
  const url = `https://data.sec.gov/api/xbrl/frames/${taxonomy}/${tag}/USD/${period}.json`;
  const res = await fetch(url, {
    headers: { "User-Agent": SEC_UA, Accept: "application/json" },
  });
  if (res.status !== 200) return { status: res.status, points: 0, label: null };
  const body = (await res.json()) as { data?: unknown[]; label?: string };
  return {
    status: 200,
    points: Array.isArray(body.data) ? body.data.length : 0,
    label: body.label ?? null,
  };
}

async function main() {
  const out = arg("out"); // 可选；不传则只 stdout
  const sampleN = nonNegIntArg("sample", 30);
  const delayMs = Math.max(100, nonNegIntArg("delay-ms", 200));

  const frames: {
    taxonomy: string;
    tag: string;
    period: string;
    status: number;
    points: number;
    label: string | null;
  }[] = [];
  for (const taxonomy of TAXONOMIES) {
    for (const tag of EBITDA_TAGS) {
      for (const period of PERIODS) {
        const r = await fetchFrame(taxonomy, tag, period);
        frames.push({ taxonomy, tag, period, ...r });
        await sleep(120);
      }
    }
  }
  // 对照：营业利润 frames 应有数千点，证明 frames API 本身可用
  const controlOi = await fetchFrame("us-gaap", "OperatingIncomeLoss", "CY2024");
  frames.push({
    taxonomy: "us-gaap",
    tag: "OperatingIncomeLoss",
    period: "CY2024",
    ...controlOi,
  });

  const frameHits = frames.filter(
    (f) => f.tag !== "OperatingIncomeLoss" && f.status === 200 && f.points > 0,
  );
  const framesEmpty = frameHits.length === 0;

  const coverage = await loadEquityCoverageReport(prisma);

  const sample: {
    symbol: string;
    cik: string | null;
    tagsPresent: string[];
  }[] = [];
  if (sampleN > 0) {
    const map = await fetchSecTickerCikMap();
    // 宇宙内按符号排序取前 N（market_cap 在部分库未回填，不能依赖）
    const prefer = [
      "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "JPM", "XOM", "JNJ", "WMT",
      "BRK-B", "V", "MA", "HD", "PG", "AVGO", "COST", "ORCL", "CRM", "AMD",
    ];
    const universe = [...(await loadFundamentalsCoverage(prisma))];
    const inUniverse = new Set(universe);
    const picked = [
      ...prefer.filter((s) => inUniverse.has(s)),
      ...universe.sort().filter((s) => !prefer.includes(s)),
    ].slice(0, sampleN);
    for (const symbol of picked) {
      const cik = map.get(symbol) ?? map.get(symbol.replace("-", ".")) ?? null;
      if (!cik) {
        sample.push({ symbol, cik: null, tagsPresent: [] });
        continue;
      }
      const facts = (await fetchSecCompanyFacts(cik)) as {
        facts?: Record<string, Record<string, unknown>>;
      };
      const present: string[] = [];
      for (const tax of TAXONOMIES) {
        const bag = facts.facts?.[tax] ?? {};
        for (const tag of EBITDA_TAGS) {
          if (bag[tag]) present.push(`${tax}:${tag}`);
        }
      }
      sample.push({ symbol, cik, tagsPresent: present });
      await sleep(delayMs);
    }
  }
  const sampleHits = sample.filter((s) => s.tagsPresent.length > 0);

  const report = {
    asOf: new Date().toISOString(),
    whitelistTags: [...EBITDA_TAGS],
    framesEmpty,
    frameHitCount: frameHits.length,
    frames,
    controlOperatingIncomeLossCy2024: controlOi,
    db: {
      universe: coverage.fundamentals.universe,
      withLatestEbitda: coverage.ebitda.withLatestEbitda,
      withAnyEbitda: coverage.ebitda.withAnyEbitda,
      samplePresent: coverage.ebitda.samplePresent,
      note: coverage.ebitda.note,
    },
    dbEmpty: coverage.ebitda.withAnyEbitda === 0,
    companyfactsSample: {
      checked: sample.length,
      hits: sampleHits.length,
      sampleHits: sampleHits.slice(0, 20),
      sampleMisses: sample.filter((s) => !s.tagsPresent.length).slice(0, 20),
    },
    conclusion:
      framesEmpty && coverage.ebitda.withAnyEbitda === 0
        ? "SEC frames 对白名单 EBITDA 标签近年无发行人数据；库内 lines.ebitda 为空是源端未打标，不是 sync 漏跑。继续禁止 OI+D&A 推算入库。"
        : framesEmpty
          ? "frames 为空但库内已有 ebitda 行——需核对写入路径是否误推算。"
          : "frames 有命中：应对命中发行人跑 equity:sync-fundamentals --period-type=Q 回灌。",
  };

  console.log(JSON.stringify(report, null, 2));
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(report, null, 2));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
