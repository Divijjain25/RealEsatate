// All times are stored in UTC and shown in India Standard Time (UTC+05:30,
// no daylight saving), which is what every agency uses in the MVP.

export const IST_TIMEZONE = "Asia/Kolkata";
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

// "2026-10-27T15:30" from <input type="datetime-local">, read as IST.
export function parseIstLocal(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const utcMs = Date.UTC(y, mo - 1, d, h, mi) - IST_OFFSET_MS;
  const date = new Date(utcMs);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ISO timestamp → "2026-10-27T15:30" (IST) to prefill a datetime-local input.
export function toIstLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const ist = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  return ist.toISOString().slice(0, 16);
}

// Start (inclusive) and end (exclusive) of the IST calendar day containing `now`.
export function istDayRange(now: Date): { start: Date; end: Date } {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const startUtcMs = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS;
  return { start: new Date(startUtcMs), end: new Date(startUtcMs + 24 * 60 * 60 * 1000) };
}

const dateTimeFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIMEZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIMEZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatIstDateTime(iso: string | null | undefined): string {
  return iso ? dateTimeFormat.format(new Date(iso)) : "—";
}

export function formatIstDate(iso: string | null | undefined): string {
  return iso ? dateFormat.format(new Date(iso)) : "—";
}
