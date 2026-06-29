import type { ObservationPoint } from "../types";

export type WebScrapeConfig = {
  url: string;
  method?: "GET" | "POST";
  selector?: string;
  jsonPath?: string;
  valueParser?: "number";
  frequency?: string;
  notes?: string;
};

function readScrapeConfig(metadata: unknown): WebScrapeConfig | null {
  if (!metadata || typeof metadata !== "object") return null;
  const scrape = (metadata as Record<string, unknown>).scrape;
  if (!scrape || typeof scrape !== "object") return null;
  const s = scrape as Record<string, unknown>;
  const url = typeof s.url === "string" ? s.url.trim() : "";
  if (!url) return null;
  return {
    url,
    method: s.method === "POST" ? "POST" : "GET",
    selector: typeof s.selector === "string" ? s.selector : undefined,
    jsonPath: typeof s.jsonPath === "string" ? s.jsonPath : undefined,
    valueParser: "number",
    frequency: typeof s.frequency === "string" ? s.frequency : undefined,
    notes: typeof s.notes === "string" ? s.notes : undefined,
  };
}

function parseNumber(raw: string): number | null {
  const s = raw.replace(/[,%\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function pickJsonPath(obj: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** 从 Instrument.metadata.scrape 配置的 URL 抓取最新观测 */
export async function fetchWebScrapeIncremental(
  metadata: unknown,
  instrumentCode: string,
  obsStart: string,
): Promise<{
  points: ObservationPoint[];
  skippedInvalid: number;
  sourceLatestObsDate: Date | null;
}> {
  const cfg = readScrapeConfig(metadata);
  if (!cfg) {
    throw new Error(`WEB_SCRAPE 未配置 metadata.scrape：${instrumentCode}`);
  }

  const res = await fetch(cfg.url, {
    method: cfg.method ?? "GET",
    headers: {
      Accept: "application/json, text/html;q=0.9",
      "User-Agent": "finance-site-data-scheduler/1.0",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`抓取 HTTP ${res.status}: ${cfg.url}`);
  }

  const text = await res.text();
  let value: number | null = null;

  if (cfg.jsonPath) {
    try {
      const json = JSON.parse(text) as unknown;
      const raw = pickJsonPath(json, cfg.jsonPath);
      value = parseNumber(String(raw ?? ""));
    } catch {
      throw new Error(`JSON 解析失败：${instrumentCode}`);
    }
  } else {
    const m = text.match(/-?\d+(?:\.\d+)?/);
    value = m ? parseNumber(m[0]) : null;
  }

  if (value == null) {
    return { points: [], skippedInvalid: 0, sourceLatestObsDate: null };
  }

  const obsDate = new Date();
  obsDate.setUTCHours(0, 0, 0, 0);
  const start = new Date(`${obsStart}T00:00:00.000Z`);
  if (obsDate < start) {
    return { points: [], skippedInvalid: 0, sourceLatestObsDate: obsDate };
  }

  return {
    points: [{ obsDate, value }],
    skippedInvalid: 0,
    sourceLatestObsDate: obsDate,
  };
}
