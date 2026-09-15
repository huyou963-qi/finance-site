import type { ObservationPoint } from "../types";
import {
  JP_CUSTOMS_TRADE_HISTORY_START,
  JP_CUSTOMS_TRADE_SERIES,
} from "./catalog";

function parsePositiveInteger(raw: string, label: string) {
  const normalized = raw.trim();
  if (!/^\d+$/.test(normalized)) throw new Error(`Japan Customs invalid ${label}: ${raw}`);
  const value = Number(normalized);
  if (!Number.isSafeInteger(value) || value < 0 || value > 50_000_000_000) {
    throw new Error(`Japan Customs implausible ${label}: ${raw}`);
  }
  return value;
}

/**
 * Parse the official world monthly time-series CSV. The file is Shift-JIS and
 * contains zero-filled future months. Those placeholders are excluded. Values
 * are converted from thousand yen to 100 million yen. Trade balance is derived
 * exactly as exports minus imports from the two official total columns.
 */
export function parseJpCustomsTradeCsv(
  text: string,
  now = new Date(),
  minimumPoints = 500,
) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (!lines.slice(0, 5).some((line) => line.includes("WORLD  Monthly Data  (a thousand yen)"))) {
    throw new Error("Japan Customs world monthly title or unit changed");
  }
  if (!lines.slice(0, 6).some((line) => line.trim() === "Years/Months,Exp-Total,Imp-Total")) {
    throw new Error("Japan Customs selected columns changed");
  }
  const output: Record<string, ObservationPoint[]> = Object.fromEntries(
    JP_CUSTOMS_TRADE_SERIES.map((series) => [series.instrumentCode, []]),
  );
  let previousDate = 0;
  let reachedPlaceholder = false;
  for (const line of lines) {
    const cells = line.split(",");
    const match = /^(\d{4})\/(\d{2})$/.exec(cells[0]?.trim() ?? "");
    if (!match) continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12 || cells.length < 3) throw new Error("Japan Customs malformed monthly row");
    const obsDate = new Date(Date.UTC(year, month - 1, 1));
    const exportsThousandYen = parsePositiveInteger(cells[1], "exports");
    const importsThousandYen = parsePositiveInteger(cells[2], "imports");
    if (exportsThousandYen === 0 && importsThousandYen === 0) {
      reachedPlaceholder = true;
      continue;
    }
    if (reachedPlaceholder) throw new Error("Japan Customs nonzero data after future placeholder");
    if (obsDate > now) throw new Error("Japan Customs future nonzero observation");
    if (exportsThousandYen === 0 || importsThousandYen === 0) {
      throw new Error("Japan Customs one-sided zero monthly total");
    }
    if (previousDate) {
      const previous = new Date(previousDate);
      const expected = Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 1);
      if (obsDate.getTime() !== expected) throw new Error("Japan Customs monthly history has a gap");
    }
    previousDate = obsDate.getTime();
    const exports = exportsThousandYen / 100_000;
    const imports = importsThousandYen / 100_000;
    output.customs_jp_trade_exports_total_nsa.push({ obsDate, value: exports });
    output.customs_jp_trade_imports_total_nsa.push({ obsDate, value: imports });
    output.customs_jp_trade_balance_nsa.push({ obsDate, value: exports - imports });
  }
  for (const [code, points] of Object.entries(output)) {
    if (points.length < minimumPoints) throw new Error(`Japan Customs history truncated: ${code}`);
    if (points[0]?.obsDate.toISOString().slice(0, 10) !== JP_CUSTOMS_TRADE_HISTORY_START) {
      throw new Error(`Japan Customs history start changed: ${code}`);
    }
    if (points.at(-1)?.obsDate.getTime() !== previousDate) {
      throw new Error(`Japan Customs latest month mismatch: ${code}`);
    }
  }
  return output;
}
