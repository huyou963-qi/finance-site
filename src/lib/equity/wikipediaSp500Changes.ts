/**
 * Wikipedia "List of S&P 500 companies" 第二张表（id="changes"，Selected changes）解析
 * 与历史成分反向回放重建。
 *
 * 与 wikipediaSp500.ts 的当前成分 parser 严格分开：本文件只解析 id="changes" 表的
 * 切片，当前成分 parser 只应喂 id="constituents" 表的切片（见 sliceTableById），
 * 防止两张表的行互相污染。
 *
 * 数据源为 git HTML 快照（scripts/equity/fixtures/wikipedia-sp500-page.html）——
 * 生产服务器（阿里云墙内）抓不到 Wikipedia，与 sp500-snapshot.json 同一惯例。
 */

export type Sp500Change = {
  /** 生效日 ISO（Wikipedia "Effective Date" 列） */
  date: string;
  addedTicker: string | null;
  addedName: string | null;
  removedTicker: string | null;
  removedName: string | null;
  reason: string | null;
};

/**
 * 历史 ticker → 现价库 symbol 的小型 alias 表（同一存续公司改 ticker）。
 * 用途：变更表行用的是事件当时的 ticker，公司后来改名后与当前快照/价格库对不上，
 * 回放前先归一。只收录「存续公司改 ticker」，并购消亡类不收（变更表有显式行）。
 * 注意：重建出的历史成分行一律以现价库 symbol 表达（如 FB 时代记为 META），
 * 方便与 EquityDailyBar 直接 join。
 */
export const SP500_TICKER_ALIASES: Record<string, string> = {
  FB: "META", // Meta Platforms 2022-06
  PCLN: "BKNG", // Booking Holdings 2018-02
  KORS: "CPRI", // Capri Holdings 2019-01
  ANTM: "ELV", // Elevance Health 2022-06
  WLTW: "WTW", // Willis Towers Watson 2022-01
  VIAC: "PARA", // Paramount Global 2022-02
  COG: "CTRA", // Coterra（Cabot 存续）2021-10
  TSO: "ANDV", // Andeavor（Tesoro 存续，2018 被 MPC 收购时以 ANDV 移出）
  HRS: "LHX", // L3Harris（Harris 存续）2019-06
  RE: "EG", // Everest Group 2023-07
  FISV: "FI", // Fiserv 2023-06
  HFC: "DINO", // HF Sinclair（HollyFrontier 存续）2022-03
  SYMC: "GEN", // Symantec→NortonLifeLock→Gen Digital
  NLOK: "GEN",
  ADS: "BFH", // Bread Financial（Alliance Data 存续）2022-03
  SQ: "XYZ", // Block 2025-01
  FLT: "CPAY", // Corpay（Fleetcor 存续）2024-03
  DLPH: "APTV", // Aptiv（Delphi Automotive 存续；后来的 DLPH=Delphi Technologies 未入选过）2017-12
  JOYG: "JOY", // Joy Global 2012 缩短 ticker，2015 以 JOY 移出
  JEC: "J", // Jacobs 2019-12
  LUK: "JEF", // Jefferies Financial（Leucadia 存续）2018-05
};

/**
 * ticker 被复用的场景需要按事件日期区分：
 * UA 在 2016-04-08 前指 Under Armour A 类股（今 UAA）；此后 UA 被 C 类股复用。
 */
const DATED_ALIASES: Array<{ ticker: string; to: string; before: string }> = [
  { ticker: "UA", to: "UAA", before: "2016-04-08" },
];

/** 归一 ticker：Wikipedia 用 BRK.B → 价格库用 BRK-B；再套 alias 表（eventDate 供复用 ticker 判别） */
export function normalizeSp500Ticker(raw: string, eventDate?: string): string | null {
  const t = raw.replace(/\./g, "-").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9-]{0,9}$/.test(t)) return null;
  if (eventDate) {
    for (const a of DATED_ALIASES) {
      if (a.ticker === t && eventDate < a.before) return a.to;
    }
  }
  return SP500_TICKER_ALIASES[t] ?? t;
}

/** 从整页 HTML 中切出指定 id 的 table 内容（含 <table> 起始到对应 </table>） */
export function sliceTableById(html: string, tableId: string): string | null {
  const idIdx = html.indexOf(`id="${tableId}"`);
  if (idIdx < 0) return null;
  const start = html.lastIndexOf("<table", idIdx);
  const end = html.indexOf("</table>", idIdx);
  if (start < 0 || end < 0) return null;
  return html.slice(start, end);
}

