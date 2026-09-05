/**
 * 解析 AAR 铁路周度新闻稿 —— 归档列表页 + 单篇正文页。
 *
 * 归档列表（.data/aar-weekly-traffic-archive-page1-sample.html 核实，2026-09）：
 *   <li class="news-item"><a href="{url}" class="news-item__link">
 *     <div class="news-item__title">{title}</div>...</a></li>
 *   title 含 "Week Ending {Month D, YYYY}"；2019 年以前的旧格式标题为
 *   "RAIL TRAFFIC WEEK OF {Month D, YYYY}"（无 "Week Ending" 字样，正文句式未核实），
 *   一律跳过不纳入回填（不 throw，只是列表发现阶段的书目筛选，非数据写入）。
 *
 * 正文页（.data/aar-weekly-traffic-week-sample.html 2026-08-22 与
 * .data/aar-weekly-traffic-week-2019-sample.html 2019-03-23 交叉核实，句式 2019-01 起稳定）：
 *   "...reported U.S. rail traffic for the week ending {Month D, YYYY}."
 *   "Total carloads for the week ending {Month D} were {N,NNN} carloads..."
 *   "...U.S. weekly intermodal volume was {N,NNN} containers and trailers..."
 *
 * 防御（正文页）：三处锚点任一缺失、日期不合法/未来一律 throw，让 fetch_run 记 FAILED
 * 触发告警，绝不写入可疑值（源站改版时报错而非静默取错）。
 */

const MONTH_INDEX: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

function parseMonthDayYear(text: string): Date | null {
  const m = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(text);
  if (!m) return null;
  const month = MONTH_INDEX[m[1]!.toLowerCase()];
  if (month == null) return null;
  const day = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(Date.UTC(year, month, day));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export type AarArchiveListItem = {
  url: string;
  title: string;
  weekEndingDate: Date | null;
};

export function parseAarArchiveListPage(html: string): AarArchiveListItem[] {
  const items: AarArchiveListItem[] = [];
  const liRe = /<li class="news-item">([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = liRe.exec(html))) {
    const block = m[1]!;
    const hrefM = /<a href="([^"]+)" class="news-item__link">/.exec(block);
    const titleM = /<div class="news-item__title">([^<]+)<\/div>/.exec(block);
    if (!hrefM || !titleM) continue;
    const title = titleM[1]!.trim();
    const weekEndingM = /Week Ending\s+([A-Za-z]+\s+\d{1,2},\s*\d{4})/i.exec(title);
    items.push({
      url: hrefM[1]!.trim(),
      title,
      weekEndingDate: weekEndingM ? parseMonthDayYear(weekEndingM[1]!) : null,
    });
  }
  if (items.length === 0) {
    throw new Error("AAR 归档列表：0 个条目（页面结构可能已变，未找到 news-item 锚点）");
  }
  return items;
}

/** 归档列表分页链接（`page/{n}/`）中的最大页码，用于判断是否已到最后一页 */
export function parseAarArchiveMaxPage(html: string): number {
  const matches = [...html.matchAll(/weekly-rail-traffic-data\/page\/(\d+)\//gi)];
  if (matches.length === 0) return 1;
  return Math.max(...matches.map((m) => Number(m[1])));
}

export type ParsedAarWeeklyRelease = {
  weekEndingDate: Date;
  carloads: number;
  intermodal: number;
};

export function parseAarWeeklyReleasePage(html: string): ParsedAarWeeklyRelease {
  const dateM =
    /reported U\.S\. rail traffic for the week ending\s+([A-Za-z]+\s+\d{1,2},\s*\d{4})/i.exec(
      html,
    );
  if (!dateM) {
    throw new Error("AAR 周度新闻稿：未找到 week-ending 日期锚点（正文结构可能已变）");
  }
  const weekEndingDate = parseMonthDayYear(dateM[1]!);
  if (!weekEndingDate) {
    throw new Error(`AAR 周度新闻稿：week-ending 日期无法解析（${dateM[1]}）`);
  }
  if (weekEndingDate.getTime() > Date.now() + 86_400_000) {
    throw new Error(`AAR 周度新闻稿：出现未来日期 ${dateM[1]}（源数据异常，拒绝写入）`);
  }

  const carloadsM = /Total carloads for the week ending[^,]+were\s+([\d,]+)\s+carloads/i.exec(
    html,
  );
  if (!carloadsM) {
    throw new Error("AAR 周度新闻稿：未找到 carloads 锚点（正文结构可能已变）");
  }
  const carloads = Number(carloadsM[1]!.replace(/,/g, ""));
  if (!Number.isFinite(carloads) || carloads <= 0) {
    throw new Error(`AAR 周度新闻稿：carloads 数值解析失败（${carloadsM[1]}）`);
  }

  const intermodalM = /U\.S\. weekly intermodal volume was\s+([\d,]+)\s+containers and trailers/i.exec(
    html,
  );
  if (!intermodalM) {
    throw new Error("AAR 周度新闻稿：未找到 intermodal 锚点（正文结构可能已变）");
  }
  const intermodal = Number(intermodalM[1]!.replace(/,/g, ""));
  if (!Number.isFinite(intermodal) || intermodal <= 0) {
    throw new Error(`AAR 周度新闻稿：intermodal 数值解析失败（${intermodalM[1]}）`);
  }

  return { weekEndingDate, carloads, intermodal };
}
