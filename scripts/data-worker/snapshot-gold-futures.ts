/**
 * COMEX 黄金期货逐合约日线快照（Yahoo），写入 mds.futures_contract_bar。
 *
 * 为什么要每天跑：Yahoo 只保留**当前挂牌**合约的数据，合约一到期就查不到或不可信
 * （实测 GCQ26 到期后报「delisted」，GCZ25 反而返回到期后九个月的数据）。所以期限结构
 * 的历史只能从现在起每天快照攒下来——今天不存，明天就没了。
 *
 * 挂牌月份不硬编码：逐月探测未来 MONTHS_AHEAD 个月的 `GC{月码}{两位年}.CMX`，
 * 有数据的就是挂牌合约（2026-09 实测共 27 个：未来约两年每个自然月都有，再往后只有 12 月）。
 * 一次请求同时完成探测与取数。
 *
 * npm run futures:snapshot-gold                  # 日常：每个合约取最近 10 天（漏跑一两天可自愈）
 * npm run futures:snapshot-gold -- --full        # 首跑：取挂牌合约在 Yahoo 上的全部历史
 * npm run futures:snapshot-gold -- --dry-run
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

const ROOT = "GC";
const EXCHANGE = "COMEX";
const SOURCE = "yahoo";
const MONTH_CODES = "FGHJKMNQUVXZ";
const MONTHS_AHEAD = 40;
const REQUEST_GAP_MS = 600;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36";

type Bar = {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function contractFor(offset: number, from: Date): { symbol: string; deliveryMonth: string } {
  const idx = from.getUTCMonth() + offset;
  const year = from.getUTCFullYear() + Math.floor(idx / 12);
  const month = (idx % 12) + 1;
  return {
    symbol: `${ROOT}${MONTH_CODES[month - 1]}${String(year % 100).padStart(2, "0")}.CMX`,
    deliveryMonth: `${year}-${String(month).padStart(2, "0")}`,
  };
}

async function fetchBars(symbol: string, full: boolean): Promise<Bar[] | null> {
  // 全量必须用 period1=0：range=max 会被 Yahoo 静默降采样成月线
  const query = full
    ? `period1=0&period2=${Math.floor(Date.now() / 1000)}&interval=1d`
    : "range=10d&interval=1d";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    chart?: {
      result?: Array<{
        meta?: { dataGranularity?: string };
        timestamp?: number[];
        indicators?: {
          quote?: Array<{
            open?: (number | null)[];
            high?: (number | null)[];
            low?: (number | null)[];
            close?: (number | null)[];
            volume?: (number | null)[];
          }>;
        };
      }> | null;
    };
  };
  const result = json.chart?.result?.[0];
  if (!result?.timestamp?.length) return null;
  const granularity = result.meta?.dataGranularity;
  if (granularity && granularity !== "1d") {
    throw new Error(`${symbol} 返回粒度 ${granularity}，不是日线（被降采样），拒绝写入`);
  }
  const q = result.indicators?.quote?.[0] ?? {};
  const bars: Bar[] = [];
  result.timestamp.forEach((t, i) => {
    const close = q.close?.[i];
    if (close == null || !Number.isFinite(close)) return;
    // Yahoo 期货日 K 时间戳是 UTC 04:00 = 纽约午夜，取 UTC 日期即纽约交易日（已实测）
    bars.push({
      date: new Date(t * 1000).toISOString().slice(0, 10),
      open: q.open?.[i] ?? null,
      high: q.high?.[i] ?? null,
      low: q.low?.[i] ?? null,
      close,
      volume: q.volume?.[i] ?? null,
    });
  });
  return bars;
}

async function main() {
  const full = process.argv.includes("--full");
  const dryRun = process.argv.includes("--dry-run");
  const now = new Date();
  console.log(
    `[futures:snapshot-gold] ${full ? "全量" : "日常(10天)"}${dryRun ? " dry-run" : ""}，探测未来 ${MONTHS_AHEAD} 个月`,
  );

  let listed = 0;
  let written = 0;
  let maxVolume = { symbol: "", volume: -1 };

  for (let k = 0; k < MONTHS_AHEAD; k += 1) {
    const { symbol, deliveryMonth } = contractFor(k, now);
    let bars: Bar[] | null;
    try {
      bars = await fetchBars(symbol, full);
    } catch (error) {
      console.warn(`  ✗ ${symbol}: ${error instanceof Error ? error.message : String(error)}`);
      await sleep(REQUEST_GAP_MS);
      continue;
    }
    await sleep(REQUEST_GAP_MS);
    if (!bars?.length) continue;
    listed += 1;

    const latest = bars[bars.length - 1]!;
    if ((latest.volume ?? 0) > maxVolume.volume) {
      maxVolume = { symbol, volume: latest.volume ?? 0 };
    }

    if (!dryRun) {
      await prisma.$transaction(
        bars.map((b) =>
          prisma.futuresContractBar.upsert({
            where: {
              root_deliveryMonth_date_source: {
                root: ROOT,
                deliveryMonth,
                date: new Date(`${b.date}T00:00:00Z`),
                source: SOURCE,
              },
            },
            create: {
              root: ROOT,
              exchange: EXCHANGE,
              deliveryMonth,
              symbol,
              date: new Date(`${b.date}T00:00:00Z`),
              open: b.open,
              high: b.high,
              low: b.low,
              close: b.close,
              volume: b.volume,
              source: SOURCE,
            },
            update: { open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume },
          }),
        ),
      );
    }
    written += bars.length;
    console.log(
      `  ✓ ${symbol.padEnd(11)} ${deliveryMonth}  ${bars.length} 天  ${bars[0]!.date} → ${latest.date}` +
        `  收 ${latest.close.toFixed(1)}  量 ${latest.volume ?? "-"}`,
    );
  }

  console.log(
    `[futures:snapshot-gold] 挂牌合约 ${listed} 个，写入 ${written} 条${dryRun ? "（dry-run 未写库）" : ""}；` +
      `最新成交量最大（主力）：${maxVolume.symbol}`,
  );
  if (listed === 0) {
    // 一个挂牌合约都没探到，基本是 Yahoo 接口变了或被拦，必须让 cron 日志看得见
    console.error("[futures:snapshot-gold] 未探测到任何挂牌合约，Yahoo 接口可能已变更或被拦截");
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
