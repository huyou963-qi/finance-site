/**
 * Phase 5 WS0：资金面三源可达性探测（一次性诊断脚本）。
 *
 * 目的：在建表/写摄入前，实测三类免费源在本机（生产同网络）是否可达、
 * 返回结构如何、历史下限，据此决定各维度是否降级/换源。
 *
 *   1) SEC Form 13F 结构化季度数据集（COVERPAGE/INFOTABLE/SUBMISSION）
 *   2) 短兴趣（FINRA / NASDAQ Trader，可达性未验证——本脚本重点）
 *   3) ETF 历史份额（Yahoo quoteSummary / chart，判断能否算份额×NAV 资金流）
 *
 * Usage: npx dotenv -e .env.local -- tsx scripts/quant/probe-funding-sources.ts
 * 样本落 scratchpad（不进仓库）。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR =
  process.env.PROBE_OUT_DIR ||
  "C:/Users/ADMINI~1/AppData/Local/Temp/claude/probe-funding";
try {
  mkdirSync(OUT_DIR, { recursive: true });
} catch {
  /* ignore */
}

const SEC_UA =
  process.env.SEC_USER_AGENT?.trim() || "hblook.com equity-funding admin@hblook.com";

type ProbeResult = {
  name: string;
  url: string;
  method: string;
  ok: boolean;
  status: number | string;
  bytes?: number;
  contentType?: string | null;
  note?: string;
};

const results: ProbeResult[] = [];

function log(r: ProbeResult) {
  results.push(r);
  const flag = r.ok ? "✓" : "✗";
  console.log(
    `${flag} [${r.status}] ${r.name}\n    ${r.method} ${r.url}` +
      (r.bytes != null ? `\n    ${r.bytes} bytes, ${r.contentType ?? "?"}` : "") +
      (r.note ? `\n    → ${r.note}` : ""),
  );
}

async function probe(
  name: string,
  url: string,
  opts: {
    method?: string;
    headers?: Record<string, string>;
    save?: string;
    maxBytes?: number;
  } = {},
): Promise<{ ok: boolean; status: number | string; text?: string; buf?: ArrayBuffer }> {
  const method = opts.method ?? "GET";
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; finance-site/1.0; +https://hblook.com)",
        Accept: "*/*",
        ...opts.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const contentType = res.headers.get("content-type");
    const clen = res.headers.get("content-length");
    if (method === "HEAD") {
      log({
        name,
        url,
        method,
        ok: res.ok,
        status: res.status,
        contentType,
        note: clen ? `content-length ${clen}` : undefined,
      });
      return { ok: res.ok, status: res.status };
    }
    const buf = await res.arrayBuffer();
    const bytes = buf.byteLength;
    const isText =
      (contentType ?? "").includes("json") ||
      (contentType ?? "").includes("text") ||
      (contentType ?? "").includes("xml") ||
      (contentType ?? "").includes("html");
    let text: string | undefined;
    if (isText) text = new TextDecoder().decode(buf).slice(0, opts.maxBytes ?? 4000);
    log({
      name,
      url,
      method,
      ok: res.ok,
      status: res.status,
      bytes,
      contentType,
      note: text ? text.slice(0, 200).replace(/\s+/g, " ") : undefined,
    });
    if (opts.save && res.ok) {
      const path = join(OUT_DIR, opts.save);
      writeFileSync(path, Buffer.from(buf));
      console.log(`    saved → ${path}`);
    }
    return { ok: res.ok, status: res.status, text, buf };
  } catch (e) {
    log({
      name,
      url,
      method,
      ok: false,
      status: e instanceof Error ? e.name : "ERR",
      note: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, status: "ERR" };
  }
}

