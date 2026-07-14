/**
 * Wikipedia List of S&P 500 companies → 成分 + GICS sector / sub-industry。
 */

export type WikipediaSp500Row = {
  symbol: string;
  name: string;
  sector: string;
  subIndustry: string;
};

const WIKI_API =
  "https://en.wikipedia.org/w/api.php?action=parse&page=List_of_S%26P_500_companies&prop=text&format=json&origin=*";

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 解析 Wikipedia parse API 返回的 HTML 表格行 */
export function parseWikipediaSp500Html(html: string): WikipediaSp500Row[] {
  const rows: WikipediaSp500Row[] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(html)) !== null) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
      stripHtml(c[1]),
    );
    if (cells.length < 4) continue;
    const symbol = cells[0]!.replace(/\./g, "-").toUpperCase();
    // Wikipedia 用 BRK.B；允许字母数字与连字符
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) continue;
    rows.push({
      symbol,
      name: cells[1]!,
      sector: cells[2]!,
      subIndustry: cells[3]!,
    });
  }
  return rows;
}

export async function fetchWikipediaSp500(
  retries = 3,
): Promise<WikipediaSp500Row[]> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(WIKI_API, {
        headers: {
          "User-Agent": "finance-site/1.0 (equity sector seed; local)",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
      const data = (await res.json()) as {
        parse?: { text?: { "*": string } };
      };
      const html = data?.parse?.text?.["*"] ?? "";
      const rows = parseWikipediaSp500Html(html);
      if (rows.length < 400) {
        throw new Error(`Wikipedia 解析行数过少: ${rows.length}`);
      }
      return rows;
    } catch (e) {
      lastError = e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? "Wikipedia fetch failed"));
}
