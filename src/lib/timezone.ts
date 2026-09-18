/**
 * Single hardcoded timezone for the whole app — every store is in Brazil.
 * NOT store-configurable by design (revisit if a non-Brazilian store ever
 * onboards). Brazil has had no DST since 2019, so the offset is a fixed
 * UTC-3, but this still goes through Intl's real tz database rather than a
 * hardcoded offset, so it stays correct if that policy ever changes.
 *
 * Pure module (no `server-only`, no firebase-admin) — shared by the app
 * (Server + Client Components, `server-only` data layer) and the seed /
 * bootstrap scripts, which run under plain `tsx`.
 */

export const STORE_TIME_ZONE = "America/Sao_Paulo";

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: STORE_TIME_ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Y/M/D/H/M/S of `d` as a wall clock in STORE_TIME_ZONE. */
export function zonedParts(d: Date): ZonedParts {
  const found: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(d)) {
    if (p.type !== "literal") found[p.type] = p.value;
  }
  return {
    year: Number(found.year),
    month: Number(found.month),
    day: Number(found.day),
    hour: Number(found.hour) % 24, // defensive: some ICU builds report midnight as "24"
    minute: Number(found.minute),
    second: Number(found.second),
  };
}

/**
 * UTC instant for a wall-clock Y/M/D[/H/M/S] in STORE_TIME_ZONE. Month/day
 * may overflow or underflow (e.g. month 13, month -4) — Date.UTC normalizes
 * them, which addZonedMonths relies on.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const p = zonedParts(guess);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return new Date(guess.getTime() - (asUTC - guess.getTime()));
}

/** "2026-07" for `d`'s calendar month in STORE_TIME_ZONE. THE canonical monthKey. */
export function monthKey(d: Date): string {
  const { year, month } = zonedParts(d);
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** UTC instant for 00:00:00 of `d`'s calendar day in STORE_TIME_ZONE. */
export function startOfZonedDay(d: Date): Date {
  const { year, month, day } = zonedParts(d);
  return zonedTimeToUtc(year, month, day);
}

/**
 * UTC instant for day 1, 00:00:00 of the month `delta` months from `d`'s
 * zoned month (delta=0 -> this month's start, -1 -> last month's start).
 */
export function addZonedMonths(d: Date, delta: number): Date {
  const { year, month } = zonedParts(d);
  return zonedTimeToUtc(year, month + delta, 1);
}