async function main() {
  console.log("========== 1) SEC Form 13F 结构化数据集 ==========\n");
  // 数据集列表页（HTML，含各季 zip 链接）
  await probe(
    "SEC 13F datasets 索引页",
    "https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets",
    { headers: { "User-Agent": SEC_UA }, maxBytes: 8000 },
  );
  // 具体季度 zip（HEAD 判可达 + 体量）——尝试几种 URL 命名
  const q = "2024q1";
  const zipCandidates = [
    `https://www.sec.gov/files/structureddata/data/form-13f-data-sets/${q}_form13f.zip`,
    `https://www.sec.gov/files/dera/data/form-13f-data-sets/${q}_form13f.zip`,
    `https://www.sec.gov/Archives/edgar/data/form-13f-data-sets/${q}_form13f.zip`,
  ];
  for (const url of zipCandidates) {
    await probe(`SEC 13F ${q} zip (HEAD)`, url, {
      method: "HEAD",
      headers: { "User-Agent": SEC_UA },
    });
  }

  console.log("\n========== 2) 短兴趣（short interest）==========\n");
  // 2a) FINRA 官方 API（consolidated short interest）——通常需 OAuth，探明是否 401
  await probe(
    "FINRA API consolidatedShortInterest",
    "https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest?limit=1",
    { headers: { Accept: "application/json" }, maxBytes: 2000 },
  );
  // 2b) FINRA 短兴趣下载页（HTML 目录）
  await probe(
    "FINRA short interest 目录页",
    "https://www.finra.org/finra-data/browse-catalog/short-interest/files",
    { maxBytes: 4000 },
  );
  // 2c) NASDAQ Trader 短兴趣页
  await probe(
    "NASDAQ Trader ShortInterest 页",
    "https://www.nasdaqtrader.com/Trader.aspx?id=ShortInterest",
    { maxBytes: 3000 },
  );
  // 2d) NASDAQ api 现值短兴趣（单票）
  await probe(
    "NASDAQ api short-interest AAPL",
    "https://api.nasdaq.com/api/quote/AAPL/short-interest?assetClass=stocks",
    { headers: { Accept: "application/json" }, maxBytes: 2000 },
  );
  // 2e) FINRA regsho 每日空卖量（不是短兴趣但同族，验证 finra cdn 可达）
  await probe(
    "FINRA regsho 每日空卖量 (CNMSshvol)",
    "https://cdn.finra.org/equity/regsho/daily/CNMSshvol20240102.txt",
    { maxBytes: 1500, save: "finra_regsho_sample.txt" },
  );
  // 2f) NASDAQ Trader 短兴趣下载文件（settlement 文件，尝试常见命名）
  await probe(
    "NASDAQ Trader SI 下载 (SIC)",
    "https://www.nasdaqtrader.com/dynamic/symdir/shortinterest/SI20240115.txt",
    { maxBytes: 1500 },
  );

  console.log("\n========== 3) ETF 历史份额 / 资金流基建 ==========\n");
  // 3a) Yahoo quoteSummary defaultKeyStatistics（现值 sharesOutstanding / netAssets）
  await probe(
    "Yahoo quoteSummary XLK (keyStats)",
    "https://query1.finance.yahoo.com/v10/finance/quoteSummary/XLK?modules=defaultKeyStatistics,price,fundProfile,topHoldings",
    { headers: { Accept: "application/json" }, maxBytes: 3000, save: "yahoo_xlk_qs.json" },
  );
  // 3b) Yahoo chart XLK 含 volume（有则可用 dollar volume 作 flow 代理）
  await probe(
    "Yahoo chart XLK 1mo",
    "https://query1.finance.yahoo.com/v8/finance/chart/XLK?interval=1d&range=1mo",
    { headers: { Accept: "application/json" }, maxBytes: 1500 },
  );
  // 3c) SSGA（SPDR）XLK 官方每日持仓/份额（历史份额可能只给现值）
  await probe(
    "SSGA XLK holdings (HEAD)",
    "https://www.ssga.com/us/en/intermediary/etfs/library-content/products/fund-data/etfs/us/holdings-daily-us-en-xlk.xlsx",
    { method: "HEAD" },
  );

  // 汇总
  console.log("\n========== 汇总 ==========");
  const summary = {
    generatedAt: new Date().toISOString(),
    results,
  };
  const summaryPath = join(OUT_DIR, "probe-summary.json");
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`\n可达 ${results.filter((r) => r.ok).length}/${results.length}`);
  console.log(`详情 → ${summaryPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
