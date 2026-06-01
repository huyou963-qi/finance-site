/** 解析 TWS historicalData 的 time 字段为 Unix 秒 */
export function parseIbkrTwsBarTimeToUnix(time: string): number | null {
  if (!time || time.startsWith("finished")) return null;
  const t = time.trim();

  const ymd = t.match(/^(\d{4})(\d{2})(\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/);
  if (ymd) {
    return Math.floor(
      Date.UTC(
        parseInt(ymd[1]!, 10),
        parseInt(ymd[2]!, 10) - 1,
        parseInt(ymd[3]!, 10),
        ymd[4] != null ? parseInt(ymd[4]!, 10) : 0,
        ymd[5] != null ? parseInt(ymd[5]!, 10) : 0,
        ymd[6] != null ? parseInt(ymd[6]!, 10) : 0,
      ) / 1000,
    );
  }

  if (/^\d+$/.test(t)) {
    const n = parseInt(t, 10);
    if (n >= 946684800 && n <= 4102444800) return n;
    if (n > 1e12) return Math.floor(n / 1000);
  }

  const m = t.match(/^(\d{4})(\d{2})(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (m) {
    return Math.floor(
      Date.UTC(
        parseInt(m[1]!, 10),
        parseInt(m[2]!, 10) - 1,
        parseInt(m[3]!, 10),
        parseInt(m[4]!, 10),
        parseInt(m[5]!, 10),
        parseInt(m[6]!, 10),
      ) / 1000,
    );
  }

  const ms = Date.parse(t.replace(" ", "T") + "Z");
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}
