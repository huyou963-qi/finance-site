const TREASURY_FISCAL_BASE =
  "https://api.fiscaldata.treasury.gov/services/api/fiscal_service";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function parseTreasuryDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fiscalYearForCalendarDate(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return m >= 10 ? y + 1 : y;
}

export function calendarMonthName(iso: string): string {
  const m = Number(iso.slice(5, 7));
  return MONTH_NAMES[m - 1] ?? "";
}

type TreasuryRow = Record<string, string | null>;

export async function fetchTreasuryRows(
  endpoint: string,
  opts?: {
    apiFilters?: string;
    pageSize?: number;
    maxPages?: number;
  },
): Promise<TreasuryRow[]> {
  const pageSize = opts?.pageSize ?? 1000;
  const maxPages = opts?.maxPages ?? 50;
  const out: TreasuryRow[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const params = new URLSearchParams();
    params.set("page[size]", String(pageSize));
    params.set("page[number]", String(page));
    params.set("sort", "record_date");
    if (opts?.apiFilters) {
      for (const part of opts.apiFilters.split(",")) {
        const trimmed = part.trim();
        if (trimmed) params.append("filter", trimmed);
      }
    }

    const url = `${TREASURY_FISCAL_BASE}/${endpoint}?${params.toString()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Treasury HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      data?: TreasuryRow[];
      meta?: { "total-pages"?: number };
    };
    const batch = json.data ?? [];
    out.push(...batch);

    const totalPages = json.meta?.["total-pages"] ?? page;
    if (page >= totalPages || batch.length < pageSize) break;
  }

  return out;
}

export function parseTreasuryAmount(raw: string | null | undefined): number | null {
  if (raw == null || raw === "null" || raw === "") return null;
  const v = Number.parseFloat(raw);
  return Number.isFinite(v) ? v : null;
}

export function selectMts1FyMonthRow(rows: TreasuryRow[], recordDate: string): TreasuryRow | null {
  const fy = String(fiscalYearForCalendarDate(recordDate));
  const month = calendarMonthName(recordDate);
  const matches = rows.filter(
    (r) =>
      r.record_date === recordDate &&
      r.record_type_cd === "MTH" &&
      r.data_type_cd === "D" &&
      r.record_fiscal_year === fy &&
      r.classification_desc === month,
  );
  if (matches.length === 1) return matches[0]!;
  if (matches.length === 0) return null;
  return matches.sort((a, b) =>
    String(a.line_code_nbr ?? "").localeCompare(String(b.line_code_nbr ?? "")),
  )[matches.length - 1]!;
}