function stripHtml(html: string): string {
  return html
    .replace(/<sup[\s\S]*?<\/sup>/gi, "") // 去引用角标 [6]
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#91;/g, "[")
    .replace(/&#93;/g, "]")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const MONTHS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

/** "June 30, 2026" → "2026-06-30"；解析失败返回 null */
export function parseWikipediaDate(text: string): string | null {
  const m = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const month = MONTHS[m[1]!.toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[2]!.padStart(2, "0")}`;
}

/**
 * 解析 Selected changes 变更表（降序原样返回，Wikipedia 本身按日期降序）。
 * 只接受恰好 6 个 <td> 的数据行（Date/AddedTicker/AddedName/RemovedTicker/RemovedName/Reason）。
 */
export function parseWikipediaSp500Changes(html: string): Sp500Change[] {
  const table = sliceTableById(html, "changes");
  if (!table) throw new Error('未找到 id="changes" 变更表');
  const out: Sp500Change[] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(table)) !== null) {
    if (/<th[\s>]/i.test(m[1]!)) continue; // 表头
    const cells = [...m[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => stripHtml(c[1]!));
    if (cells.length !== 6) continue;
    const date = parseWikipediaDate(cells[0]!);
    if (!date) continue;
    const addedTicker = cells[1] ? normalizeSp500Ticker(cells[1], date) : null;
    const removedTicker = cells[3] ? normalizeSp500Ticker(cells[3], date) : null;
    if (!addedTicker && !removedTicker) continue;
    out.push({
      date,
      addedTicker,
      addedName: cells[2] || null,
      removedTicker,
      removedName: cells[4] || null,
      reason: cells[5] || null,
    });
  }
  return out;
}

export type MonthlyMembership = {
  /** 月末日 ISO */
  asOfDate: string;
  /** 现价库口径 symbol，升序 */
  symbols: string[];
};

export type RebuildWarning = { date: string; message: string };

function monthEndIso(year: number, month1: number): string {
  const d = new Date(Date.UTC(year, month1, 0)); // month1 的第 0 天 = 上月末
  return d.toISOString().slice(0, 10);
}

/**
 * 从当前成分按变更表反向回放，重建月末粒度历史成分。
 *
 * anchorDate：当前成分快照的抓取日（同页 HTML 的 constituents 表与 changes 表天然一致）；
 * 生效日 > anchorDate 的已公告未生效变更会被忽略。
 * fromMonth："YYYY-MM"，回放到该月月末为止（越早变更表越不完整，警告会变多）。
 *
 * 返回按 asOfDate 升序的完整月末名单（每个月末一份全量 set），
 * 以及回放中的不一致警告（undo 加入时 set 里没有 / undo 移出时 set 里已有——
 * 多半来自变更表缺行或未收录的改名）。
 */
export function rebuildMonthlyMembership(
  currentSymbols: string[],
  changes: Sp500Change[],
  opts: { anchorDate: string; fromMonth: string },
): { months: MonthlyMembership[]; warnings: RebuildWarning[] } {
  const warnings: RebuildWarning[] = [];
  const set = new Set(currentSymbols);

  // 升序排（回放时从尾部往回撤销）
  const eff = changes
    .filter((c) => c.date <= opts.anchorDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  const months: MonthlyMembership[] = [];
  const anchorY = Number(opts.anchorDate.slice(0, 4));
  const anchorM = Number(opts.anchorDate.slice(5, 7));
  const fromY = Number(opts.fromMonth.slice(0, 4));
  const fromM = Number(opts.fromMonth.slice(5, 7));

  let i = eff.length - 1;
  let y = anchorY;
  let mo = anchorM;
  // 从 anchor 所在月往回：先撤销 (月末, anchor] 内的变更得到该月末名单，逐月递推
  while (y > fromY || (y === fromY && mo >= fromM)) {
    const me = monthEndIso(y, mo);
    if (me < opts.anchorDate) {
      while (i >= 0 && eff[i]!.date > me) {
        const c = eff[i]!;
        if (c.addedTicker) {
          if (!set.delete(c.addedTicker)) {
            warnings.push({
              date: c.date,
              message: `undo add：${c.addedTicker} 不在名单（缺行/改名未收录？）`,
            });
          }
        }
        if (c.removedTicker) {
          if (set.has(c.removedTicker)) {
            warnings.push({ date: c.date, message: `undo remove：${c.removedTicker} 已在名单` });
          } else {
            set.add(c.removedTicker);
          }
        }
        i -= 1;
      }
      months.push({ asOfDate: me, symbols: [...set].sort() });
    }
    mo -= 1;
    if (mo === 0) {
      mo = 12;
      y -= 1;
    }
  }

  months.sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
  return { months, warnings };
}
