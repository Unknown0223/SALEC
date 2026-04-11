/**
 * Kalendar oyining [start, end) oralig‘i UTC `Date` larda.
 * `timeZone` — IANA (masalan Asia/Tashkent).
 */
export function utcRangeForCalendarMonthContaining(instant: Date, timeZone: string): {
  startUtc: Date;
  endUtcExclusive: Date;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const read = (t: number) => {
    const parts = formatter.formatToParts(new Date(t));
    const map: Record<string, number> = {};
    for (const p of parts) {
      if (p.type !== "literal") map[p.type] = Number(p.value);
    }
    return {
      y: map.year!,
      m: map.month!,
      d: map.day!,
      h: map.hour!,
      mi: map.minute!,
      s: map.second!
    };
  };

  const keyOf = (g: ReturnType<typeof read>) =>
    g.y * 1e10 + g.m * 1e8 + g.d * 1e6 + g.h * 1e4 + g.mi * 100 + g.s;

  const utcInstantForWallClock = (y: number, m: number, d: number, h: number, mi: number, s: number): Date => {
    const want = { y, m, d, h, mi, s };
    const wantK = keyOf(want);
    let lo = Date.UTC(y, m - 1, d) - 14 * 24 * 3600 * 1000;
    let hi = Date.UTC(y, m - 1, d) + 14 * 24 * 3600 * 1000;
    for (let i = 0; i < 64; i++) {
      const mid = Math.floor((lo + hi) / 2);
      const gotK = keyOf(read(mid));
      if (gotK < wantK) lo = mid + 1;
      else hi = mid;
    }
    return new Date(lo);
  };

  const cur = read(instant.getTime());
  const startUtc = utcInstantForWallClock(cur.y, cur.m, 1, 0, 0, 0);
  const nextM = cur.m === 12 ? 1 : cur.m + 1;
  const nextY = cur.m === 12 ? cur.y + 1 : cur.y;
  const endUtcExclusive = utcInstantForWallClock(nextY, nextM, 1, 0, 0, 0);
  return { startUtc, endUtcExclusive };
}
