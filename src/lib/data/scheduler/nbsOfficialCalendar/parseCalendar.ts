import type { EconomicCalendarEvent } from "../economicCalendar/types";

export type NbsOfficialRelease = {
  title: string;
  releaseYear: number;
  releaseMonth: number;
  releaseDay: number;
  releaseHour: number;
  releaseMinute: number;
  /** 国家统计局表内时间是北京时间；此处统一为 UTC。 */
  releaseAt: Date;
};

type HtmlCell = { text: string; rowspan: number; colspan: number };

const PACKAGE_SCHEDULES: Record<
  string,
  { titles: string[]; releaseMonths?: number[] }
> = {
  "cn.nbs.pmi": { titles: ["采购经理指数月度报告"] },
  "cn.nbs.cpi": { titles: ["居民消费价格指数月度报告"] },
  "cn.nbs.ppi": { titles: ["工业生产者价格指数月度报告"] },
  "cn.nbs.industrial-production": { titles: ["规模以上工业生产月度报告"] },
  "cn.nbs.gdp": {
    titles: ["国民经济运行情况"],
    // 官方说明：1/4/7/10 月分别发布年度或季度国民经济运行情况。
    releaseMonths: [1, 4, 7, 10],
  },
  "cn.nbs.fixed-asset-investment": {
    titles: ["固定资产投资（不含农户）月度报告"],
  },
  "cn.nbs.retail-sales": { titles: ["社会消费品零售总额月度报告"] },
  "cn.nbs.real-estate": {
    // 同一发布包同时抓房地产开发月报和 70 城房价，取两张官方日程中较早者。
    titles: ["房地产开发和销售情况月度报告", "商品住宅销售价格指数月度报告"],
  },
};

