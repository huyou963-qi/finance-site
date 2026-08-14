/**
 * 把指定 IANA 时区的墙上时钟转成 UTC Date（无第三方库）。
 * ISM 发布时刻为 America/New_York 10:00。
 */
export function civilTimeInZoneToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const asUtcMs = (ms: number): number => {
    const parts = dtf.formatToParts(new Date(ms));
    const get = (type: Intl.DateTimeFormatPartTypes): number => {
      const v = parts.find((p) => p.type === type)?.value;
      return Number(v);
    };
    let h = get("hour");
    if (h === 24) h = 0;
    return Date.UTC(get("year"), get("month") - 1, get("day"), h, get("minute"), get("second"));
  };

  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = target;
  for (let i = 0; i < 4; i++) {
    guess += target - asUtcMs(guess);
  }
  return new Date(guess);
}