function decodeHtml(raw: string): string {
  return raw
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) =>
      String.fromCodePoint(Number.parseInt(n, 16)),
    )
    .replace(/&nbsp;|&ensp;|&emsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

function cellText(raw: string): string {
  return decodeHtml(
    raw
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function positiveSpan(attrs: string, name: "rowspan" | "colspan"): number {
  const match = new RegExp(`${name}\\s*=\\s*["']?(\\d+)`, "i").exec(attrs);
  const value = Number(match?.[1] ?? 1);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function extractRows(tableHtml: string): HtmlCell[][] {
  const rows: HtmlCell[][] = [];
  for (const row of tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells: HtmlCell[] = [];
    for (const cell of row[1]!.matchAll(/<t[hd]\b([^>]*)>([\s\S]*?)<\/t[hd]>/gi)) {
      cells.push({
        text: cellText(cell[2] ?? ""),
        rowspan: positiveSpan(cell[1] ?? "", "rowspan"),
        colspan: positiveSpan(cell[1] ?? "", "colspan"),
      });
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

/** 展开 rowspan/colspan，确保月份始终位于第 3–14 列。 */
function expandRows(rows: HtmlCell[][]): string[][] {
  const pending = new Map<number, { text: string; remaining: number }>();
  const out: string[][] = [];
  for (const sourceRow of rows) {
    const row: string[] = [];
    for (const [column, span] of [...pending.entries()]) {
      row[column] = span.text;
      span.remaining -= 1;
      if (span.remaining <= 0) pending.delete(column);
    }
    let column = 0;
    for (const cell of sourceRow) {
      while (row[column] !== undefined) column += 1;
      for (let offset = 0; offset < cell.colspan; offset += 1) {
        const target = column + offset;
        row[target] = cell.text;
        if (cell.rowspan > 1) {
          pending.set(target, { text: cell.text, remaining: cell.rowspan - 1 });
        }
      }
      column += cell.colspan;
    }
    out.push(row);
  }
  return out;
}

function validChinaReleaseAt(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date | null {
  // 北京时间固定 UTC+8；国家统计局年历不涉及历史夏令时。
  const releaseAt = new Date(Date.UTC(year, month - 1, day, hour - 8, minute));
  const china = new Date(releaseAt.getTime() + 8 * 3_600_000);
  if (
    china.getUTCFullYear() !== year ||
    china.getUTCMonth() + 1 !== month ||
    china.getUTCDate() !== day ||
    china.getUTCHours() !== hour ||
    china.getUTCMinutes() !== minute
  ) {
    return null;
  }
  return releaseAt;
}

/** 官方年度 HTML 表 → 所有带明确日期与时刻的发布事件。 */
export function parseNbsOfficialCalendarPage(html: string): NbsOfficialRelease[] {
  const yearMatch = /(\d{4})年国家统计局主要统计信息发布日程表/.exec(cellText(html));
  if (!yearMatch) {
    throw new Error("国家统计局发布日程：无法识别日历年份（页面结构可能已变）");
  }
  const year = Number(yearMatch[1]);
  const tables = [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map(
    (match) => match[0],
  );
  const table = tables.find((candidate) => {
    const text = cellText(candidate);
    return text.includes("内容") && text.includes("1月") && text.includes("12月");
  });
  if (!table) {
    throw new Error("国家统计局发布日程：未找到 1–12 月官方日期表（页面结构可能已变）");
  }

  const rows = expandRows(extractRows(table));
  const releases: NbsOfficialRelease[] = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]!;
    if (!/^\d+$/.test(row[0] ?? "") || !(row[1] ?? "").trim()) continue;
    const title = row[1]!.trim();
    const timeRow = rows[rowIndex + 1] ?? [];
    for (let month = 1; month <= 12; month += 1) {
      const dateText = row[month + 1] ?? "";
      const dateMatches = [
        ...dateText.matchAll(/(\d{1,2})\s*\/\s*[一二三四五六日天]/g),
      ];
      if (!dateMatches.length) continue;
      const timeMatches = [
        ...(timeRow[month + 1] ?? "").matchAll(/(\d{1,2})\s*[:：]\s*(\d{2})/g),
      ];
      for (let index = 0; index < dateMatches.length; index += 1) {
        const day = Number(dateMatches[index]![1]);
        const time = timeMatches[index] ?? timeMatches[0];
        if (!time) continue;
        const hour = Number(time[1]);
        const minute = Number(time[2]);
        const releaseAt = validChinaReleaseAt(year, month, day, hour, minute);
        if (!releaseAt) continue;
        releases.push({
          title,
          releaseYear: year,
          releaseMonth: month,
          releaseDay: day,
          releaseHour: hour,
          releaseMinute: minute,
          releaseAt,
        });
      }
    }
  }

  if (!releases.some((release) => release.title === "采购经理指数月度报告")) {
    throw new Error("国家统计局发布日程：未解析到采购经理指数日期（页面结构可能已变）");
  }
  if (!releases.some((release) => release.title === "居民消费价格指数月度报告")) {
    throw new Error("国家统计局发布日程：未解析到居民消费价格日期（页面结构可能已变）");
  }
  return releases.sort((a, b) => a.releaseAt.getTime() - b.releaseAt.getTime());
}

export function isNbsOfficialPackage(packageId: string): boolean {
  return Object.hasOwn(PACKAGE_SCHEDULES, packageId);
}

export function nextNbsOfficialReleaseForPackage(
  releases: NbsOfficialRelease[],
  packageId: string,
  from: Date = new Date(),
): NbsOfficialRelease | null {
  const schedule = PACKAGE_SCHEDULES[packageId];
  if (!schedule) return null;
  const fromMs = from.getTime() - 60_000;
  return (
    releases.find(
      (release) =>
        schedule.titles.includes(release.title) &&
        (!schedule.releaseMonths || schedule.releaseMonths.includes(release.releaseMonth)) &&
        release.releaseAt.getTime() >= fromMs,
    ) ?? null
  );
}

export function nbsOfficialReleaseToCalendarEvent(
  release: NbsOfficialRelease,
): EconomicCalendarEvent {
  const date = `${release.releaseYear}-${String(release.releaseMonth).padStart(2, "0")}-${String(release.releaseDay).padStart(2, "0")}`;
  return {
    eventId: `nbs-official:${release.title}:${date}:${String(release.releaseHour).padStart(2, "0")}${String(release.releaseMinute).padStart(2, "0")}`,
    title: release.title,
    countryCode: "CN",
    releaseAt: release.releaseAt,
    importance: null,
    currency: null,
  };
}
